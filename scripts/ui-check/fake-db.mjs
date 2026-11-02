// A small stand-in for Supabase's REST API (PostgREST), kept in memory, so the
// UI check can run the real app with no database and no secrets.
//
// It reads supabase/migrations/*.sql for each table's columns and defaults,
// seeds the rows from fixtures.mjs, and answers the requests supabase-js makes:
// select (with columns, aliases and simple embeds), the filters the app uses,
// order/limit/offset/range, single, count, insert/upsert/update/delete, and rpc.
// Anything it can't understand is logged (never fatal) so the check can report it.
//
// Usage: startFakeDb({ port, fixtures }) → { close, log, tables }
import http from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

const MIG_DIR = new URL("../../supabase/migrations/", import.meta.url);

/** table → { col: defaultFn | null } from the migrations. */
export function readSchema() {
  const schema = {};
  const files = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const sql = readFileSync(new URL(f, MIG_DIR), "utf8").replace(/--[^\n]*/g, "");
    // create table [if not exists] [public.]name ( ... );
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?\s*\(([\s\S]*?)\n\);/gi)) {
      const t = (schema[m[1]] ??= {});
      for (const part of splitTop(m[2])) addColumn(t, part);
    }
    for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?"?(\w+)"?\s+([\s\S]*?);/gi)) {
      const t = (schema[m[1]] ??= {});
      for (const part of splitTop(m[2])) {
        const a = part.match(/^\s*add\s+column\s+(?:if\s+not\s+exists\s+)?([\s\S]*)$/i);
        if (a) addColumn(t, a[1]);
      }
    }
  }
  return schema;
}

function splitTop(s) {
  const out = [];
  let depth = 0, cur = "", q = false;
  for (const ch of s) {
    if (ch === "'") q = !q;
    if (!q && ch === "(") depth++;
    if (!q && ch === ")") depth--;
    if (!q && depth === 0 && ch === ",") { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function addColumn(t, def) {
  const m = def.trim().match(/^"?(\w+)"?\s+([\w\s\[\]().,]+?)(?=\s+(?:not|null|default|primary|references|unique|check|generated|constraint)\b|$)/i);
  if (!m) return;
  const name = m[1].toLowerCase();
  if (["constraint", "primary", "unique", "check", "foreign", "exclude"].includes(name)) return;
  const type = m[2].trim().toLowerCase();
  const d = def.match(/\bdefault\s+((?:'[^']*'|\([^)]*\)|[^\s,])+(?:::\w+(?:\[\])?)?)/i);
  t[name] = { type, def: d ? d[1] : null };
}

function defaultValue(col) {
  if (!col?.def) return null;
  const d = col.def.toLowerCase();
  if (d.includes("gen_random_uuid") || d.includes("uuid_generate")) return randomUUID();
  if (d.startsWith("now") || d.includes("current_timestamp")) return new Date().toISOString();
  if (d.includes("current_date")) return new Date().toISOString().slice(0, 10);
  if (d === "true" || d === "false") return d === "true";
  if (/^-?\d+(\.\d+)?$/.test(d)) return Number(d);
  const s = col.def.match(/^'([\s\S]*)'(?:::(\w+(?:\[\])?))?$/);
  if (s) {
    const cast = (s[2] || "").toLowerCase();
    if (cast.startsWith("json") || /^[[{]/.test(s[1])) {
      if (cast.endsWith("[]") || col.type.endsWith("[]")) return pgArray(s[1]);
      try { return JSON.parse(s[1]); } catch { return s[1]; }
    }
    return s[1];
  }
  if (d.includes("array[]") || d === "'{}'") return [];
  return null;
}

function pgArray(s) {
  const inner = s.replace(/^\{|\}$/g, "");
  return inner ? inner.split(",").map((x) => x.replace(/^"|"$/g, "")) : [];
}

// ---------------------------------------------------------------- filters

function parseValue(v) {
  if (v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}

function splitList(s) {
  // a,"b,c",d → [a, "b,c", d] ; respects parentheses
  const out = [];
  let cur = "", q = false, depth = 0;
  for (const ch of s) {
    if (ch === '"') { q = !q; continue; }
    if (!q && ch === "(") depth++;
    if (!q && ch === ")") depth--;
    if (!q && depth === 0 && ch === ",") { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function getPath(row, col) {
  // col, col->key, col->>key, a.b (embedded)
  const parts = col.split(/->>?/);
  let v = row[parts[0].trim()];
  for (const p of parts.slice(1)) {
    if (v == null) return null;
    if (typeof v === "string") { try { v = JSON.parse(v); } catch { return null; } }
    v = v[p.replace(/^'|'$/g, "")];
  }
  if (col.includes("->>") && v != null && typeof v === "object") return JSON.stringify(v);
  return v;
}

function cmp(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" || typeof b === "number") {
    const na = Number(a), nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  }
  if (typeof a === "boolean") return Number(a) - Number(b);
  // timestamps vs dates compare fine as ISO strings once normalised
  const sa = normTime(String(a)), sb = normTime(String(b));
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function normTime(s) {
  // "2026-11-02T10:00:00+00:00" and "...Z" compare alike
  const m = s.match(/^(\d{4}-\d\d-\d\d)[T ](\d\d:\d\d(?::\d\d(?:\.\d+)?)?)(Z|[+-]\d\d:?\d\d)?$/);
  if (!m) return s;
  const d = new Date(s.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
}

function likeToRe(p, flags) {
  return new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[%*]/g, ".*").replace(/_/g, ".") + "$", flags);
}

function test(row, col, opExpr) {
  let neg = false;
  let expr = opExpr;
  if (expr.startsWith("not.")) { neg = true; expr = expr.slice(4); }
  const dot = expr.indexOf(".");
  const op = expr.slice(0, dot);
  const raw = expr.slice(dot + 1);
  const v = getPath(row, col);
  let r;
  switch (op) {
    case "eq": r = v != null && cmp(v, parseValue(raw)) === 0; break;
    case "neq": r = v != null && cmp(v, parseValue(raw)) !== 0; break;
    case "gt": r = v != null && cmp(v, raw) > 0; break;
    case "gte": r = v != null && cmp(v, raw) >= 0; break;
    case "lt": r = v != null && cmp(v, raw) < 0; break;
    case "lte": r = v != null && cmp(v, raw) <= 0; break;
    case "is": r = raw === "null" ? v == null : raw === "true" ? v === true : raw === "false" ? v === false : v == null; break;
    case "in": {
      const list = splitList(raw.replace(/^\(|\)$/g, "")).map(parseValue);
      r = v != null && list.some((x) => cmp(v, x) === 0);
      break;
    }
    case "like": r = v != null && likeToRe(raw, "").test(String(v)); break;
    case "ilike": r = v != null && likeToRe(raw, "i").test(String(v)); break;
    case "cs": case "ov": case "cd": {
      let want;
      try { want = JSON.parse(raw); } catch { want = pgArray(raw); }
      const have = typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return []; } })() : v;
      if (Array.isArray(want)) {
        const h = Array.isArray(have) ? have : [];
        r = op === "cs" ? want.every((x) => h.includes(x)) : op === "ov" ? want.some((x) => h.includes(x)) : h.every((x) => want.includes(x));
      } else if (want && typeof want === "object") {
        r = !!have && Object.entries(want).every(([k, x]) => JSON.stringify(have[k]) === JSON.stringify(x));
      } else r = false;
      break;
    }
    case "fts": case "plfts": case "phfts": case "wfts": r = v != null && String(v).toLowerCase().includes(raw.toLowerCase()); break;
    default:
      throw new Error(`unsupported filter op "${op}" on ${col}`);
  }
  return neg ? !r : r;
}

/** or=(a.eq.1,and(b.eq.2,c.is.null)) */
function testLogic(row, kind, body) {
  const items = splitList(body.replace(/^\(|\)$/g, ""));
  const results = items.map((it) => {
    const m = it.match(/^(not\.)?(and|or)(\(.*\))$/);
    if (m) {
      const r = testLogic(row, m[2], m[3]);
      return m[1] ? !r : r;
    }
    const i = it.indexOf(".");
    return test(row, it.slice(0, i), it.slice(i + 1));
  });
  return kind === "or" ? results.some(Boolean) : results.every(Boolean);
}

// ---------------------------------------------------------------- select

function parseSelect(s) {
  // returns [{ kind: 'col'|'star'|'embed', name, alias, path, inner, children }]
  const items = splitList(s || "*").map((x) => x.trim()).filter(Boolean);
  return items.map((it) => {
    const em = it.match(/^(?:(\w+):)?([\w]+)(?:!(\w+))?(?:!(\w+))?\(([\s\S]*)\)$/);
    if (em) {
      const hints = [em[3], em[4]].filter(Boolean);
      return { kind: "embed", alias: em[1] || em[2], table: em[2], inner: hints.includes("inner"), hint: hints.find((h) => h !== "inner" && h !== "left"), children: parseSelect(em[5]) };
    }
    if (it === "*") return { kind: "star" };
    const cm = it.match(/^(?:(\w+):)?([\w\->'"]+?)(?:::\w+)?$/);
    if (cm) {
      const path = cm[2];
      const last = path.split(/->>?/).pop().replace(/'/g, "");
      return { kind: "col", alias: cm[1] || (path.includes("->") ? last : path), path };
    }
    return { kind: "col", alias: it, path: it };
  });
}

const singular = (t) => t.replace(/ies$/, "y").replace(/ses$/, "s").replace(/s$/, "");

export function startFakeDb({ port = 54329, fixtures = {}, quiet = true } = {}) {
  const schema = readSchema();
  const tables = {};
  const log = { unsupported: [], unknownTables: new Set(), writes: [], requests: 0 };

  function fill(table, row) {
    const cols = schema[table] || {};
    const out = {};
    for (const [c, info] of Object.entries(cols)) out[c] = defaultValue(info);
    return Object.assign(out, row);
  }
  const T = (name) => {
    if (!tables[name]) {
      tables[name] = [];
      if (!schema[name]) log.unknownTables.add(name);
    }
    return tables[name];
  };
  const seed = (fx) => {
    for (const k of Object.keys(tables)) delete tables[k];
    for (const [name, rows] of Object.entries(fx)) tables[name] = rows.map((r) => fill(name, r));
  };
  seed(typeof fixtures === "function" ? fixtures() : fixtures);

  function embedRows(parentTable, row, e) {
    const child = e.table;
    const viaHint = e.hint && row[e.hint] !== undefined ? e.hint : null;
    const fk = viaHint ?? [`${singular(child)}_id`, `${child}_id`].find((c) => c in row);
    if (fk) {
      const hit = T(child).find((r) => r.id === row[fk]);
      return { many: false, rows: hit ? [hit] : [] };
    }
    const back = [`${singular(parentTable)}_id`, `${parentTable}_id`].find((c) => (schema[child] && c in schema[child]) || T(child).some((r) => c in r));
    if (back) return { many: true, rows: T(child).filter((r) => r[back] === row.id) };
    throw new Error(`can't resolve embed ${parentTable} → ${child}`);
  }

  function project(table, row, sel, embedFilters, prefix = "") {
    const out = {};
    for (const s of sel) {
      if (s.kind === "star") Object.assign(out, row);
      else if (s.kind === "col") out[s.alias] = getPath(row, s.path) ?? null;
    }
    for (const s of sel) {
      if (s.kind !== "embed") continue;
      const key = prefix + s.alias;
      let { many, rows } = embedRows(table, row, s);
      const fs = embedFilters.filter((f) => f.path === key || f.path === prefix + s.table);
      rows = rows.filter((r) => fs.every((f) => test(r, f.col, f.expr)));
      const projected = rows.map((r) => project(s.table, r, s.children, embedFilters, key + "."));
      if (s.inner && projected.length === 0) return null;
      if (projected.some((p) => p === null)) {
        const kept = projected.filter(Boolean);
        if (s.inner && kept.length === 0) return null;
        out[s.alias] = many ? kept : kept[0] ?? null;
      } else out[s.alias] = many ? projected : projected[0] ?? null;
    }
    return out;
  }

  function query(table, params) {
    let rows = [...T(table)];
    const embedFilters = [];
    for (const [k, v] of params) {
      if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
      if (k === "or" || k === "and") { rows = rows.filter((r) => testLogic(r, k, v)); continue; }
      if (k === "not.or" || k === "not.and") { rows = rows.filter((r) => !testLogic(r, k.slice(4), v)); continue; }
      if (/\.(or|and)$/.test(k)) { log.unsupported.push(`${table}: embedded logic ${k}`); continue; }
      const dot = k.lastIndexOf(".");
      if (dot > 0 && !k.includes("->")) {
        embedFilters.push({ path: k.slice(0, dot), col: k.slice(dot + 1), expr: v });
        continue;
      }
      rows = rows.filter((r) => test(r, k, v));
    }
    const order = params.get("order");
    if (order) {
      const keys = order.split(",").map((o) => {
        const [col, ...mods] = o.split(".");
        return { col, desc: mods.includes("desc"), nullsFirst: mods.includes("nullsfirst") ? true : mods.includes("nullslast") ? false : mods.includes("desc") };
      });
      rows.sort((a, b) => {
        for (const k of keys) {
          const va = getPath(a, k.col), vb = getPath(b, k.col);
          if (va == null || vb == null) {
            if (va == null && vb == null) continue;
            return (va == null) === k.nullsFirst ? -1 : 1;
          }
          const c = cmp(va, vb);
          if (c) return k.desc ? -c : c;
        }
        return 0;
      });
    }
    return { rows, embedFilters };
  }

  function respond(res, status, body, headers = {}) {
    res.writeHead(status, { "Content-Type": "application/json", ...headers });
    res.end(body === undefined ? "" : JSON.stringify(body));
  }

  const server = http.createServer(async (req, res) => {
    log.requests++;
    const url = new URL(req.url, "http://x");
    let body = "";
    for await (const c of req) body += c;
    const prefer = req.headers.prefer || "";
    const accept = req.headers.accept || "";
    const wantsObject = accept.includes("vnd.pgrst.object");
    try {
      if (url.pathname === "/__reset") {
        seed(typeof fixtures === "function" ? fixtures() : fixtures);
        return respond(res, 200, { ok: true });
      }
      if (url.pathname.startsWith("/storage/") || url.pathname.startsWith("/auth/")) return respond(res, 200, {});
      const m = url.pathname.match(/^\/rest\/v1\/(rpc\/)?(\w+)$/);
      if (!m) return respond(res, 404, { message: "not found" });
      if (m[1]) {
        log.unsupported.push(`rpc ${m[2]} (answered null)`);
        return respond(res, 200, null);
      }
      const table = m[2];
      const params = url.searchParams;
      const sel = parseSelect(params.get("select") || "*");
      const ret = prefer.includes("return=representation");
      const finish = (rows, embedFilters, status = 200, total) => {
        let out = rows.map((r) => project(table, r, sel, embedFilters)).filter(Boolean);
        const count = total ?? out.length;
        const off = Number(params.get("offset") || 0);
        const lim = params.get("limit");
        const range = req.headers.range?.match(/(\d+)-(\d+)/);
        if (range) out = out.slice(Number(range[1]), Number(range[2]) + 1);
        else out = out.slice(off, lim ? off + Number(lim) : undefined);
        const headers = { "Content-Range": `0-${Math.max(out.length - 1, 0)}/${prefer.includes("count=") ? count : "*"}` };
        if (req.method === "HEAD") { res.writeHead(200, headers); return res.end(); }
        if (wantsObject) {
          if (out.length !== 1) return respond(res, 406, { code: "PGRST116", details: `The result contains ${out.length} rows`, hint: null, message: "JSON object requested, multiple (or no) rows returned" });
          return respond(res, status, out[0], headers);
        }
        return respond(res, status, out, headers);
      };

      if (req.method === "GET" || req.method === "HEAD") {
        const { rows, embedFilters } = query(table, params);
        return finish(rows, embedFilters);
      }
      const payload = body ? JSON.parse(body) : null;
      if (req.method === "POST") {
        const list = Array.isArray(payload) ? payload : [payload];
        const upsert = prefer.includes("resolution=");
        const ignore = prefer.includes("ignore-duplicates");
        const conflict = (params.get("on_conflict") || "id").split(",");
        const touched = [];
        for (const item of list) {
          const existing = upsert ? T(table).find((r) => conflict.every((c) => item[c] !== undefined && r[c] === item[c])) : null;
          if (existing) {
            if (!ignore) Object.assign(existing, item, schema[table]?.updated_at ? { updated_at: new Date().toISOString() } : {});
            touched.push(existing);
          } else {
            const row = fill(table, item);
            T(table).push(row);
            touched.push(row);
          }
        }
        log.writes.push(`insert ${table} ×${list.length}`);
        if (!ret) return respond(res, 201, undefined);
        return finish(touched, [], 201);
      }
      if (req.method === "PATCH") {
        const { rows } = query(table, params);
        for (const r of rows) Object.assign(r, payload);
        log.writes.push(`update ${table} ×${rows.length}`);
        if (!ret) return respond(res, 204, undefined);
        return finish(rows, []);
      }
      if (req.method === "DELETE") {
        const { rows } = query(table, params);
        tables[table] = T(table).filter((r) => !rows.includes(r));
        log.writes.push(`delete ${table} ×${rows.length}`);
        if (!ret) return respond(res, 204, undefined);
        return finish(rows, []);
      }
      return respond(res, 405, { message: "method" });
    } catch (e) {
      const msg = `${req.method} ${decodeURIComponent(req.url)}: ${e.message}`;
      log.unsupported.push(msg);
      if (!quiet) console.error("[fake-db]", msg);
      return respond(res, 400, { message: e.message, code: "FAKE" });
    }
  });
  return new Promise((resolve, reject) => server.once("error", (e) => reject(new Error(`fake db: ${e.message} (an earlier ui-check still running?)`))).listen(port, "127.0.0.1", () => resolve({ close: () => server.close(), log, tables, schema })));
}
