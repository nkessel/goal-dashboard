import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const [,, url, out, w='390', h='800', full='1', action=''] = process.argv;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text().slice(0,200)); });
await p.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForTimeout(800);
if (action) { for (const a of action.split(' ;; ')) { if (a.startsWith('click:')) await p.click(a.slice(6)); else if (a.startsWith('wait:')) await p.waitForTimeout(+a.slice(5)); else if (a.startsWith('eval:')) console.log(JSON.stringify(await p.evaluate(a.slice(5)))); } await p.waitForTimeout(500); }
await p.screenshot({ path: out, fullPage: full === '1' });
console.log('errors:', errs.slice(0,5).join(' | ') || 'none');
await b.close();
