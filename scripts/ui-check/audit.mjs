// In-page checks for the UI check. Everything in this file runs inside the
// browser (page.evaluate / addInitScript), so it can't use imports.

/** Installed before any page script: records layout shifts and jank. */
export function installRecorders() {
  window.__uiShifts = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput || e.value < 0.001) continue;
        const describe = (n) => {
          if (!n || n.nodeType !== 1) return "?";
          const label = (n.getAttribute("aria-label") || n.innerText || "").trim().replace(/\s+/g, " ").slice(0, 50);
          return `<${n.tagName.toLowerCase()}>${label ? ` "${label}"` : ""}`;
        };
        window.__uiShifts.push({
          at: Math.round(e.startTime),
          value: e.value,
          path: location.pathname,
          sources: (e.sources || []).slice(0, 3).map((s) => ({ node: describe(s.node), dy: Math.round(s.currentRect.y - s.previousRect.y), dh: Math.round(s.currentRect.height - s.previousRect.height) })),
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch {}
}

/**
 * Looks at the page as it stands and returns the problems it can see.
 * opts: { label, kbHeight (simulated keyboard height, 0 = none), ignore: [selectors] }
 */
export function auditPage(opts) {
  const W = document.documentElement.clientWidth;
  const vv = window.visualViewport;
  const H = opts.kbHeight ? window.innerHeight - opts.kbHeight : vv ? vv.height : window.innerHeight;
  const issues = [];
  const IGNORE = ["[data-ui-check-overlay]", "[data-ui-check-ignore]", ...(opts.ignore || [])].join(",");

  const isIgnored = (el) => !!el.closest(IGNORE);
  const visible = (el) => {
    if (!el.checkVisibility || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const textOf = (el) => (el.getAttribute?.("aria-label") || el.getAttribute?.("title") || el.innerText || el.value || el.placeholder || el.getAttribute?.("alt") || "").trim().replace(/\s+/g, " ");
  const describe = (el) => {
    if (!el || el.nodeType !== 1) return "?";
    const t = textOf(el).slice(0, 48);
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role");
    const cls = [...el.classList].filter((c) => /^[a-z][\w-]*$/.test(c) && c.length > 3 && !/^(flex|grid|block|inline|items|justify|gap|rounded|shrink|relative|absolute|fixed|text|font|leading|border|shadow|overflow|cursor|transition|select|pointer|touch|min|max)/.test(c)).slice(0, 2);
    return `<${tag}${role ? ` role=${role}` : ""}${cls.length ? ` .${cls.join(".")}` : ""}>${t ? ` "${t}"` : ""}`;
  };
  const style = (el) => getComputedStyle(el);
  const isInteractive = (el) => el.matches("button, a[href], input:not([type=hidden]), textarea, select, [role=button], [role=tab], [role=menuitem], [role=checkbox], [role=switch], [contenteditable=true]");
  const hasOwnText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
  const add = (kind, severity, el, detail, extra = {}) => {
    issues.push({ kind, severity, target: describe(el), detail, rect: rectOf(el), ...extra });
  };
  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const fixedRoot = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const p = style(n).position;
      if (p === "fixed") return n;
    }
    return null;
  };

  const all = [...document.body.querySelectorAll("*")].filter((el) => !isIgnored(el) && !["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "svg", "path", "g", "BR"].includes(el.tagName) && !el.closest("svg > *"));
  const shown = all.filter(visible);
  const meaningful = shown.filter((el) => isInteractive(el) || hasOwnText(el));

  // 1. Off the screen sideways (the page scrolls sideways, or it's cut at the edge).
  const docOverflow = document.documentElement.scrollWidth - W;
  if (docOverflow > 1) issues.push({ kind: "page-scrolls-sideways", severity: "error", target: "<html>", detail: `page is ${docOverflow}px wider than the screen`, rect: null });
  const reported = new Set();
  for (const el of meaningful) {
    const r = el.getBoundingClientRect();
    const over = Math.max(r.right - W, -r.left);
    if (over <= 4) continue;
    // Clipped by a scroll box or an overflow-hidden ancestor that itself is on screen? Then it's not the screen edge.
    let clippedByBox = false;
    for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      const s = style(a);
      if (s.overflowX !== "visible") {
        const ar = a.getBoundingClientRect();
        if (ar.right <= W + 1 && ar.left >= -1) clippedByBox = true;
        break;
      }
    }
    if (clippedByBox) continue;
    if ([...reported].some((p) => p.contains(el))) continue;
    reported.add(el);
    add("off-screen-edge", "error", el, `${Math.round(over)}px past the ${r.right > W ? "right" : "left"} edge`);
  }
  const canScrollEl = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const s = style(a);
      if (/auto|scroll/.test(s.overflowY) && a.scrollHeight > a.clientHeight + 2) return true;
    }
    return false;
  };
  // Fixed things (popups, bubbles, sheets) cut off at the top or bottom (or under the keyboard).
  for (const el of meaningful) {
    const root = fixedRoot(el);
    if (!root) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= H + (opts.kbHeight || 0)) continue; // wholly away: a closed drawer, a parked item
    if (canScrollEl(el)) continue; // inside a scroll box: scrolling brings it into view
    const top = -r.top, bottom = r.bottom - H;
    if (top > 2 || bottom > 2) {
      if ([...reported].some((p) => p.contains(el))) continue;
      reported.add(el);
      const under = opts.kbHeight && bottom > 2 && r.top < H + opts.kbHeight;
      if (under && (!isInteractive(el) || canScrollEl(el))) continue;
      add(under ? "under-keyboard" : "off-screen-edge", under ? "warn" : "error", el, top > 2 ? `${Math.round(top)}px above the top of the screen` : under ? `${Math.round(bottom)}px hidden behind the keyboard` : `${Math.round(bottom)}px below the bottom of the screen`);
    }
  }

  // 2. Cut off inside a box (overflow hidden), or text cut without an ellipsis.
  for (const el of meaningful) {
    const r = el.getBoundingClientRect();
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const s = style(a);
      const ox = s.overflowX, oy = s.overflowY;
      if (ox === "visible" && oy === "visible") continue;
      const scrollable = /auto|scroll/.test(ox) || /auto|scroll/.test(oy);
      if (scrollable) break; // it can be scrolled into view
      const ar = a.getBoundingClientRect();
      const cut = Math.max(oy !== "visible" ? ar.top - r.top : 0, oy !== "visible" ? r.bottom - ar.bottom : 0, ox !== "visible" ? ar.left - r.left : 0, ox !== "visible" ? r.right - ar.right : 0);
      const inter = Math.max(0, Math.min(r.right, ar.right) - Math.max(r.left, ar.left)) * Math.max(0, Math.min(r.bottom, ar.bottom) - Math.max(r.top, ar.top));
      // Wholly hidden (a closed drawer) is fine; partly hidden is the bug.
      if (cut > 3 && inter > 0 && inter < r.width * r.height * 0.97) {
        if (![...reported].some((p) => p.contains(el) || el.contains(p))) {
          reported.add(el);
          add("clipped", isInteractive(el) ? "error" : "warn", el, `${Math.round(cut)}px cut off by ${describe(a)}`);
        }
      }
      break;
    }
    const s = style(el);
    if ((s.overflowX === "hidden" || s.overflowX === "clip") && s.textOverflow !== "ellipsis" && hasOwnText(el) && el.scrollWidth > el.clientWidth + 2 && !el.querySelector("img,svg,canvas")) {
      if (!reported.has(el)) {
        reported.add(el);
        add("text-cut", "warn", el, `text is ${el.scrollWidth - el.clientWidth}px wider than its box (no …)`);
      }
    }
  }

  // 3. Covered: something floating sits on a button or text.
  //    A fixed/sticky thing (bar, floating button, foot) only counts when the
  //    page (or the box it's in) can't be scrolled to bring the item out from
  //    under it. Things that move with the content (the perched bird, a
  //    bubble) count wherever they sit. Popups and backdrops are meant to cover.
  const big = (r) => r.width * r.height > W * H * 0.55;
  const scrollerOf = (el) => {
    for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      const s = style(a);
      if (/auto|scroll/.test(s.overflowY) && a.scrollHeight > a.clientHeight + 2) return a;
    }
    return document.scrollingElement;
  };
  const canScroll = (sc, down) => (down ? sc.scrollTop + sc.clientHeight < sc.scrollHeight - 4 : sc.scrollTop > 4);
  const groups = new Map();
  const behind = new Map();
  for (const el of meaningful) {
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) continue;
    const pts = [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + r.width * 0.2, r.top + r.height * 0.3],
      [r.left + r.width * 0.8, r.top + r.height * 0.3],
      [r.left + r.width * 0.2, r.top + r.height * 0.7],
      [r.left + r.width * 0.8, r.top + r.height * 0.7],
    ].filter(([x, y]) => x >= 0 && x < W && y >= 0 && y < H);
    if (!pts.length) continue;
    let hits = 0, who = null;
    for (const [x, y] of pts) {
      const h = document.elementFromPoint(x, y);
      if (!h || el.contains(h) || h.contains(el) || isIgnored(h)) continue;
      const dlg = h.closest("[role=dialog],[role=menu],[role=listbox],[role=alertdialog],[aria-modal=true],[popover]");
      if (dlg && !dlg.contains(el)) continue; // a popup over the page is meant to cover it
      // A popup or menu drawn underneath the page around it (the reach picker under Daily Habits, Nov 1).
      const pop = el.closest("[role=dialog],[role=menu],[role=listbox],[role=tooltip]");
      if (pop && !pop.contains(h) && !h.contains(pop) && /absolute|fixed/.test(style(pop).position) && !big(pop.getBoundingClientRect())) {
        const b = behind.get(pop) || { h, n: 0 };
        b.n++;
        behind.set(pop, b);
        continue;
      }
      // Find the floating thing doing the covering.
      let f = null;
      for (let n = h; n && n !== document.body; n = n.parentElement) {
        if (n.contains(el)) break;
        const p = style(n).position;
        if (p === "fixed" || p === "sticky") { f = n; break; }
        if (p === "absolute") f = n;
      }
      if (!f) continue; // plain content overlapping plain content: leave to the other checks
      const fr = f.getBoundingClientRect();
      if (big(fr)) continue;
      // A chip sitting on its own bar (Edit / reach on the Due soon bar) is by design.
      if (fr.left >= r.left - 1 && fr.right <= r.right + 1 && fr.top >= r.top - 1 && fr.bottom <= r.bottom + 1 && (isInteractive(f) || f.querySelector("button"))) continue;
      const pos = style(f).position;
      if (pos === "fixed" || pos === "sticky") {
        const down = fr.top + fr.height / 2 > H / 2; // a bottom bar: scroll down to get out from under it
        if (canScroll(scrollerOf(el), down)) continue;
      }
      hits++;
      who = f;
    }
    if (hits >= 2 || (hits === 1 && pts.length === 1)) {
      const pos = style(who).position;
      const floating = pos === "fixed" || pos === "sticky";
      const kind = floating && fixedRoot(el) && fixedRoot(el) !== fixedRoot(who) ? "floating-overlap" : floating ? "covered-by-bar" : "covered";
      const key = kind + describe(who);
      const g = groups.get(key) || { who, kind, els: [], interactive: false };
      g.els.push(el);
      g.interactive ||= isInteractive(el);
      groups.set(key, g);
    }
  }
  for (const [pop, { h, n }] of behind) {
    if (n < 2) continue; // one stray point is usually a popup still sliding in
    issues.push({ kind: "popup-behind", severity: "error", target: describe(pop), detail: `the popup is drawn underneath ${describe(h)} (raise it, or portal it to the body)`, rect: rectOf(pop) });
  }
  for (const g of groups.values()) {
    const els = g.els.filter((e) => !g.els.some((o) => o !== e && o.contains(e)));
    const first = els[0];
    issues.push({
      kind: g.kind,
      // Passing notes (the toucan's say, toasts) come and go: worth a look, not a block.
      severity: g.kind === "covered" || g.who.closest("[role=status],[role=alert]") ? "warn" : "error",
      target: describe(g.who),
      detail: `sits on ${els.length > 1 ? `${els.length} things: ` : ""}${els.slice(0, 3).map(describe).join(", ")}${els.length > 3 ? "…" : ""}${g.kind !== "covered" ? " (and scrolling can't move them out from under it)" : ""}`,
      rect: rectOf(first),
      by: rectOf(g.who),
    });
  }

  // 4. The keyboard covers the field being typed in.
  if (opts.kbHeight) {
    const a = document.activeElement;
    if (a && a !== document.body && a.matches("input,textarea,[contenteditable=true]")) {
      const r = a.getBoundingClientRect();
      if (r.bottom > H + 2) add("field-under-keyboard", "error", a, `the field being typed in is ${Math.round(r.bottom - H)}px behind the keyboard`);
      if (r.top < -2) add("field-under-keyboard", "error", a, `the field being typed in is ${Math.round(-r.top)}px above the screen`);
    }
  }
  return { issues, docHeight: document.documentElement.scrollHeight, viewH: H };
}

/** Positions of the visible text and controls (to see whether something came back the way it was). */
export function snapshotLayout() {
  const out = {};
  const els = [...document.querySelectorAll("button, a[href], h1, h2, h3, p, input, textarea, [role=tab], li")].filter((el) => {
    if (el.closest("[data-ui-check-overlay]")) return false;
    for (let n = el; n && n !== document.body; n = n.parentElement) if (getComputedStyle(n).position === "fixed") return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1 && el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true });
  });
  const seen = {};
  for (const el of els) {
    const t = (el.getAttribute("aria-label") || el.innerText || el.placeholder || "").trim().replace(/\s+/g, " ").slice(0, 40);
    if (!t) continue;
    const k = `${el.tagName}:${t}`;
    seen[k] = (seen[k] || 0) + 1;
    const r = el.getBoundingClientRect();
    out[`${k}#${seen[k]}`] = [Math.round(r.x), Math.round(r.y + window.scrollY), Math.round(r.width), Math.round(r.height)];
  }
  return out;
}


/** Pretends the iPhone keyboard is up: the visual viewport shrinks by `kb` px. */
export function fakeKeyboard(kb) {
  const vv = window.visualViewport;
  if (!vv) return;
  if (!window.__vvH) window.__vvH = Object.getOwnPropertyDescriptor(VisualViewport.prototype, "height");
  if (kb) Object.defineProperty(vv, "height", { configurable: true, get: () => window.innerHeight - kb });
  else delete vv.height;
  vv.dispatchEvent(new Event("resize"));
  vv.dispatchEvent(new Event("scroll"));
  window.dispatchEvent(new Event("resize"));
}

/** Draws boxes around the problems for the screenshot (removed afterwards). */
export function drawBoxes(issues) {
  for (const i of issues) {
    if (!i.rect) continue;
    const d = document.createElement("div");
    d.setAttribute("data-ui-check-overlay", "");
    const c = i.severity === "error" ? "#ff1744" : "#ff9100";
    Object.assign(d.style, { position: "fixed", left: i.rect.x + "px", top: i.rect.y + "px", width: i.rect.w + "px", height: i.rect.h + "px", outline: `2px solid ${c}`, zIndex: 2147483647, pointerEvents: "none", boxSizing: "border-box" });
    document.body.appendChild(d);
  }
}
export function clearBoxes() {
  document.querySelectorAll("[data-ui-check-overlay]").forEach((n) => n.remove());
}
