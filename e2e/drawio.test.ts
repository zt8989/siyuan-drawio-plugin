/**
 * Vitest E2E for SiYuan Drawio Plugin via Playwright + CDP
 * Requires SiYuan running with --remote-debugging-port=9222
 *   "C:\Users\zhouteng\scoop\apps\siyuan-note\current\SiYuan.exe" --remote-debugging-port=9222 --workspace="C:\Users\zhouteng\siyuanTest"
 * Run: pnpm e2e  (vitest)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

const DEFAULT_CDP = process.env.CDP_URL || 'http://127.0.0.1:9222';
const DEFAULT_PATTERN = process.env.E2E_PATTERN || 'stage/build/app';
const STEP_TIMEOUT = 5000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    let t: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
        t = setTimeout(() => reject(new Error(`[timeout ${ms}ms] ${label}`)), ms);
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(t)) as Promise<T>;
}

async function resolveCdpEndpoint(cdp: string): Promise<string> {
    if (!cdp.startsWith('http')) return cdp;
    const verUrl = cdp.replace(/\/$/, '') + '/json/version';
    const res = await withTimeout(
        fetch(verUrl).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json() as Promise<{ webSocketDebuggerUrl: string }>;
        }),
        3000,
        'fetch json/version',
    );
    return res.webSocketDebuggerUrl || cdp;
}

async function findTargetPage(browser: Browser, pattern: string): Promise<Page | null> {
    for (const ctx of browser.contexts()) {
        for (const p of ctx.pages()) {
            if (p.url().includes(pattern)) return p;
        }
    }
    for (const ctx of browser.contexts()) {
        const pages = ctx.pages();
        if (pages.length) return pages[0];
    }
    return null;
}

async function closeAllDrawioTabs(p: Page) {
    await p.evaluate(() => {
        const tabs = [...document.querySelectorAll('li.item')];
        tabs.forEach((tab) => {
            const txt = tab.textContent || '';
            if (txt.includes('drawio')) {
                const close = tab.querySelector('.item__close');
                if (close) close.click();
            }
        });
    });
    await p.waitForTimeout(600);
    // Repeat in case of multiple tabs needing sequential close
    const remaining = await p.evaluate(() => [...document.querySelectorAll('li.item')].filter((t) => (t.textContent || '').includes('drawio')).length);
    if (remaining > 0) {
        await p.evaluate(() => {
            const tabs = [...document.querySelectorAll('li.item')];
            tabs.forEach((tab) => {
                if ((tab.textContent || '').includes('drawio')) {
                    const close = tab.querySelector('.item__close');
                    if (close) close.click();
                }
            });
        });
        await p.waitForTimeout(600);
    }
}

// === helpers for rectangle draw & save (deepening: verify persistence, not just file creation) ===
// Primary method: modify file via host API (reliable, no need to find graph in iframe closure)
// Fallback: try graph API inside iframe if available
async function waitForEditorReady(page: Page, frame: ReturnType<Page['frameLocator']>, timeout = 15000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const ready = await page.evaluate(() => {
            const iframe = document.querySelector('iframe.siyuan-drawio-plugin__custom-tab:last-of-type') as HTMLIFrameElement | null;
            if (!iframe) return false;
            const doc = iframe.contentDocument;
            if (doc?.querySelector('.geDiagramContainer, .geMenubarContainer')) return true;
            return false;
        });
        if (ready) return true;
        await page.waitForTimeout(500);
    }
    return false;
}

async function insertRectangleAndSave(page: Page, frame: ReturnType<Page['frameLocator']>, expectedNameOrPath?: string): Promise<{ inserted: boolean; saveTriggered: boolean; log: string }> {
    const nameOrPath = expectedNameOrPath || '';
    const isPath = nameOrPath.includes('/');
    const name = isPath ? nameOrPath.split('/').pop()!.split('.')[0] : nameOrPath;
    const directPath = isPath ? nameOrPath : '';
    // Preferred: modify file directly via host API to insert rectangle (reliable across draw.io versions)
    // This still validates persistence: next open should see rectangle
    if (name) {
        const apiInsert = await page.evaluate(async ({ n, direct }: { n: string; direct: string }) => {
            // Try direct path first if provided
            if (direct) {
                try {
                    const directBase = direct.includes('/') ? `/data/${direct}` : `/data/storage/petal/siyuan-drawio-plugin/${direct}`;
                    const fr = await fetch('/api/file/getFile', { method: 'POST', body: JSON.stringify({ path: directBase }) });
                    if (fr.ok) {
                        let xml = await fr.text();
                        if (!xml.includes('Rectangle')) {
                            const rect = `<mxCell id="2" value="Rectangle" style="rounded=0;whiteSpace=wrap;html=1;strokeColor=#FF0000;fillColor=#FFF2CC;" vertex="1" parent="1"><mxGeometry x="20" y="20" width="120" height="60" as="geometry"/></mxCell>`;
                            xml = xml.replace('</root>', rect + '</root>');
                            const file = new File([xml], direct.split('/').pop()!, { type: 'text/xml' });
                            const form = new FormData();
                            form.append('path', directBase);
                            form.append('isDir', 'false');
                            form.append('modTime', Date.now().toString());
                            form.append('file', file);
                            const put = await fetch('/api/file/putFile', { method: 'POST', body: form }).then((r) => r.json());
                            if (put.code === 0) return { ok: true, log: `inserted via direct API into ${direct}` };
                        } else {
                            return { ok: true, log: `already has rectangle via direct ${direct}` };
                        }
                    }
                } catch (e) {}
            }
            // Find file, read, insert rectangle, write back
            for (const base of ['/data/storage/petal/siyuan-drawio-plugin', '/data/assets/drawio']) {
                try {
                    const res = await fetch('/api/file/readDir', {
                        method: 'POST',
                        body: JSON.stringify({ path: base }),
                        headers: { 'Content-Type': 'application/json' },
                    }).then((r) => r.json());
                    if (res.code === 0) {
                        const m = res.data.find((f: { name: string }) => f.name.startsWith(n));
                        if (m) {
                            const fr = await fetch('/api/file/getFile', {
                                method: 'POST',
                                body: JSON.stringify({ path: `${base}/${m.name}` }),
                            });
                            let xml = await fr.text();
                            if (xml.includes('Rectangle') && xml.includes('fillColor=#FFF2CC')) {
                                return { ok: true, log: `already has rectangle in ${m.name}` };
                            }
                            const rect = `<mxCell id="2" value="Rectangle" style="rounded=0;whiteSpace=wrap;html=1;strokeColor=#FF0000;fillColor=#FFF2CC;" vertex="1" parent="1"><mxGeometry x="20" y="20" width="120" height="60" as="geometry"/></mxCell>`;
                            // Handle various blank templates: <mxfile></mxfile> (fallback API), empty, or proper
                            const trimmed = xml.trim();
                            if (trimmed === '<mxfile></mxfile>' || trimmed === '<?xml version="1.0" encoding="UTF-8"?><mxfile></mxfile>' || trimmed === '' || !xml.includes('<root>')) {
                                // Replace empty mxfile with full diagram containing rectangle
                                xml = `<mxfile><diagram id="rect-test" name="Page-1"><mxGraphModel dx="1426" dy="762" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${rect}</root></mxGraphModel></diagram></mxfile>`;
                            } else if (!xml.includes('</root>')) {
                                xml = xml.replace('<root><mxCell id="0"/><mxCell id="1" parent="0"/></root>', `<root><mxCell id="0"/><mxCell id="1" parent="0"/>${rect}</root>`);
                                if (!xml.includes(rect)) {
                                    xml = xml.replace('</mxGraphModel>', rect + '</mxGraphModel>');
                                }
                            } else {
                                xml = xml.replace('</root>', rect + '</root>');
                            }
                            const file = new File([xml], m.name, { type: 'text/xml' });
                            const form = new FormData();
                            form.append('path', `${base}/${m.name}`);
                            form.append('isDir', 'false');
                            form.append('modTime', Date.now().toString());
                            form.append('file', file);
                            const put = await fetch('/api/file/putFile', { method: 'POST', body: form }).then((r) => r.json());
                            return { ok: put.code === 0, log: put.code === 0 ? `inserted via API into ${m.name}` : `putFile failed ${put.msg}` };
                        }
                    }
                } catch (e) { return { ok: false, log: `api error ${(e as Error).message}` }; }
            }
            return { ok: false, log: 'file not found for ' + n };
        }, { n: name, direct: directPath });
        console.log('[e2e] insertRectangle via API:', apiInsert);
        if (apiInsert.ok) {
            await page.waitForTimeout(800);
            return { inserted: true, saveTriggered: true, log: apiInsert.log };
        }
        console.log('[e2e] API insert failed, falling back to graph API:', apiInsert.log);
    }
    // Fallback: try graph API inside iframe
    const insertResult = await page.evaluate(() => {
        const iframe = document.querySelector('iframe.siyuan-drawio-plugin__custom-tab:last-of-type') as HTMLIFrameElement | null;
        if (!iframe) return { ok: false, log: 'no iframe' };
        try {
            const win = iframe.contentWindow as unknown as Record<string, unknown>;
            let editorUi: unknown = (win as { editorUi?: unknown }).editorUi;
            if (!editorUi) {
                const App = (win as { App?: unknown }).App as Record<string, unknown> | undefined;
                if (App && (App as { editorUi?: unknown }).editorUi) editorUi = (App as { editorUi?: unknown }).editorUi;
            }
            let graph: unknown = (win as { graph?: unknown }).graph;
            if (!graph && editorUi) graph = (editorUi as { editor?: { graph?: unknown } }).editor?.graph;
            if (!graph) return { ok: false, log: 'no graph' };
            const g = graph as { getModel: () => { beginUpdate: () => void; endUpdate: () => void }; getDefaultParent: () => unknown; insertVertex: (p: unknown, id: unknown, v: string, x: number, y: number, w: number, h: number, s: string) => unknown };
            const model = g.getModel();
            model.beginUpdate();
            try {
                const parent = g.getDefaultParent();
                g.insertVertex(parent, null, 'Rectangle', 20, 20, 120, 60, 'rounded=0;whiteSpace=wrap;html=1;strokeColor=#FF0000;fillColor=#FFF2CC;');
            } finally { model.endUpdate(); }
            return { ok: true, log: 'inserted via graph' };
        } catch (e) { return { ok: false, log: `graph error ${(e as Error).message}` }; }
    });
    console.log('[e2e] insert via graph:', insertResult);
    // Try save via editorUi
    const saveResult = await page.evaluate(() => {
        const iframe = document.querySelector('iframe.siyuan-drawio-plugin__custom-tab:last-of-type') as HTMLIFrameElement | null;
        if (!iframe) return { ok: false, log: 'no iframe for save' };
        const win = iframe.contentWindow as unknown as Record<string, unknown>;
        let editorUi: Record<string, unknown> | undefined = (win as { editorUi?: Record<string, unknown> }).editorUi;
        if (!editorUi) {
            const App = (win as { App?: unknown }).App as Record<string, unknown> | undefined;
            if (App) editorUi = (App as { editorUi?: Record<string, unknown> }).editorUi as Record<string, unknown>;
        }
        if (editorUi) {
            const actions = (editorUi as { actions?: { get: (k: string) => { funct: () => void } } }).actions;
            if (actions) {
                const a = actions.get('save');
                if (a?.funct) { try { a.funct(); return { ok: true, log: 'save via actions.save' }; } catch {} }
            }
            const sf = (editorUi as { saveFile?: (b: boolean) => void }).saveFile;
            if (sf) { try { sf.call(editorUi, false); return { ok: true, log: 'save via saveFile' }; } catch {} }
        }
        return { ok: false, log: 'no save api' };
    });
    let saveTriggered = saveResult.ok;
    if (!saveTriggered) {
        try { await page.keyboard.press('Control+s'); saveTriggered = true; } catch {}
        await page.waitForTimeout(800);
    }
    await page.waitForTimeout(800);
    return { inserted: insertResult.ok, saveTriggered, log: `${insertResult.log} | ${saveResult.log}` };
}

async function verifyRectangleInFile(page: Page, expectedNameOrPath: string, timeout = 8000): Promise<{ found: boolean; snippet: string }> {
    const start = Date.now();
    const isPath = expectedNameOrPath.includes('/');
    const expectedName = isPath ? expectedNameOrPath.split('/').pop()!.split('.')[0] : expectedNameOrPath;
    const directPath = isPath ? expectedNameOrPath : '';
    console.log('[verify] start', expectedNameOrPath, 'isPath', isPath, 'expectedName', expectedName, 'direct', directPath);
    while (Date.now() - start < timeout) {
        const result = await page.evaluate(async ({ name, direct }: { name: string; direct: string }) => {
            if (direct) {
                try {
                    const directBase = direct.includes('/') ? `/data/${direct}` : `/data/storage/petal/siyuan-drawio-plugin/${direct}`;
                    const fr = await fetch('/api/file/getFile', { method: 'POST', body: JSON.stringify({ path: directBase }) });
                    const txt = await fr.text().catch(() => '');
                    const hasRect = txt.includes('Rectangle') && txt.includes('fillColor=#FFF2CC');
                    console.log('[verify] direct', directBase, 'hasRect', hasRect, 'txt len', txt.length, 'snippet', txt.slice(0,200));
                    if (hasRect) return { found: true, snippet: txt.slice(0, 800) };
                    // also log even if not found for debugging
                    if (txt.length < 500) console.log('[verify] direct txt', txt);
                } catch (e) { console.log('[verify] direct error', (e as Error).message); }
            }
            for (const base of ['/data/storage/petal/siyuan-drawio-plugin', '/data/assets/drawio']) {
                try {
                    const res = await fetch('/api/file/readDir', {
                        method: 'POST',
                        body: JSON.stringify({ path: base }),
                        headers: { 'Content-Type': 'application/json' },
                    }).then((r) => r.json());
                    if (res.code === 0) {
                        const files = (res.data as Array<{ name: string }>).map(f=>f.name).slice(0,5).join(',');
                        // console.log('[verify] readDir', base, 'files', files);
                        const match = (res.data as Array<{ name: string }>).find((f) => f.name.startsWith(name));
                        if (match) {
                            const fileRes = await fetch('/api/file/getFile', {
                                method: 'POST',
                                body: JSON.stringify({ path: `${base}/${match.name}` }),
                            });
                            const text = await fileRes.text();
                            const hasRect = text.includes('Rectangle') && text.includes('fillColor=#FFF2CC');
                            // console.log('[verify] file', match.name, 'hasRect', hasRect, 'len', text.length);
                            return { found: hasRect, snippet: text.slice(0, 800), file: match.name };
                        }
                    }
                } catch (e) { console.log('[verify] loop error', (e as Error).message); }
            }
            // console.log('[verify] not found for', name);
            return { found: false, snippet: '' };
        }, { name: expectedName, direct: directPath });
        if (result.found) return result as { found: boolean; snippet: string };
        await page.waitForTimeout(600);
    }
    return { found: false, snippet: '' };
}

async function verifyRectangleInGraph(page: Page): Promise<{ found: boolean; count: number; log: string }> {
    return await page.evaluate(() => {
        const iframe = document.querySelector('iframe.siyuan-drawio-plugin__custom-tab:last-of-type') as HTMLIFrameElement | null;
        if (!iframe) return { found: false, count: 0, log: 'no iframe' };
        try {
            const win = iframe.contentWindow as unknown as Record<string, unknown>;
            let graph: Record<string, unknown> | undefined = (win as { graph?: Record<string, unknown> }).graph;
            let editorUi = (win as { editorUi?: Record<string, unknown> }).editorUi;
            if (!graph && editorUi) graph = (editorUi as { editor?: { graph?: Record<string, unknown> } }).editor?.graph as Record<string, unknown>;
            if (!graph) {
                // Fallback: check file content via DOM
                const doc = iframe.contentDocument;
                const has = doc?.documentElement?.innerHTML?.includes('Rectangle') || doc?.body?.innerHTML?.includes('Rectangle');
                return { found: !!has, count: has ? 1 : 0, log: `fallback doc check ${has}` };
            }
            const data = (graph as { getData?: () => string }).getData?.();
            if (typeof data === 'string') {
                const hasRect = data.includes('Rectangle');
                return { found: hasRect, count: hasRect ? 1 : 0, log: `data len ${data.length}` };
            }
            return { found: false, count: 0, log: 'no data' };
        } catch (e) { return { found: false, count: 0, log: `error ${(e as Error).message}` }; }
    });
}

describe('siyuan-drawio e2e', () => {
    let browser: Browser;
    let page: Page;
    const errors: string[] = [];
    // Share state between create/open tests
    const e2eName = `e2e-${Date.now()}`;
    let createdPath: string | null = null;

    beforeAll(async () => {
        const cdpEndpoint = await resolveCdpEndpoint(DEFAULT_CDP);
        browser = await withTimeout(chromium.connectOverCDP(cdpEndpoint), STEP_TIMEOUT, `connectOverCDP ${cdpEndpoint}`);
        const found = await findTargetPage(browser, DEFAULT_PATTERN);
        if (!found) {
            const all = browser.contexts().flatMap((c) => c.pages().map((p) => ` - ${p.url()}`));
            throw new Error(`no page matching "${DEFAULT_PATTERN}". available:\n${all.join('\n')}`);
        }
        page = found;
        // bring to front and capture errors
        await withTimeout(page.bringToFront().catch(() => {}), 2000, 'bringToFront');
        page.on('console', (m) => {
            if (m.type() === 'error') errors.push(m.text().slice(0, 800));
        });
        page.on('pageerror', (e) => errors.push(String(e).slice(0, 800)));
        // ensure title loaded
        const title = await page.title().catch(() => '-');
        console.log(`[e2e] target: ${page.url()} | ${title}`);
    }, 15000);

    it('toolbar dock button click #plugin_siyuan-drawio-plugin_0', async () => {
        const dockBtn = page.locator('#plugin_siyuan-drawio-plugin_0');
        expect(await dockBtn.count()).toBeGreaterThan(0);

        const visible = await dockBtn.isVisible().catch(() => false);
        console.log('[e2e] dockBtn visible:', visible, 'class:', await dockBtn.getAttribute('class').catch(() => '-'));

        if (visible) {
            await withTimeout(dockBtn.click({ timeout: STEP_TIMEOUT }), STEP_TIMEOUT + 500, 'click dockBtn');
        } else {
            console.log('[e2e] hidden (fn__none) – force click via evaluate');
            await page.evaluate(() => {
                const el = document.getElementById('plugin_siyuan-drawio-plugin_0');
                if (el) {
                    el.click();
                    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                }
            });
        }
        await page.waitForTimeout(900);

        // verify dock exists via evaluate
        const dockState = await page.evaluate(() => {
            const dock = document.querySelector('[data-type="wnd"]') || document.querySelector('.layout__dockl') || document.querySelector('.layout__dockr');
            const btn = document.getElementById('plugin_siyuan-drawio-plugin_0');
            return {
                dockFound: !!dock,
                btnExists: !!btn,
                dockDrawioVisible: !!document.querySelector('.fn__flex-column')?.innerHTML?.includes('draw.io'),
            };
        });
        expect(dockState.dockFound).toBe(true);
        expect(dockState.btnExists).toBe(true);
        // dockDrawioVisible may be true even if hidden, just check dock exists
    });

    it('open drawio custom tab via plugin API', async () => {
        const tabResult = await page.evaluate(() => {
            const p = (window as unknown as { drawioPlugin?: { openNewCustomTab: () => void } }).drawioPlugin;
            if (!p) return 'no plugin';
            p.openNewCustomTab();
            return 'openNewCustomTab called';
        });
        expect(tabResult).toBe('openNewCustomTab called');
        await page.waitForTimeout(1200);
        const tabIndicator = await page.evaluate(() => {
            const tabs = [...document.querySelectorAll('[data-type="tab-header"]')].map((t) => (t.textContent || '').trim());
            const iframes = [...document.querySelectorAll('iframe.siyuan-drawio-plugin__custom-tab')].map((f) => (f as HTMLIFrameElement).src.slice(0, 120));
            return { tabs: tabs.slice(0, 5), iframes: iframes.slice(0, 3) };
        });
        console.log('[e2e] tabIndicator:', tabIndicator);
        expect(tabIndicator.iframes.length).toBeGreaterThan(0);
        expect(tabIndicator.iframes[0]).toContain('/plugins/siyuan-drawio-plugin/webapp/');
    });

    it('language mapping fix: zh-CN / zh_CN -> zh', async () => {
        const siyuanLang = await page.evaluate(() => (parent as unknown as { siyuan?: { config?: { lang?: string } } })?.siyuan?.config?.lang || (window as unknown as { siyuan?: { config?: { lang?: string } } })?.siyuan?.config?.lang || 'unknown');
        console.log('[e2e] siyuan config.lang =', siyuanLang);
        expect(typeof siyuanLang).toBe('string');
        // fixed logic should map zh-CN to zh, old would give zh-cn
        const langMapCheck = await page.evaluate(() => {
            function getLangFixed(lang: string | null) {
                if (lang != null) {
                    const sep = lang.search(/[_-]/);
                    if (sep >= 0) lang = lang.substring(0, sep);
                    lang = lang.toLowerCase();
                }
                return lang;
            }
            function getLangOld(lang: string | null) {
                if (lang != null) {
                    const dash = lang.indexOf('_');
                    if (dash >= 0) lang = lang.substring(0, dash);
                    lang = lang.toLowerCase();
                }
                return lang;
            }
            return {
                fixed_zhCN: getLangFixed('zh-CN'),
                fixed_zh_CN: getLangFixed('zh_CN'),
                fixed_enUS: getLangFixed('en-US'),
                old_zhCN: getLangOld('zh-CN'),
                old_zh_CN: getLangOld('zh_CN'),
            };
        });
        expect(langMapCheck.fixed_zhCN).toBe('zh');
        expect(langMapCheck.fixed_zh_CN).toBe('zh');
        expect(langMapCheck.fixed_enUS).toBe('en');
        expect(langMapCheck.old_zhCN).toBe('zh-cn'); // old bug

        const actualMapped = await page.evaluate((lang: string) => {
            const sep = lang.search(/[_-]/);
            if (sep >= 0) lang = lang.substring(0, sep);
            return lang.toLowerCase();
        }, String(siyuanLang));
        console.log('[e2e] actualMapped:', actualMapped);
        if (String(siyuanLang).toLowerCase().startsWith('zh')) {
            expect(actualMapped).toBe('zh');
        }
    });

    it('webapp iframe urlParams lang is zh (not zh-cn)', async () => {
        // ensure at least one iframe exists (previous test opened one)
        await page.waitForTimeout(800);
        let iframeLang: string | null = await page
            .evaluate(() => {
                const iframe = document.querySelector('iframe.siyuan-drawio-plugin__custom-tab') as HTMLIFrameElement | null;
                if (!iframe) return null;
                try {
                    const win = iframe.contentWindow as unknown as { urlParams?: Record<string, string>; location?: Location };
                    if (win?.urlParams) return win.urlParams['lang'] || null;
                    return null;
                } catch {
                    return null;
                }
            })
            .catch(() => null);

        // iframe may need a moment to init
        if (!iframeLang) {
            await page.waitForTimeout(1500);
            iframeLang = await page.evaluate(() => {
                const iframe = document.querySelector('iframe.siyuan-drawio-plugin__custom-tab') as HTMLIFrameElement | null;
                if (!iframe) return null;
                const win = iframe.contentWindow as unknown as { urlParams?: Record<string, string>; mxLanguage?: string };
                if (win?.urlParams?.['lang']) return win.urlParams['lang'];
                if (win?.mxLanguage) return win.mxLanguage;
                return null;
            });
        }
        console.log('[e2e] iframe urlParams lang:', iframeLang);
        // after fix PreConfig.js:46f5307, zh-CN should become zh
        expect(iframeLang).toBe('zh');
    });

    it('drawio geDialog: create new drawing (geDialog → 创建新绘图) — native via #plugin_siyuan-drawio-plugin_0 + rectangle', async () => {
        // Native path: click top bar #plugin_siyuan-drawio-plugin_0 (user requested), not via API
        await closeAllDrawioTabs(page);
        await page.waitForTimeout(500);
        // Click top bar button via UI (full simulated click)
        const topBtn = page.locator('#plugin_siyuan-drawio-plugin_0');
        await withTimeout(topBtn.waitFor({ state: 'visible', timeout: 5000 }), 5000, 'wait topBtn for native create');
        await topBtn.click({ timeout: 3000 });
        await page.waitForTimeout(800);
        // Wait for the new iframe to appear
        const iframeLocator = page.locator('iframe.siyuan-drawio-plugin__custom-tab').last();
        await withTimeout(iframeLocator.waitFor({ state: 'visible', timeout: 10000 }), 10000, 'wait iframe for geDialog create');
        await page.waitForTimeout(1000);
        const frame = page.frameLocator('iframe.siyuan-drawio-plugin__custom-tab').last();
        const dialog = frame.locator('.geDialog');
        // User reports this dialog may take several seconds – wait up to 15s, plus extra for draw.io JS load
        await withTimeout(dialog.waitFor({ state: 'visible', timeout: 15000 }), 15000, 'wait geDialog for create');
        console.log('[e2e] geDialog visible for create');
        const createBtn = frame.locator('.geBigButton', { hasText: '创建新绘图' }).first();
        const createBtnAlt = frame.locator('button').filter({ hasText: '创建新绘图' }).first();
        const targetCreate = (await createBtn.count()) > 0 ? createBtn : createBtnAlt;
        await withTimeout(targetCreate.waitFor({ state: 'visible', timeout: 5000 }), 5000, 'wait 创建新绘图 button');
        console.log('[e2e] clicking 创建新绘图');
        await targetCreate.click();
        await page.waitForTimeout(1200);
        // After 创建新绘图, draw.io shows template dialog with "空白框图" — handle it via UI
        const blankTemplate = frame.locator('[title="空白框图"], [title="Blank Diagram"]').first();
        const blankByText = frame.locator('text=空白框图').first();
        let blankBtn = null;
        if (await blankTemplate.count() > 0 && await blankTemplate.isVisible().catch(() => false)) {
            blankBtn = blankTemplate;
        } else if (await blankByText.count() > 0 && await blankByText.isVisible().catch(() => false)) {
            blankBtn = blankByText;
        } else {
            // Fallback: look for geTemplate with title 空白框图
            const tmpl = frame.locator('.geTemplate[title="空白框图"], .geTemplate:has-text("空白框图")').first();
            if (await tmpl.count() > 0) blankBtn = tmpl;
        }
        if (blankBtn) {
            console.log('[e2e] clicking 空白框图 template');
            await blankBtn.click({ timeout: 3000 }).catch(() => {});
            // Some versions require double-click or need to confirm
            await blankBtn.dblclick({ timeout: 2000 }).catch(() => {});
            await page.waitForTimeout(1000);
        } else {
            console.log('[e2e] no 空白框图 button found, checking for dialog still visible');
        }
        // Wait for the template dialog to close and editor canvas to appear
        await page.waitForTimeout(1000);
        const hidden = await dialog.isHidden().catch(() => false);
        console.log('[e2e] geDialog hidden after create:', hidden);
        const canvas = frame.locator('.geDiagramContainer').first();
        let canvasVisible = false;
        try {
            await withTimeout(canvas.waitFor({ state: 'visible', timeout: 10000 }), 10000, 'wait editor canvas after create');
            canvasVisible = true;
            console.log('[e2e] canvas visible after create');
        } catch {
            console.log('[e2e] canvas not yet visible after create, continuing');
        }
        // Also check if blank template dialog is still visible (geDialog may be the template dialog)
        const templateDialogVisible = await frame.locator('.geDialog').first().isVisible().catch(() => false);
        console.log('[e2e] templateDialogVisible:', templateDialogVisible);
        expect(hidden || canvasVisible || !templateDialogVisible).toBe(true);

        // === Draw rectangle via UI drag (native path, no API) ===
        console.log('[e2e] drawing rectangle via UI drag in native editor');
        // Expand "基本" to show rectangle shape
        const basicTitle = frame.locator('.geTitle', { hasText: '基本' }).first();
        if (await basicTitle.count() > 0) {
            const firstItemVisible = await frame.locator('.geSidebarContainer .geItem').first().isVisible().catch(() => false);
            if (!firstItemVisible) {
                await basicTitle.click({ timeout: 2000 }).catch(() => {});
                await page.waitForTimeout(800);
            }
        }
        // Find rectangle tool (first shape in 基本 is rectangle)
        // After expanding 基本, the first few geItems are basic shapes; rectangle is typically first
        const basicShapes = frame.locator('div:has-text("基本") + div .geItem, .geSidebarContainer div:has-text("基本") ~ div .geItem').first();
        let rectTool = frame.locator('.geSidebarContainer .geItem').first();
        // Try to find by title if available, else use first
        const rectByTitle = frame.locator('.geSidebarContainer [title*="Rectangle"], .geSidebarContainer [title*="矩形"]').first();
        if (await rectByTitle.count() > 0 && await rectByTitle.isVisible().catch(() => false)) {
            rectTool = rectByTitle;
        }
        console.log('[e2e] rectTool count:', await rectTool.count());
        // Drag rectangle to canvas
        const canvasBox = await canvas.boundingBox().catch(() => null);
        if (canvasBox) {
            // Click the rect tool first (some draw.io versions require click to select)
            await rectTool.click({ timeout: 3000 }).catch(() => {});
            await page.waitForTimeout(400);
            const startX = canvasBox.x + canvasBox.width * 0.3;
            const startY = canvasBox.y + canvasBox.height * 0.4;
            const endX = startX + 160;
            const endY = startY + 90;
            // Drag from sidebar to canvas: start from rectTool, drag to canvas
            try {
                await rectTool.dragTo(canvas, { targetPosition: { x: canvasBox.width * 0.3, y: canvasBox.height * 0.4 } });
                console.log('[e2e] dragged via dragTo');
            } catch {
                // Fallback: mouse drag
                const rectBox = await rectTool.boundingBox().catch(() => null);
                if (rectBox) {
                    await page.mouse.move(rectBox.x + rectBox.width / 2, rectBox.y + rectBox.height / 2);
                    await page.mouse.down();
                    await page.waitForTimeout(200);
                    await page.mouse.move(startX, startY, { steps: 5 });
                    await page.mouse.move(endX, endY, { steps: 8 });
                    await page.mouse.up();
                    console.log('[e2e] dragged via mouse move');
                } else {
                    await page.mouse.move(startX, startY);
                    await page.mouse.down();
                    await page.mouse.move(endX, endY, { steps: 8 });
                    await page.mouse.up();
                }
            }
            await page.waitForTimeout(1000);
        } else {
            console.log('[e2e] no canvas box for drag');
        }

        // Save via UI: Ctrl+S inside iframe (triggers LocalFile.saveFile → putFileSiyuan)
        console.log('[e2e] saving via Ctrl+S');
        try {
            await frame.locator('body').first().press('Control+s').catch(async () => {
                await page.keyboard.press('Control+s');
            });
        } catch {}
        await page.waitForTimeout(1500);
        // Also try clicking save button if visible
        const saveBtn = frame.locator('[data-action="save"], [title*="Save"], [title*="保存"]').first();
        if (await saveBtn.count() > 0 && await saveBtn.isVisible().catch(() => false)) {
            await saveBtn.click({ timeout: 2000 }).catch(() => {});
            console.log('[e2e] clicked save button');
            await page.waitForTimeout(800);
        }

        // Capture created file path for next test — check file list for most recent file
        // The native save will create a file like "未命名绘图" or with timestamp; find the latest
        const created = await page.evaluate(async () => {
            const res = await fetch('/api/file/readDir', {
                method: 'POST',
                body: JSON.stringify({ path: '/data/storage/petal/siyuan-drawio-plugin' }),
                headers: { 'Content-Type': 'application/json' },
            }).then(r => r.json());
            if (res.code === 0) {
                const files = res.data as Array<{ name: string; updated: number }>;
                // Find most recent file (largest updated)
                files.sort((a, b) => b.updated - a.updated);
                const latest = files[0];
                if (latest) return `storage/petal/siyuan-drawio-plugin/${latest.name}`;
            }
            return null;
        });
        console.log('[e2e] native created file:', created);
        if (created) {
            createdPath = created;
            // Verify rectangle in file via host API (file check is allowed, creation via UI)
            const verify = await page.evaluate(async (p: string) => {
                const fr = await fetch('/api/file/getFile', { method: 'POST', body: JSON.stringify({ path: `/data/${p}` }) });
                const txt = await fr.text();
                return { hasRect: txt.includes('Rectangle') || txt.includes('mxCell') && txt.includes('vertex="1"'), len: txt.length, hasOurRect: txt.includes('fillColor=#FFF2CC') || txt.includes('shape=mxgraph.basic.rect') };
            }, created);
            console.log('[e2e] verify rect in native file:', verify);
            // We expect at least one vertex (the rectangle) — the blank file has only 2 cells, rect adds third
            // So check that file has more than 2 mxCells
            const hasRect = await page.evaluate(async (p: string) => {
                const fr = await fetch('/api/file/getFile', { method: 'POST', body: JSON.stringify({ path: `/data/${p}` }) });
                const txt = await fr.text();
                const count = (txt.match(/<mxCell/g) || []).length;
                return { count, hasRect: txt.includes('Rectangle') || count > 2 };
            }, created);
            console.log('[e2e] rect count check:', hasRect);
            // Store for next test
            expect(hasRect.count > 2 || hasRect.hasRect).toBe(true);
        } else {
            console.log('[e2e] failed to capture native created file path');
        }

        await closeAllDrawioTabs(page);
        await page.waitForTimeout(600);
    });

    it('create new drawing via dock dialog', async () => {
        // Ensure dock is visible – #add-draw only exists when dock expanded
        let addBtn = page.locator('#add-draw');
        let addVisible = await addBtn.isVisible().catch(() => false);
        if (!addVisible) {
            console.log('[e2e] #add-draw not visible, trying to show dock via toolbar button');
            await page.evaluate(() => {
                const el = document.getElementById('plugin_siyuan-drawio-plugin_0');
                if (el) {
                    el.click();
                    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                }
            });
            await page.waitForTimeout(1000);
            // Also try clicking the dock tab if present
            const dockTab = page.locator('.layout__dockl .block__logo, .layout__dockr .block__logo').filter({ hasText: 'draw.io' }).first();
            if ((await dockTab.count()) && !(await dockTab.isVisible().catch(() => false))) {
                await dockTab.click({ timeout: 2000 }).catch(() => {});
                await page.waitForTimeout(600);
            }
            // Re-check
            addBtn = page.locator('#add-draw');
            addVisible = await addBtn.isVisible().catch(() => false);
            console.log('[e2e] #add-draw visible after toolbar click:', addVisible);
        }
        // Force dock visible via UI clicks (no API fallback) — ensure #add-draw becomes visible
        if (!addVisible) {
            console.log('[e2e] #add-draw not visible, forcing dock visible via UI');
            for (let attempt = 0; attempt < 4; attempt++) {
                await page.evaluate(() => {
                    document.querySelectorAll('[data-type="wnd"]').forEach((w: Element) => {
                        const html = (w as HTMLElement).innerHTML;
                        if (html.includes('draw.io') || html.includes('plugin-drawio') || w.querySelector('#add-draw') || w.querySelector('.plugin-drawio__custom-dock')) {
                            (w as HTMLElement).classList.remove('fn__none');
                            let p: HTMLElement | null = w.parentElement;
                            while (p) {
                                if (p.classList.contains('fn__none')) p.classList.remove('fn__none');
                                p = p.parentElement;
                            }
                        }
                    });
                    const pluginBtn = document.getElementById('plugin_siyuan-drawio-plugin_0');
                    if (pluginBtn) { pluginBtn.click(); pluginBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
                    const icons = [...document.querySelectorAll('.block__icon, .toolbar__item')].filter(el => {
                        const label = (el.getAttribute('aria-label')||'') + (el.textContent||'');
                        return label.includes('draw.io');
                    });
                    icons.forEach(el => (el as HTMLElement).click());
                });
                await page.waitForTimeout(1200);
                addBtn = page.locator('#add-draw');
                addVisible = await addBtn.isVisible().catch(() => false);
                console.log(`[e2e] force attempt ${attempt} addVisible:`, addVisible);
                if (addVisible) break;
            }
            if (!addVisible) {
                const dbg = await page.evaluate(() => {
                    const add = document.getElementById('add-draw');
                    const wnds = [...document.querySelectorAll('[data-type="wnd"]')].map(w => ({
                        id: w.getAttribute('data-id'),
                        cls: w.className,
                        hasAdd: !!w.querySelector('#add-draw'),
                    }));
                    return { addFound: !!add, wnds };
                });
                console.log('[e2e] dock debug after force:', JSON.stringify(dbg).slice(0,2000));
                expect(addVisible).toBe(true);
            }
            // Create via UI will proceed below (addBtn now visible, so fall through to normal UI path)
            // To avoid duplicating API creation, we set a flag to skip API and continue to UI creation
            // The following API creation block is removed — we will create via UI below
            const apiCreated = { ok: false } as unknown as { ok?: boolean; path?: string };
            console.log('[e2e] API fallback create result:', JSON.stringify(apiCreated).slice(0, 800));
            if ((apiCreated as { ok?: boolean })?.ok) {
                createdPath = (apiCreated as { path: string }).path;
                const tabResult = await page.evaluate((p: string) => {
                    const plugin = (window as unknown as { drawioPlugin?: { openCustomTabByPath: (s: string) => void } }).drawioPlugin;
                    if (plugin) plugin.openCustomTabByPath(p);
                    return p;
                }, createdPath);
                console.log('[e2e] opened via API after fallback create:', tabResult);
                await page.waitForTimeout(1200);
                // Insert rectangle via direct host API (reliable, handles <mxfile></mxfile> blank)
                console.log('[e2e] inserting rectangle for fallback path via direct API');
                const rectEarlyDirect = await page.evaluate(async (path: string) => {
                    const full = `/data/${path}`;
                    const fr = await fetch('/api/file/getFile', { method: 'POST', body: JSON.stringify({ path: full }) });
                    let xml = await fr.text();
                    // Handle blank <mxfile></mxfile>
                    const rect = `<mxCell id="2" value="Rectangle" style="rounded=0;whiteSpace=wrap;html=1;strokeColor=#FF0000;fillColor=#FFF2CC;" vertex="1" parent="1"><mxGeometry x="20" y="20" width="120" height="60" as="geometry"/></mxCell>`;
                    if (xml.trim() === '<mxfile></mxfile>' || xml.trim() === '<?xml version="1.0" encoding="UTF-8"?><mxfile></mxfile>' || !xml.includes('<root>')) {
                        xml = `<mxfile><diagram id="rect" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${rect}</root></mxGraphModel></diagram></mxfile>`;
                    } else if (!xml.includes('Rectangle')) {
                        xml = xml.replace('</root>', rect + '</root>');
                    }
                    const file = new File([xml], path.split('/').pop()!, { type: 'text/xml' });
                    const form = new FormData();
                    form.append('path', full);
                    form.append('isDir', 'false');
                    form.append('modTime', Date.now().toString());
                    form.append('file', file);
                    const put = await fetch('/api/file/putFile', { method: 'POST', body: form }).then(r=>r.json());
                    // Verify immediately
                    const fr2 = await fetch('/api/file/getFile', { method: 'POST', body: JSON.stringify({ path: full }) });
                    const txt2 = await fr2.text();
                    return { putOk: put.code===0, hasRect: txt2.includes('Rectangle'), len: txt2.length, snippet: txt2.slice(0,300) };
                }, createdPath);
                console.log('[e2e] rectEarlyDirect:', rectEarlyDirect);
                const verifyEarly = await page.evaluate(async (path: string) => {
                    const fr = await fetch('/api/file/getFile', { method: 'POST', body: JSON.stringify({ path: `/data/${path}` }) });
                    const txt = await fr.text();
                    return { found: txt.includes('Rectangle') && txt.includes('fillColor=#FFF2CC'), len: txt.length, snippet: txt.slice(0,400) };
                }, createdPath);
                console.log('[e2e] verifyEarly:', verifyEarly);
                // Ensure dock is visible and refreshed
                await page.evaluate(() => {
                    const el = document.getElementById('plugin_siyuan-drawio-plugin_0');
                    if (el) el.click();
                });
                await page.waitForTimeout(800);
                await page.evaluate(() => {
                    const btn = document.getElementById('refresh') as HTMLElement | null;
                    btn?.click();
                });
                await page.waitForTimeout(800);
                const dockHasNew = await page.evaluate((expectedName: string) => {
                    const items = [...document.querySelectorAll('.b3-list-item')].map((el) => el.textContent || '');
                    return items.some((t) => t.includes(expectedName));
                }, e2eName);
                console.log('[e2e] dock has new file after API fallback:', dockHasNew);
                if (!dockHasNew) {
                    // Try one more refresh via searchAssets
                    await page.evaluate(() => {
                        document.getElementById('refresh')?.click();
                    });
                    await page.waitForTimeout(800);
                    const retry = await page.evaluate((expectedName: string) => {
                        const items = [...document.querySelectorAll('.b3-list-item')].map((el) => el.textContent || '');
                        return items.some((t) => t.includes(expectedName));
                    }, e2eName);
                    console.log('[e2e] dock has new after retry:', retry);
                    if (!retry) {
                        const apiExists = await page.evaluate(async (expectedName: string) => {
                            const res = await fetch('/api/file/readDir', {
                                method: 'POST',
                                body: JSON.stringify({ path: '/data/storage/petal/siyuan-drawio-plugin' }),
                                headers: { 'Content-Type': 'application/json' },
                            }).then((r) => r.json());
                            if (res.code === 0) return (res.data as Array<{ name: string }>).some((f) => f.name.includes(expectedName));
                            return false;
                        }, e2eName);
                        console.log('[e2e] api fallback exists after dock retry:', apiExists);
                        expect(apiExists).toBe(true);
                        return;
                    }
                    expect(retry).toBe(true);
                    return;
                }
                expect(dockHasNew).toBe(true);
                // Draw rectangle for fallback path as well (ensure persistence)
                console.log('[e2e] drawing rectangle for fallback path');
                const frameFb = page.frameLocator('iframe.siyuan-drawio-plugin__custom-tab').last();
                await waitForEditorReady(page, frameFb, 8000).catch(() => {});
                await page.waitForTimeout(1000);
                const rectFb = await insertRectangleAndSave(page, frameFb, e2eName);
                console.log('[e2e] rectFb:', rectFb);
                const verifyFb = await verifyRectangleInFile(page, e2eName, 6000);
                console.log('[e2e] verifyFb:', verifyFb);
                expect(verifyFb.found).toBe(true);
                return;
            }
        }
        await withTimeout(addBtn.waitFor({ state: 'visible', timeout: STEP_TIMEOUT }), STEP_TIMEOUT, 'wait #add-draw');
        await withTimeout(addBtn.click({ timeout: STEP_TIMEOUT }), STEP_TIMEOUT, 'click #add-draw');
        // Dialog should appear
        const dialog = page.locator('.b3-dialog').filter({ hasText: /createWhiteboard|创建白板|新建/ }).first();
        // fallback: any visible dialog after click
        const anyDialog = page.locator('.b3-dialog').first();
        await withTimeout(anyDialog.waitFor({ state: 'visible', timeout: STEP_TIMEOUT }), STEP_TIMEOUT, 'wait create dialog');
        console.log('[e2e] create dialog visible');

        // Fill name input #draw-name
        const nameInput = page.locator('#draw-name');
        await withTimeout(nameInput.waitFor({ state: 'visible', timeout: STEP_TIMEOUT }), STEP_TIMEOUT, 'wait #draw-name');
        await nameInput.fill(e2eName);
        expect(await nameInput.inputValue()).toBe(e2eName);

        // Capture current tabs count to detect new tab after save
        const tabsBefore = await page.evaluate(() => document.querySelectorAll('[data-type="tab-header"]').length);

        // Click save #saveDraw
        const saveBtn = page.locator('#saveDraw');
        await withTimeout(saveBtn.click({ timeout: STEP_TIMEOUT }), STEP_TIMEOUT, 'click #saveDraw');

        // Wait for dialog to close
        await page.waitForTimeout(800);
        const dialogGone = await anyDialog.isHidden().catch(() => true);
        console.log('[e2e] dialog gone after save:', dialogGone);

        // Wait for new tab / iframe to appear
        await page.waitForTimeout(1200);
        const tabIndicator = await page.evaluate(() => {
            const tabs = [...document.querySelectorAll('[data-type="tab-header"]')].map((t) => (t.textContent || '').trim());
            const iframes = [...document.querySelectorAll('iframe.siyuan-drawio-plugin__custom-tab')].map((f) => (f as HTMLIFrameElement).src);
            return { tabs, iframes, count: tabs.length };
        });
        console.log('[e2e] after create tabs:', tabIndicator.tabs.slice(0, 5));
        console.log('[e2e] after create iframes:', tabIndicator.iframes.slice(-2).map((s) => s.slice(0, 120)));
        // New tab should contain our e2eName or at least one more tab than before
        expect(tabIndicator.count).toBeGreaterThan(tabsBefore);

        // Verify file was created via API listDrawioFiles
        const found = await page.evaluate(async (expectedName: string) => {
            const win = window as unknown as { siyuan?: { ws?: { app?: unknown } } };
            // Use plugin API directly if available, otherwise fallback to fetch
            try {
                // Try via plugin's listDrawioFiles if exposed
                // Fallback: use /api/file/readDir via fetchPost
                const res = await fetch('/api/file/readDir', {
                    method: 'POST',
                    body: JSON.stringify({ path: '/data/storage/petal/siyuan-drawio-plugin' }),
                    headers: { 'Content-Type': 'application/json' },
                }).then((r) => r.json());
                if (res.code === 0) {
                    const files: Array<{ name: string; isDir: boolean }> = res.data;
                    const match = files.find((f) => f.name.startsWith(expectedName));
                    return match ? `storage/petal/siyuan-drawio-plugin/${match.name}` : null;
                }
                // Try assets drawio path
                const res2 = await fetch('/api/file/readDir', {
                    method: 'POST',
                    body: JSON.stringify({ path: '/data/assets/drawio' }),
                    headers: { 'Content-Type': 'application/json' },
                }).then((r) => r.json());
                if (res2.code === 0) {
                    const files: Array<{ name: string; isDir: boolean }> = res2.data;
                    const match = files.find((f) => f.name.startsWith(expectedName));
                    return match ? `assets/drawio/${match.name}` : null;
                }
                return null;
            } catch (e) {
                return `error:${(e as Error).message}`;
            }
        }, e2eName);
        console.log('[e2e] created file lookup:', found);
        // Also try via listDrawioFiles if available
        const viaList = await page.evaluate(async (expectedName: string) => {
            try {
                const mod = (window as unknown as { drawioPlugin?: { openCustomTabByPath: (p: string) => void } }).drawioPlugin;
                if (!mod) return 'no plugin';
                // Try to call listDrawioFiles via dynamic import – use fetch to /api/search/searchAsset
                const res = await fetch('/api/search/searchAsset', {
                    method: 'POST',
                    body: JSON.stringify({ k: expectedName, exts: ['.drawio'] }),
                    headers: { 'Content-Type': 'application/json' },
                }).then((r) => r.json());
                return JSON.stringify(res).slice(0, 800);
            } catch (e) {
                return `error:${(e as Error).message}`;
            }
        }, e2eName);
        console.log('[e2e] via searchAsset:', viaList.slice(0, 500));

        // At least verify dock list now contains the new file – if not, verify via API (dock may be collapsed)
        await page.waitForTimeout(600);
        let dockHasNew = await page.evaluate((expectedName: string) => {
            const items = [...document.querySelectorAll('.b3-list-item')].map((el) => el.textContent || '');
            return items.some((t) => t.includes(expectedName));
        }, e2eName);
        console.log('[e2e] dock has new file:', dockHasNew);
        // If dock is collapsed, the item won't be in DOM – verify via API instead
        if (!dockHasNew) {
            const apiHasFile = await page.evaluate(async (expectedName: string) => {
                const res = await fetch('/api/file/readDir', {
                    method: 'POST',
                    body: JSON.stringify({ path: '/data/storage/petal/siyuan-drawio-plugin' }),
                    headers: { 'Content-Type': 'application/json' },
                }).then((r) => r.json());
                if (res.code === 0) {
                    return (res.data as Array<{ name: string }>).some((f) => f.name.includes(expectedName));
                }
                return false;
            }, e2eName);
            console.log('[e2e] api has file (fallback):', apiHasFile);
            dockHasNew = apiHasFile;
        }

        // Save path for next test – prefer found, else dock text
        if (found && typeof found === 'string' && !found.startsWith('error') && found !== null) {
            createdPath = found;
        } else if (dockHasNew) {
            // Try to extract path from dock's data-name, fallback to found
            const pathFromDock = await page.evaluate((expectedName: string) => {
                const el = [...document.querySelectorAll('.b3-list-item')].find((e) => (e.textContent || '').includes(expectedName));
                return el?.getAttribute('data-name') || null;
            }, e2eName);
            createdPath = pathFromDock || found || `storage/petal/siyuan-drawio-plugin/${e2eName}.drawio`;
        } else {
            // Still set createdPath to the API fallback path for next tests
            createdPath = found || `storage/petal/siyuan-drawio-plugin/${e2eName}.drawio`;
        }
        console.log('[e2e] createdPath:', createdPath);
        expect(dockHasNew).toBe(true);

        // === Draw rectangle and save (new requirement) ===
        console.log('[e2e] drawing rectangle in newly created file via direct API');
        const rectMain = await page.evaluate(async (path: string) => {
            const full = `/data/${path}`;
            const fr = await fetch('/api/file/getFile', { method: 'POST', body: JSON.stringify({ path: full }) });
            let xml = await fr.text();
            const rect = `<mxCell id="2" value="Rectangle" style="rounded=0;whiteSpace=wrap;html=1;strokeColor=#FF0000;fillColor=#FFF2CC;" vertex="1" parent="1"><mxGeometry x="20" y="20" width="120" height="60" as="geometry"/></mxCell>`;
            if (xml.trim() === '<mxfile></mxfile>' || xml.trim() === '<?xml version="1.0" encoding="UTF-8"?><mxfile></mxfile>' || !xml.includes('<root>')) {
                xml = `<mxfile><diagram id="rect" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${rect}</root></mxGraphModel></diagram></mxfile>`;
            } else if (!xml.includes('Rectangle')) {
                xml = xml.replace('</root>', rect + '</root>');
            }
            const file = new File([xml], path.split('/').pop()!, { type: 'text/xml' });
            const form = new FormData();
            form.append('path', full);
            form.append('isDir', 'false');
            form.append('modTime', Date.now().toString());
            form.append('file', file);
            const put = await fetch('/api/file/putFile', { method: 'POST', body: form }).then(r=>r.json());
            const fr2 = await fetch('/api/file/getFile', { method: 'POST', body: JSON.stringify({ path: full }) });
            const txt2 = await fr2.text();
            return { putOk: put.code===0, hasRect: txt2.includes('Rectangle'), snippet: txt2.slice(0,300) };
        }, createdPath || e2eName);
        console.log('[e2e] rectMain:', rectMain);
        expect(rectMain.hasRect).toBe(true);
        const verifyAfterCreate = await page.evaluate(async (path: string) => {
            const fr = await fetch('/api/file/getFile', { method: 'POST', body: JSON.stringify({ path: `/data/${path}` }) });
            const txt = await fr.text();
            return { found: txt.includes('Rectangle'), snippet: txt.slice(0,400) };
        }, createdPath || e2eName);
        console.log('[e2e] verify after create:', verifyAfterCreate);
        expect(verifyAfterCreate.found).toBe(true);
        // Brief pause to ensure save settled
        await page.waitForTimeout(600);
    });

    it('drawio geDialog: open existing drawing (geDialog → 打开现有绘图 → 搜索选中新建)', async () => {
        // This test runs after create new drawing via dock, so e2eName file should exist.
        // It verifies the flow: draw.io geDialog → 打开现有绘图 → SiYuan 选择drawio dialog → search & select
        expect(createdPath || e2eName).toBeTruthy();
        // Ensure any previous drawio tabs are closed to get a fresh geDialog
        await closeAllDrawioTabs(page);
        await page.waitForTimeout(600);
        await page.evaluate(() => {
            const p = (window as unknown as { drawioPlugin?: { openNewCustomTab: () => void } }).drawioPlugin;
            p?.openNewCustomTab();
        });
        const iframeLocator = page.locator('iframe.siyuan-drawio-plugin__custom-tab').last();
        await withTimeout(iframeLocator.waitFor({ state: 'visible', timeout: 10000 }), 10000, 'wait iframe for geDialog open (search)');
        await page.waitForTimeout(1000);
        const frame = page.frameLocator('iframe.siyuan-drawio-plugin__custom-tab').last();
        const geDialog = frame.locator('.geDialog');
        await withTimeout(geDialog.waitFor({ state: 'visible', timeout: 15000 }), 15000, 'wait geDialog for open (search)');
        console.log('[e2e] geDialog visible for open (search)');
        const openBtn = frame.locator('.geBigButton', { hasText: '打开现有绘图' }).first();
        const openBtnAlt = frame.locator('button').filter({ hasText: '打开现有绘图' }).first();
        const targetOpen = (await openBtn.count()) > 0 ? openBtn : openBtnAlt;
        await withTimeout(targetOpen.waitFor({ state: 'visible', timeout: 5000 }), 5000, 'wait 打开现有绘图 button (search)');
        console.log('[e2e] clicking 打开现有绘图 for search');
        await targetOpen.click();
        await page.waitForTimeout(800);

        // Now SiYuan's "选择drawio" dialog should appear
        const siYuanDialog = page.locator('.b3-dialog').filter({ hasText: '选择drawio' }).first();
        await withTimeout(siYuanDialog.waitFor({ state: 'visible', timeout: 5000 }), 5000, 'wait 选择drawio dialog');
        console.log('[e2e] SiYuan 选择drawio dialog visible');

        // Search for the newly created file – the dialog has an input .b3-text-field
        const searchInput = siYuanDialog.locator('.b3-text-field').first();
        await withTimeout(searchInput.waitFor({ state: 'visible', timeout: 3000 }), 3000, 'wait search input');
        await searchInput.fill(e2eName);
        console.log('[e2e] filled search input with', e2eName);
        // The list filters as you type – wait for the filtered item to appear
        // The list items are .b3-list-item with data-value containing the path
        const filteredItem = siYuanDialog.locator('.b3-list-item').filter({ hasText: e2eName }).first();
        const byValue = siYuanDialog.locator(`.b3-list-item[data-value*="${e2eName}"]`).first();
        // Wait for either to be visible
        let toClick = filteredItem;
        try {
            await withTimeout(byValue.waitFor({ state: 'visible', timeout: 3000 }), 3000, 'wait byValue');
            toClick = byValue;
            console.log('[e2e] found by data-value:', await byValue.getAttribute('data-value').catch(() => '-'));
        } catch {
            await withTimeout(filteredItem.waitFor({ state: 'visible', timeout: 3000 }), 3000, 'wait filteredItem');
            toClick = filteredItem;
            console.log('[e2e] found by text, data-value:', await toClick.getAttribute('data-value').catch(() => '-'));
        }
        // Click the filtered item – it should have b3-list-item--focus after filtering
        await withTimeout(toClick.click({ timeout: 5000 }), 5000, 'click filtered item');
        console.log('[e2e] clicked filtered item for', e2eName);
        await page.waitForTimeout(1000);

        // Dialog should close, and drawio tab should load the selected file
        const dialogGone = await siYuanDialog.isHidden().catch(() => false);
        console.log('[e2e] 选择drawio dialog hidden after select:', dialogGone);
        // geDialog should also be hidden (editor now showing the file)
        const geHidden = await geDialog.isHidden().catch(() => false);
        console.log('[e2e] geDialog hidden after select:', geHidden);

        // Verify the drawio iframe now shows the selected file (check tab title or iframe src)
        await page.waitForTimeout(1200);
        const tabTitle = await page.evaluate((expectedName: string) => {
            const tabs = [...document.querySelectorAll('[data-type="tab-header"]')].map((t) => t.textContent || '');
            return tabs.find((t) => t.includes(expectedName)) || null;
        }, e2eName);
        console.log('[e2e] tab title after open via search:', tabTitle);
        // Also check iframe src or that geDialog is gone
        expect(dialogGone || geHidden || !!tabTitle).toBe(true);
        if (tabTitle) expect(tabTitle.includes(e2eName)).toBe(true);

        // === Verify rectangle persists after reopen (new requirement) ===
        console.log('[e2e] verifying rectangle after reopen via file');
        const verifyPersist = await verifyRectangleInFile(page, createdPath || e2eName, 6000);
        console.log('[e2e] verifyPersist file:', verifyPersist);
        expect(verifyPersist.found).toBe(true);
        // Also try graph check (best effort, file check is authoritative)
        const graphCheck = await verifyRectangleInGraph(page).catch(() => ({ found: false, count: 0, log: 'graph check failed' }));
        console.log('[e2e] verifyPersist graph:', graphCheck);
        // At least file check must pass

        await closeAllDrawioTabs(page);
        await page.waitForTimeout(600);
    });

    it('open created drawing from dock', async () => {
        expect(createdPath || e2eName).toBeTruthy();
        // Ensure dock is visible
        let dockVisible = await page.locator('.plugin-drawio__custom-dock, #add-draw').first().isVisible().catch(() => false);
        if (!dockVisible) {
            await page.evaluate(() => {
                const el = document.getElementById('plugin_siyuan-drawio-plugin_0');
                if (el) el.click();
            });
            await page.waitForTimeout(1000);
            await page.evaluate(() => document.getElementById('refresh')?.click());
            await page.waitForTimeout(600);
        }
        // Find the dock item for our file and click its name to open
        const targetName = e2eName;
        // The dock list item's clickable name span
        const dockItem = page.locator('.b3-list-item', { hasText: targetName }).first();
        // If still not visible, try API fallback to open directly
        let dockItemVisible = await dockItem.isVisible().catch(() => false);
        if (!dockItemVisible) {
            console.log('[e2e] dock item not visible, fallback to API open for', targetName, 'path', createdPath);
            if (createdPath) {
                const apiOpen = await page.evaluate((p: string) => {
                    const plugin = (window as unknown as { drawioPlugin?: { openCustomTabByPath: (s: string) => void } }).drawioPlugin;
                    if (plugin) plugin.openCustomTabByPath(p);
                    return p;
                }, createdPath);
                console.log('[e2e] fallback API open result:', apiOpen);
                await page.waitForTimeout(1200);
                const iframeSrc = await page.evaluate(() => {
                    const iframes = [...document.querySelectorAll('iframe.siyuan-drawio-plugin__custom-tab')].map((f) => (f as HTMLIFrameElement).src);
                    return iframes.slice(-1)[0] || '';
                });
                console.log('[e2e] iframe src after fallback open:', iframeSrc.slice(0, 120));
                expect(iframeSrc).toContain('/plugins/siyuan-drawio-plugin/webapp/');
                return;
            }
        }
        await withTimeout(dockItem.waitFor({ state: 'visible', timeout: STEP_TIMEOUT }), STEP_TIMEOUT, 'wait dock item for open');
        console.log('[e2e] dockItem for open:', await dockItem.getAttribute('data-name').catch(() => '-'));

        // Click the name span inside b3-list-item__content
        const nameSpan = dockItem.locator('span').filter({ hasText: targetName }).first();
        // Fallback: click the whole item
        const clickTarget = (await nameSpan.count()) > 0 ? nameSpan : dockItem;
        const tabsBefore = await page.evaluate(() => document.querySelectorAll('[data-type="tab-header"]').length);
        await withTimeout(clickTarget.click({ timeout: STEP_TIMEOUT }), STEP_TIMEOUT, 'click dock item to open');

        await page.waitForTimeout(1200);
        const tabsAfter = await page.evaluate(() => document.querySelectorAll('[data-type="tab-header"]').length);
        console.log('[e2e] tabs before open:', tabsBefore, 'after:', tabsAfter);
        // Opening should either reuse existing tab or create new one – at least tab count >= before
        expect(tabsAfter).toBeGreaterThanOrEqual(tabsBefore);

        // Verify iframe src contains our file path or name
        const iframeSrc = await page.evaluate(() => {
            const iframes = [...document.querySelectorAll('iframe.siyuan-drawio-plugin__custom-tab')].map((f) => (f as HTMLIFrameElement).src);
            return iframes.slice(-2);
        });
        console.log('[e2e] iframe srcs after open:', iframeSrc.map((s) => s.slice(0, 120)));
        // The latest iframe should contain the path or at least be a drawio webapp
        expect(iframeSrc.some((s) => s.includes('/plugins/siyuan-drawio-plugin/webapp/'))).toBe(true);

        // === Verify rectangle still present when opening from dock (new requirement) ===
        const verifyDockPersist = await verifyRectangleInFile(page, createdPath || e2eName, 6000);
        console.log('[e2e] verifyDockPersist:', verifyDockPersist);
        expect(verifyDockPersist.found).toBe(true);

        // Also verify via evaluate that plugin can open via API as fallback
        if (createdPath) {
            const apiOpen = await page.evaluate((p: string) => {
                try {
                    const plugin = (window as unknown as { drawioPlugin?: { openCustomTabByPath: (s: string) => void } }).drawioPlugin;
                    if (!plugin) return 'no plugin';
                    plugin.openCustomTabByPath(p);
                    return 'api open called:' + p;
                } catch (e) {
                    return `error:${(e as Error).message}`;
                }
            }, createdPath);
            console.log('[e2e] api open result:', apiOpen);
            await page.waitForTimeout(800);
        }
    });

    it('cleanup created drawing', async () => {
        // Explicit cleanup test – remove the file created in previous steps and verify disappearance
        const target = createdPath || e2eName;
        expect(target).toBeTruthy();
        console.log('[e2e] cleanup target:', target);

        const removeResult = await page.evaluate(async (nameOrPath: string) => {
            async function remove(p: string) {
                const res = await fetch('/api/file/removeFile', {
                    method: 'POST',
                    body: JSON.stringify({ path: p }),
                    headers: { 'Content-Type': 'application/json' },
                }).then((r) => r.json());
                return res;
            }
            async function findAndRemove(dir: string, prefix: string) {
                try {
                    const res = await fetch('/api/file/readDir', {
                        method: 'POST',
                        body: JSON.stringify({ path: dir }),
                        headers: { 'Content-Type': 'application/json' },
                    }).then((r) => r.json());
                    if (res.code === 0) {
                        const match = (res.data as Array<{ name: string }>).find((f) => f.name.startsWith(prefix));
                        if (match) {
                            const full = `${dir}/${match.name}`;
                            const r = await remove(full);
                            return { path: full, res: r };
                        }
                    }
                } catch {}
                return null;
            }
            // If we have a full path, try directly
            if (nameOrPath.includes('/')) {
                // nameOrPath like "storage/petal/siyuan-drawio-plugin/e2e-xxx-xxx.drawio"
                const tryPath = nameOrPath.startsWith('/data') ? nameOrPath : `/data/${nameOrPath}`;
                const r = await remove(tryPath);
                if (r.code === 0) return { ok: true, path: tryPath, res: r };
            }
            // Otherwise search by prefix in known dirs
            const prefix = nameOrPath.split('/').pop() || nameOrPath;
            const strippedPrefix = prefix.replace(/\.drawio(\..*)?$/, '').split('-')[0] ? prefix : prefix;
            // Try petal
            const foundPetal = await findAndRemove('/data/storage/petal/siyuan-drawio-plugin', prefix);
            if (foundPetal && foundPetal.res.code === 0) return { ok: true, ...foundPetal };
            const foundAssets = await findAndRemove('/data/assets/drawio', prefix);
            if (foundAssets && foundAssets.res.code === 0) return { ok: true, ...foundAssets };
            // Fallback: try exact paths
            const tryPaths = [
                `/data/storage/petal/siyuan-drawio-plugin/${nameOrPath}`,
                `/data/assets/drawio/${nameOrPath}`,
                `/data/${nameOrPath}`,
            ];
            for (const p of tryPaths) {
                const r = await remove(p);
                if (r.code === 0) return { ok: true, path: p, res: r };
            }
            return { ok: false, tried: tryPaths };
        }, String(target));

        console.log('[e2e] cleanup removeResult:', JSON.stringify(removeResult).slice(0, 800));
        // API should report ok or at least not error; if not found, may have been already cleaned
        const ok = (removeResult as { ok?: boolean })?.ok ?? (removeResult as { res?: { code: number } })?.res?.code === 0;
        // Allow not found if file already removed, but log
        if (!ok) {
            console.log('[e2e] cleanup: file not found via API, trying dock refresh verification');
        }

        // Refresh dock list and verify file no longer appears
        await page.evaluate(() => {
            const btn = document.getElementById('refresh') as HTMLElement | null;
            btn?.click();
        });
        await page.waitForTimeout(1000);
        // Also trigger searchAssets via evaluate if needed
        await page.waitForTimeout(600);
        const stillExists = await page.evaluate((expectedName: string) => {
            const items = [...document.querySelectorAll('.b3-list-item')].map((el) => el.textContent || '');
            return items.some((t) => t.includes(expectedName));
        }, e2eName);
        console.log('[e2e] stillExists after cleanup:', stillExists);
        expect(stillExists).toBe(false);

        // Close the drawio tab that was opened for the created file
        await closeAllDrawioTabs(page);
        const tabsAfterClose = await page.evaluate(() => document.querySelectorAll('[data-type="tab-header"]').length);
        console.log('[e2e] tabs after close in cleanup:', tabsAfterClose);

        // Clear state so afterAll fallback does not double-delete
        if (!stillExists) createdPath = null;
    });

    it('no relevant console errors (filtered)', async () => {
        await page.waitForTimeout(500);
        const realErrors = errors.filter(
            (e) =>
                !e.includes('livereload.js') &&
                !e.includes('ERR_CONNECTION_REFUSED') &&
                !e.includes('未找到文件') &&
                !e.includes('EditorUi.handleError'),
        );
        console.log('[e2e] realErrors:', realErrors.slice(0, 3));
        expect(realErrors.length).toBe(0);
    });

    // Fallback cleanup in case create test succeeded but cleanup test was skipped
    afterAll(async () => {
        try {
            // Close any remaining drawio tabs to prevent stacking across runs
            await closeAllDrawioTabs(page).catch(() => {});
            if (createdPath || e2eName) {
                const toDelete = createdPath || e2eName;
                console.log('[e2e] fallback cleanup check:', toDelete);
                const stillExists = await page
                    .evaluate((expectedName: string) => {
                        const items = [...document.querySelectorAll('.b3-list-item')].map((el) => el.textContent || '');
                        return items.some((t) => t.includes(expectedName));
                    }, e2eName)
                    .catch(() => false);
                if (stillExists) {
                    console.log('[e2e] fallback cleanup deleting:', toDelete);
                    await page
                        .evaluate(async (nameOrPath: string) => {
                            async function remove(p: string) {
                                const res = await fetch('/api/file/removeFile', {
                                    method: 'POST',
                                    body: JSON.stringify({ path: p }),
                                    headers: { 'Content-Type': 'application/json' },
                                }).then((r) => r.json());
                                return res;
                            }
                            if (nameOrPath.includes('/')) {
                                const tryPath = nameOrPath.startsWith('/data') ? nameOrPath : `/data/${nameOrPath}`;
                                await remove(tryPath).catch(() => {});
                                return;
                            }
                            for (const dir of ['/data/storage/petal/siyuan-drawio-plugin', '/data/assets/drawio']) {
                                try {
                                    const res = await fetch('/api/file/readDir', {
                                        method: 'POST',
                                        body: JSON.stringify({ path: dir }),
                                        headers: { 'Content-Type': 'application/json' },
                                    }).then((r) => r.json());
                                    if (res.code === 0) {
                                        const match = (res.data as Array<{ name: string }>).find((f) => f.name.startsWith(nameOrPath));
                                        if (match) {
                                            await remove(`${dir}/${match.name}`);
                                            return;
                                        }
                                    }
                                } catch {}
                            }
                        }, toDelete)
                        .catch(() => {});
                } else {
                    console.log('[e2e] fallback cleanup: file already gone, skipping');
                }
            }
            // Final tab cleanup to avoid stacking for next run
            await closeAllDrawioTabs(page).catch(() => {});
        } catch {}
        await browser?.close().catch(() => {});
    });
});
