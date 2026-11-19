// UI check: before/after compare (S1, split plan).
//
//   npm run ui-check -- --snapshot ui-check-out/before        save every step's page as normalized HTML
//   npm run ui-check -- --no-build --compare ui-check-out/before   walk again and report the steps that differ
//
// Both modes freeze the clock (frozen.cjs, clockScript below) and give the fake database's
// rows fixed ids (ids.mjs), so two runs of the same code draw the same page. What's left
// that changes from run to run is taken out of the saved HTML by normalizeDom: React's
// generated ids, server-action ids, row ids the app makes itself, animation-driven inline
// styles and anything inside [data-clock]. A difference after that means the screen changed.
import { readdirSync, readFileSync, existsSync } from "node:fs";

/** Runs in the page before anything else: the same "now" and the same Math.random as the server. */
export function clockScript({ at, seed }) {
  if (window.__uiCheckFrozen) return;
  window.__uiCheckFrozen = true;
  const Real = Date;
  const now = () => at;
  function FrozenDate(...a) {
    if (!new.target) return new Real(now()).toString();
    return a.length ? new Real(...a) : new Real(now());
  }
  FrozenDate.prototype = Real.prototype;
  FrozenDate.now = now;
  FrozenDate.parse = Real.parse;
  FrozenDate.UTC = Real.UTC;
  Object.defineProperty(Real.prototype, "constructor", { value: FrozenDate, writable: true, configurable: true });
  window.Date = FrozenDate;
  let s = seed >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Runs in the page: the page as text, one element or text run per line, indented by depth,
 * with everything that changes between two runs of the same code taken out.
 */
export function normalizeDom() {
  // next-route-announcer reads the title out a moment after each navigation: timing, not the screen.
  const SKIP = new Set(["SCRIPT", "STYLE", "LINK", "NOSCRIPT", "TEMPLATE", "META", "BASE", "NEXT-ROUTE-ANNOUNCER"]);
  const DROP_ATTRS = new Set(["nonce", "data-reactroot", "data-precedence", "data-href", "data-ui-check-overlay", "data-nextjs-scroll-focus-boundary"]);
  // Inline style properties that animations, transitions and drags move.
  const MOVING = /^(transform|translate|scale|rotate|opacity|transition|transition-[\w-]+|animation|animation-[\w-]+|will-change|filter|offset-[\w-]+|--(anim|drag|t|p|progress|x|y)[\w-]*)$/;
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const uuids = new Map();
  const norm = (v) =>
    v
      // React useId (19: «r1» / _R_abc_; older :r1:)
      .replace(/«[^»]*»|:r[0-9a-z]+:|_R_[A-Za-z0-9_]+_?/g, "#rid")
      // dnd-kit numbers its screen-reader regions in the order the lists mount
      .replace(/\b(DndLiveRegion|DndDescribedBy)-\d+/g, "$1-#")
      // server action ids move when an action moves file
      .replace(/\$ACTION_(ID|REF|KEY)_[\w:]+/g, "$ACTION_$1_#")
      .replace(/\b[0-9a-f]{40,42}\b/g, "#action")
      // rows the app made itself get random ids: number them by first appearance instead
      .replace(UUID, (u) => {
        if (/^00000000-0000-4000-8/.test(u)) return u;
        if (!uuids.has(u.toLowerCase())) uuids.set(u.toLowerCase(), `uuid-${uuids.size + 1}`);
        return uuids.get(u.toLowerCase());
      })
      // build hashes in asset names (a split renames chunks)
      .replace(/(\/_next\/static\/[\w/-]+?)[.-][0-9a-f]{8,}(\.\w+)/g, "$1$2")
      .replace(/\s+/g, " ")
      .trim();
  const style = (v) =>
    v
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .filter((d) => !MOVING.test(d.split(":")[0].trim().toLowerCase()))
      // sub-pixel positions from measured layout differ by rounding only
      .map((d) => d.replace(/(-?\d+\.\d+)(px|%|rem|em)?/g, (_, n, u = "") => `${Math.round(Number(n))}${u}`))
      .join("; ");
  const out = [];
  const visit = (node, depth) => {
    const pad = "  ".repeat(depth);
    if (node.nodeType === 3) {
      const t = norm(node.textContent || "");
      if (t) out.push(`${pad}"${t}"`);
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node;
    if (SKIP.has(el.tagName)) return;
    if (el.hasAttribute("data-ui-check-overlay")) return;
    const attrs = [...el.attributes]
      .filter((a) => !DROP_ATTRS.has(a.name))
      .map((a) => {
        let v = a.name === "style" ? style(a.value) : norm(a.value);
        if (a.name === "style" && !v) return null;
        return `${a.name}="${v}"`;
      })
      .filter(Boolean)
      .sort();
    const tag = el.tagName.toLowerCase();
    // form fields: what's typed is part of the screen
    // React's bound server-action arguments are encrypted with a fresh IV each render
    if (tag === "input" && el.type === "hidden" && /^\$ACTION_/.test(el.getAttribute("name") || "")) {
      const i = attrs.findIndex((a) => a.startsWith("value="));
      if (i >= 0) attrs[i] = 'value="#"';
    }
    if ((tag === "input" || tag === "textarea") && el.type !== "hidden" && el.type !== "password") attrs.push(`value=“${norm(String(el.value ?? ""))}”`);
    if (tag === "input" && (el.type === "checkbox" || el.type === "radio")) attrs.push(`checked=${el.checked}`);
    out.push(`${pad}<${tag}${attrs.length ? " " + attrs.join(" ") : ""}>`);
    if (el.hasAttribute("data-clock")) return;
    const kids = el.shadowRoot ? el.shadowRoot.childNodes : el.childNodes;
    for (const k of kids) visit(k, depth + 1);
  };
  out.push(`title: ${norm(document.title)}`);
  visit(document.documentElement, 0);
  return out.join("\n") + "\n";
}

/** The ancestor lines of line i (by indent), outermost first, for the report. */
function pathTo(lines, i) {
  const path = [];
  let indent = lines[i].search(/\S/);
  for (let j = i - 1; j >= 0 && indent > 0; j--) {
    const ind = lines[j].search(/\S/);
    if (ind < indent && lines[j].trimStart().startsWith("<")) {
      const m = lines[j].trim().match(/^<(\w+)(?:.*?\bclass="([^"]*)")?/);
      path.unshift(m ? m[1] + (m[2] ? "." + m[2].split(" ").slice(0, 2).join(".") : "") : lines[j].trim().slice(0, 40));
      indent = ind;
    }
  }
  return path.slice(-6).join(" > ");
}

/** Compares two snapshot folders. Returns { same, differ: [{ key, line, path, before, after, count }], onlyBefore, onlyAfter }. */
export function compareSnapshots(beforeDir, afterDir) {
  const list = (d) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".html.txt")).map((f) => f.replace(/\.html\.txt$/, "")) : []);
  const a = new Set(list(beforeDir));
  const b = new Set(list(afterDir));
  const res = { same: 0, differ: [], onlyBefore: [...a].filter((k) => !b.has(k)), onlyAfter: [...b].filter((k) => !a.has(k)) };
  for (const key of [...a].filter((k) => b.has(k)).sort()) {
    const x = readFileSync(`${beforeDir}/${key}.html.txt`, "utf8").split("\n");
    const y = readFileSync(`${afterDir}/${key}.html.txt`, "utf8").split("\n");
    let i = 0;
    while (i < x.length && i < y.length && x[i] === y[i]) i++;
    if (i === x.length && i === y.length) {
      res.same++;
      continue;
    }
    // how many lines differ (rough: lines in one and not the other)
    const cx = new Map();
    for (const l of x) cx.set(l, (cx.get(l) || 0) + 1);
    let count = 0;
    for (const l of y) {
      if (cx.get(l)) cx.set(l, cx.get(l) - 1);
      else count++;
    }
    for (const v of cx.values()) count += v;
    res.differ.push({
      key,
      line: i + 1,
      path: pathTo(i < y.length ? y : x, Math.min(i, (i < y.length ? y : x).length - 1)),
      before: (x[i] ?? "(ends here)").trim().slice(0, 240),
      after: (y[i] ?? "(ends here)").trim().slice(0, 240),
      count,
    });
  }
  return res;
}
