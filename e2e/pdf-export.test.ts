/**
 * Vitest E2E for the local PDF export (issue #75) via Playwright + CDP.
 * Requires SiYuan running with --remote-debugging-port=9222 (see docs/e2e-probe-sop.md).
 *
 * Probed first against SiYuan 3.8.4 / Electron 44.4.1, then fixed here:
 *  1. The plugin webapp assets are HTTP-cached hard: a plain reload keeps serving the
 *     previous build's PostConfig.js, so the patch looks missing. The suite clears the CDP
 *     cache and reloads when (and only when) the loaded bundle is stale.
 *  2. `文件 → 导出为 → PDF...` opens the print dialog; 导出 then reaches the plugin host
 *     through the bridge (probed: exactly one exportPdf request, no new window, no
 *     drawio destination picker).
 *  3. The host renders the diagram in its export page and prints it with Electron
 *     printToPDF (probed: a two-page diagram produced a two-page A4 PDF with embedded fonts).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_CDP = process.env.CDP_URL || 'http://127.0.0.1:9222';
const DEFAULT_PATTERN = process.env.E2E_PATTERN || 'stage/build/app';
const STEP_TIMEOUT = 10000;

const PDF_PATH = path.join(os.tmpdir(), `siyuan-drawio-pdf-e2e-${Date.now()}.pdf`);

/** Two pages, A4 (page="1"), so pagination and page sizes are both observable. */
const TWO_PAGE_XML =
    '<mxfile host="app.diagrams.net">' +
    '<diagram id="p1" name="Page-1"><mxGraphModel dx="800" dy="600" grid="1" gridSize="10" page="1" pageWidth="827" pageHeight="1169"><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
    '<mxCell id="2" value="第一页 Rectangle" style="rounded=0;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="80" y="80" width="240" height="120" as="geometry"/></mxCell>' +
    '</root></mxGraphModel></diagram>' +
    '<diagram id="p2" name="Page-2"><mxGraphModel dx="800" dy="600" grid="1" gridSize="10" page="1" pageWidth="827" pageHeight="1169"><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
    '<mxCell id="3" value="第二页 Circle" style="ellipse;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="100" y="100" width="200" height="200" as="geometry"/></mxCell>' +
    '</root></mxGraphModel></diagram></mxfile>';

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
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

async function findTargetPage(browser: Browser): Promise<Page | null> {
    for (const ctx of browser.contexts()) {
        for (const p of ctx.pages()) {
            if (p.url().includes(DEFAULT_PATTERN)) return p;
        }
    }
    return null;
}

/**
 * Plugin webapp assets are cached per build, and a plain reload keeps serving the previous
 * build's PostConfig.js (probed: the patch then looks uninstalled). Clear the cache and
 * reload when the loaded bundle is missing or from another plugin version, so a shared
 * editor session is not disturbed on every run. When iterating on the client patch in dev,
 * force it with E2E_FORCE_RELOAD=1 (the dev bundle keeps the same version).
 */
async function ensureFreshAssets(page: Page): Promise<void> {
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

async function closeDrawioTabs(page: Page): Promise<void> {
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
async function openBlankDrawing(page: Page) {
    await page.evaluate(() => {
        (window as unknown as { drawioPlugin: { openNewCustomTab: () => void } }).drawioPlugin.openNewCustomTab();
    });

    const frame = page.frameLocator('iframe.siyuan-drawio-plugin__custom-tab:visible');
    await frame.locator('.geBigButton').filter({ hasText: /创建新绘图|Create New Diagram/ }).first().click({ timeout: STEP_TIMEOUT });
    await frame.locator('.geTemplate').filter({ hasText: /空白框图|Blank Diagram/ }).first().dblclick({ timeout: STEP_TIMEOUT });
    await frame.locator('.geDiagramContainer').waitFor({ state: 'visible', timeout: 20000 });

    return frame;
}

/** Drives 文件 → 导出为 → PDF... → 导出 in the editor. */
async function exportViaMenu(frame: ReturnType<Page['frameLocator']>): Promise<void> {
    await frame.locator('.geMenubar .geItem').filter({ hasText: /文件|File/ }).first().click();
    const exportAs = frame.locator('td.mxPopupMenuItem').filter({ hasText: /导出为|Export as/ }).first();
    await exportAs.hover();
    await frame.locator('tr.mxPopupMenuItem').filter({ hasText: /^PDF\.\.\.$/ }).first().click({ timeout: STEP_TIMEOUT });

    const exportButton = frame.locator('.geDialog .geBtn, .geDialog button').filter({ hasText: /^导出$|^Export$/ }).first();
    await exportButton.click({ timeout: STEP_TIMEOUT });
}

let browser: Browser;
let page: Page;
let windowsBefore = 0;

describe('local PDF export (issue #75)', () => {
    beforeAll(async () => {
        browser = await chromium.connectOverCDP(await resolveCdpEndpoint(DEFAULT_CDP));
        const found = await findTargetPage(browser);
        if (!found) throw new Error(`no SiYuan page matching "${DEFAULT_PATTERN}" on ${DEFAULT_CDP}`);
        page = found;
        await ensureFreshAssets(page);
        await closeDrawioTabs(page);
        windowsBefore = await page.evaluate(() => require('@electron/remote').BrowserWindow.getAllWindows().length);
    }, 60000);

    afterAll(async () => {
        if (page) {
            await closeDrawioTabs(page);
            await page
                .evaluate(() => {
                    const w = window as unknown as { __pdfRequests?: unknown[]; __siyuanPdfRestore?: () => void };
                    w.__siyuanPdfRestore?.();
                    w.__pdfRequests = [];
                })
                .catch(() => undefined);
        }
        if (fs.existsSync(PDF_PATH)) fs.unlinkSync(PDF_PATH);
        // The CDP connection is shared with the other e2e files; never close the editor.
    }, 30000);

    it('the editor patch is installed and the host reports local PDF export', async () => {
        const capability = await page.evaluate(async () => {
            const reply = await new Promise<{ pdfExport?: boolean } | null>((resolve) => {
                const onMessage = (ev: MessageEvent) => {
                    if (ev.data?.type === 'drawio_callback' && ev.data.callbackId === 'e2e-caps') {
                        window.removeEventListener('message', onMessage);
                        resolve(ev.data.payload?.[0] ?? null);
                    }
                };
                window.addEventListener('message', onMessage);
                window.postMessage({ type: 'drawio_getCapabilities', callbackId: 'e2e-caps' });
                setTimeout(() => resolve(null), 4000);
            });

            return reply;
        });

        expect(capability).toEqual({ pdfExport: true });
    });

    it('renders and saves a real multi-page PDF through the host exporter', async () => {
        const result = await page.evaluate(
            async ({ xml, target }) => {
                const plugin = (window as unknown as { drawioPlugin: { getPdfExporter: () => { export: (r: unknown, o: unknown) => Promise<unknown> } } }).drawioPlugin;
                return plugin.getPdfExporter().export(
                    { format: 'pdf', xml, title: 'e2e 多页图-20260101000000-abcdefg.drawio', allPages: true, scale: 1, border: 0, bg: '#ffffff' },
                    { targetPath: target },
                );
            },
            { xml: TWO_PAGE_XML, target: PDF_PATH },
        );

        expect(result).toEqual({ status: 'saved', path: PDF_PATH });
        expect(fs.existsSync(PDF_PATH)).toBe(true);

        const pdf = fs.readFileSync(PDF_PATH);
        const text = pdf.toString('latin1');
        expect(text.slice(0, 5)).toBe('%PDF-');
        expect((text.match(/\/Type \/Page[^s]/g) || []).length).toBe(2);
        expect(text.toLowerCase()).toMatch(/mediabox\s*\[0 0 [\d.]+ [\d.]+\]/);
        // Vector text, not a screenshot: Chromium embeds font subsets.
        expect(text).toMatch(/FontFile\d?/);
    }, 60000);

    it('routes 文件 → 导出为 → PDF to the host instead of the conversion service', async () => {
        const frame = await openBlankDrawing(page);

        // Recording adapter at the PdfExporter seam: asserts the request the guest builds
        // without letting a native save dialog appear (CDP cannot drive those).
        await page.evaluate(() => {
            const w = window as unknown as { drawioPlugin: { getPdfExporter: () => unknown; setPdfExporter: (e: unknown) => void }; __pdfRequests: unknown[]; __siyuanPdfRestore?: () => void };
            w.__pdfRequests = [];
            const real = w.drawioPlugin.getPdfExporter();
            w.__siyuanPdfRestore = () => w.drawioPlugin.setPdfExporter(real);
            w.drawioPlugin.setPdfExporter({
                export: async (request: Record<string, unknown>, options: unknown) => {
                    w.__pdfRequests.push({ request, options });
                    return { status: 'saved', path: '/tmp/e2e-recording.pdf' };
                },
            });
        });

        const pagesBefore = browser.contexts().flatMap((c) => c.pages()).length;
        await exportViaMenu(frame);
        await page.waitForTimeout(3000);

        const requests = await page.evaluate(() => (window as unknown as { __pdfRequests: Array<{ request: Record<string, unknown> }> }).__pdfRequests);
        expect(requests).toHaveLength(1);
        expect(requests[0].request.format).toBe('pdf');
        expect(String(requests[0].request.xml)).toContain('mxfile');
        expect(String(requests[0].request.title)).toMatch(/\.drawio$/);

        // The conversion service is never opened: no extra window, no leftover dialog.
        expect(browser.contexts().flatMap((c) => c.pages()).length).toBe(pagesBefore);
        expect(await frame.locator('.geDialog:visible').count()).toBe(0);

        // The user is told where the file went (the host reports the saved path).
        await page.waitForFunction(
            () => [...document.querySelectorAll('.b3-snackbar')].some((n) => (n.textContent || '').includes('/tmp/e2e-recording.pdf')),
            null,
            { timeout: 5000 },
        );

        await page.evaluate(() => (window as unknown as { __siyuanPdfRestore?: () => void }).__siyuanPdfRestore?.());
    }, 90000);

    it('leaves the editor usable and no window behind', async () => {
        const canvasVisible = await page.evaluate(() => {
            const iframe = [...document.querySelectorAll('iframe.siyuan-drawio-plugin__custom-tab')].find((f) => (f as HTMLElement).offsetParent !== null) as HTMLIFrameElement | null;
            const container = iframe?.contentDocument?.querySelector('.geDiagramContainer') as HTMLElement | null;
            return container ? container.offsetParent !== null : false;
        });
        expect(canvasVisible).toBe(true);

        const windowsAfter = await page.evaluate(() => require('@electron/remote').BrowserWindow.getAllWindows().length);
        expect(windowsAfter).toBe(windowsBefore);
    }, 30000);
});