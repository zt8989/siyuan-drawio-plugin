/**
 * Vitest E2E for the local PDF export (issue #75) via Playwright + CDP.
 * Requires SiYuan running with --remote-debugging-port=9222 (see docs/e2e-probe-sop.md).
 *
 * Probed first against SiYuan 3.8.x / Electron 44 before being fixed here:
 *  1. Live draws/assets are HTTP-cached hard — see ensureFreshAssets in the shared helpers.
 *  2. `文件 → 导出为 → PDF...` opens the print dialog; 导出 then reaches the plugin host
 *     through the bridge (probed: exactly one exportPdf request, no new window, no drawio
 *     destination picker).
 *  3. The host renders the diagram in its export page and prints it with Electron
 *     printToPDF (probed: a two-page diagram produced a two-page A4 PDF with embedded fonts).
 *
 * The editor-driving helpers are shared with e2e/file-export.test.ts.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Browser, Page } from 'playwright';
import {
    closeDrawioTabs,
    connectEditorPage,
    ensureFreshAssets,
    electronWindowCount,
    exportViaMenu,
    isCanvasVisible,
    openBlankDrawing,
    waitForSnackbar,
} from './fixtures/drawioEditor';

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

let browser: Browser;
let page: Page;
let windowsBefore = 0;

describe('local PDF export (issue #75)', () => {
    beforeAll(async () => {
        ({ browser, page } = await connectEditorPage());
        await ensureFreshAssets(page);
        await closeDrawioTabs(page);
        windowsBefore = await electronWindowCount(page);
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

        expect(capability).toMatchObject({ pdfExport: true });
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
        await exportViaMenu(frame, 'PDF...');
        await waitForSnackbar(page, '/tmp/e2e-recording.pdf');

        const requests = await page.evaluate(() => (window as unknown as { __pdfRequests: Array<{ request: Record<string, unknown> }> }).__pdfRequests);
        expect(requests).toHaveLength(1);
        expect(requests[0].request.format).toBe('pdf');
        expect(String(requests[0].request.xml)).toContain('mxfile');
        expect(String(requests[0].request.title)).toMatch(/\.drawio$/);

        // The conversion service is never opened: no extra window, no leftover dialog.
        expect(browser.contexts().flatMap((c) => c.pages()).length).toBe(pagesBefore);
        expect(await frame.locator('.geDialog:visible').count()).toBe(0);

        await page.evaluate(() => (window as unknown as { __siyuanPdfRestore?: () => void }).__siyuanPdfRestore?.());
    }, 90000);

    it('leaves the editor usable and no window behind', async () => {
        expect(await isCanvasVisible(page)).toBe(true);
        expect(await electronWindowCount(page)).toBe(windowsBefore);
    }, 30000);
});