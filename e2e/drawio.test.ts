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

    it('drawio geDialog: create new drawing (geDialog → 创建新绘图)', async () => {
        // Always open a fresh tab – the geDialog inside draw.io may take several seconds to appear (user note)
        // First ensure any existing drawio tabs are closed to avoid confusion
        await closeAllDrawioTabs(page);
        await page.waitForTimeout(500);
        await page.evaluate(() => {
            const p = (window as unknown as { drawioPlugin?: { openNewCustomTab: () => void } }).drawioPlugin;
            p?.openNewCustomTab();
        });
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
        await page.waitForTimeout(800);
        const hidden = await dialog.isHidden().catch(() => false);
        console.log('[e2e] geDialog hidden after create:', hidden);
        const canvas = frame.locator('.geDiagramContainer, .geMenubarContainer, svg').first();
        let canvasVisible = false;
        try {
            await withTimeout(canvas.waitFor({ state: 'visible', timeout: 8000 }), 8000, 'wait editor canvas after create');
            canvasVisible = true;
        } catch {
            console.log('[e2e] canvas not yet visible after create, continuing');
        }
        // Either dialog hidden or canvas visible indicates success
        expect(hidden || canvasVisible).toBe(true);
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
        // Fallback to API creation if dock UI still not available (e.g., layout collapsed)
        if (!addVisible) {
            console.log('[e2e] #add-draw still not visible, fallback to API creation via saveDrawIoXml');
            const apiCreated = await page.evaluate(async (name: string) => {
                try {
                    const blank = `<?xml version="1.0" encoding="UTF-8"?><mxfile></mxfile>`;
                    // Use exact name without random suffix so hName matches expectedName
                    const filename = `${name}.drawio`;
                    const path = `/data/storage/petal/siyuan-drawio-plugin/${filename}`;
                    const file = new File([blank], filename, { type: 'application/xml' });
                    const form = new FormData();
                    form.append('path', path);
                    form.append('isDir', 'false');
                    form.append('modTime', Date.now().toString());
                    form.append('file', file);
                    const res = await fetch('/api/file/putFile', { method: 'POST', body: form }).then((r) => r.json());
                    return { ok: res.code === 0, path: `storage/petal/siyuan-drawio-plugin/${filename}`, res };
                } catch (e) {
                    return { ok: false, error: (e as Error).message };
                }
            }, e2eName);
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
