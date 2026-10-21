// Usage: node scripts/shot.mjs <url> <out.png> [width height]
import { chromium } from 'playwright';
const [url, out, w = '1280', h = '720'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 }).catch((e) => logs.push('timeout ' + e.message));
await page.screenshot({ path: out });
console.log(logs.join('\n'));
await browser.close();
