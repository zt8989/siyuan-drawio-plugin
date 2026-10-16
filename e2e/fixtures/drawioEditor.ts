/**
 * Shared Playwright helpers for the editor-driven e2e files (issues #75, #76).
 *
 * Everything here was probed against a running SiYuan before being fixed (see
 * docs/e2e-probe-sop.md): the visible iframe, the plugin asset cache, and the
 * 文件 → 导出为 → <item> → 导出 menu path through the export dialogs.
 */

import { chromium, type Browser, type Page } from 'playwright';

const DEFAULT_CDP = process.env.CDP_URL || 'http://127.0.0.1:9222';
const DEFAULT_PATTERN = process.env.E2E_PATTERN || 'stage/build/app';
export const STEP_TIMEOUT = 10000;

export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    let t: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
        t = setTimeout(() => reject(new Error(`[timeout ${ms}ms] ${label}`)), ms);
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(t)) as Promise<T>;
}

async function resolveCdpEndpoint(cdp: string): Promise<string> {
    if (!cdp.startsWith('http')) return cdp;
    const res = await withTimeout(fetch(cdp.replace(/\/$/, '') + '/json/version').then((r) => r.json()), 3000, 'json/version');
    return (res as { webSocketDebuggerUrl?: string }).webSocketDebuggerUrl || cdp;
}

/** Connects to the running SiYuan and returns the main editor page. */
export async function connectEditorPage(): Promise<{ browser: Browser; page: Page }> {
    const browser = await chromium.connectOverCDP(await resolveCdpEndpoint(DEFAULT_CDP));

    for (const ctx of browser.contexts()) {
        for (const page of ctx.pages()) {
            if (page.url().includes(DEFAULT_PATTERN)) return { browser, page };
        }
    }

    throw new Error(`no SiYuan page matching "${DEFAULT_PATTERN}" on ${DEFAULT_CDP}`);
}

/**
 * Plugin webapp assets are cached per build, and a plain reload keeps serving the previous
 * build's PostConfig.js (probed: the patches then look uninstalled). Clear the cache and
 * reload when the loaded bundle is missing or from another plugin version, so a shared editor
 * session is not disturbed on every run. When iterating on the client patches in dev, force it
 * with E2E_FORCE_RELOAD=1 (the dev bundle keeps the same version).
 */
export async function ensureFreshAssets(page: Page): Promise<void> {
    const stale = await page.evaluate(async () => {
        const patch = (window as unknown as { __pdfExportPatch?: { installed?: boolean; bundleVersion?: string } }).__pdfExportPatch;
        if (!patch || !patch.installed) return true;

        try {
            const manifest = await fetch('/plugins/siyuan-drawio-plugin/plugin.json', { cache: 'no-store' }).then((r) => r.json());
            return !!patch.bundleVersion && patch.bundleVersion !== manifest.version;
        } catch (e) {
            return false;
        }
    });

    if (!stale && process.env.E2E_FORCE_RELOAD !== '1') return;

    const client = await page.context().newCDPSession(page);
    await client.send('Network.enable');
    await client.send('Network.clearBrowserCache');
    await page.reload({ waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => typeof (window as unknown as { drawioPlugin?: unknown }).drawioPlugin === 'object', null, { timeout: STEP_TIMEOUT });
    await page.waitForTimeout(1500);
}

export async function closeDrawioTabs(page: Page): Promise<void> {
    await page.evaluate(() => {
        [...document.querySelectorAll('li.item')].forEach((tab) => {
            if ((tab.textContent || '').includes('drawio')) {
                (tab.querySelector('.item__close') as HTMLElement | null)?.click();
            }
        });
    });
    await page.waitForTimeout(800);
}

/** Opens one drawio custom tab and creates a blank drawing in it (SOP steps 1–3). */
export async function openBlankDrawing(page: Page) {
    await page.evaluate(() => {
        (window as unknown as { drawioPlugin: { openNewCustomTab: () => void } }).drawioPlugin.openNewCustomTab();
    });

    const frame = page.frameLocator('iframe.siyuan-drawio-plugin__custom-tab:visible');
    await frame.locator('.geBigButton').filter({ hasText: /创建新绘图|Create New Diagram/ }).first().click({ timeout: STEP_TIMEOUT });
    await frame.locator('.geTemplate').filter({ hasText: /空白框图|Blank Diagram/ }).first().dblclick({ timeout: STEP_TIMEOUT });
    await frame.locator('.geDiagramContainer').waitFor({ state: 'visible', timeout: 20000 });

    return frame;
}

/**
 * Drives 文件 → 导出为 → <item> → 导出 in the editor, e.g. for 'PDF...', 'PNG...', 'SVG...'.
 * Every format opens its own dialog first; 导出 confirms it.
 */
export async function exportViaMenu(frame: ReturnType<Page['frameLocator']>, itemLabel: string): Promise<void> {
    await frame.locator('.geMenubar .geItem').filter({ hasText: /文件|File/ }).first().click();
    const exportAs = frame.locator('td.mxPopupMenuItem').filter({ hasText: /导出为|Export as/ }).first();
    await exportAs.hover();
    await frame
        .locator('tr.mxPopupMenuItem')
        .filter({ hasText: new RegExp(`^${itemLabel.replace('.', '\\.')}$`) })
        .first()
        .click({ timeout: STEP_TIMEOUT });

    const exportButton = frame.locator('.geDialog .geBtn, .geDialog button').filter({ hasText: /^导出$|^Export$/ }).first();
    await exportButton.click({ timeout: STEP_TIMEOUT });
}

/** Text of the SiYuan toasts currently on screen, joined for substring assertions. */
export async function snackbarText(page: Page): Promise<string> {
    return page.evaluate(() => [...document.querySelectorAll('.b3-snackbar')].map((n) => n.textContent || '').join(' | '));
}

/** Waits for a toast mentioning the given text (the host reports saved paths this way). */
export async function waitForSnackbar(page: Page, includes: string, timeout = 5000): Promise<void> {
    await page.waitForFunction(
        (needle) => [...document.querySelectorAll('.b3-snackbar')].some((n) => (n.textContent || '').includes(needle)),
        includes,
        { timeout },
    );
}

/** The editor's own canvas must still be visible: the export must not tear the tab down. */
export async function isCanvasVisible(page: Page): Promise<boolean> {
    return page.evaluate(() => {
        const iframe = [...document.querySelectorAll('iframe.siyuan-drawio-plugin__custom-tab')].find(
            (f) => (f as HTMLElement).offsetParent !== null,
        ) as HTMLIFrameElement | null;
        const container = iframe?.contentDocument?.querySelector('.geDiagramContainer') as HTMLElement | null;
        return container ? container.offsetParent !== null : false;
    });
}

/** Window count through Electron's remote module; the plugin must leave no renderer behind. */
export async function electronWindowCount(page: Page): Promise<number> {
    return page.evaluate(() => require('@electron/remote').BrowserWindow.getAllWindows().length);
}