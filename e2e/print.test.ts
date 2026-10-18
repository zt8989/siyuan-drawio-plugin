/**
 * Vitest E2E for the local print channel (文件 → 打印, Ctrl+P) via Playwright + CDP.
 * Requires SiYuan running with --remote-debugging-port=9222 (see docs/e2e-probe-sop.md).
 *
 * Probed against the running editor before being fixed here:
 *  1. `文件 → 打印...` opens the drawio print dialog; its 打印 button is the only path into
 *     EditorUi.print() (the PDF export dialog has its own callback).
 *  2. Upstream would open a print-preview window there; SiYuan refuses new windows, so the
 *     editor reported 更新预览出错 instead of printing. The plugin host renders the pages in
 *     its export window and opens the native print dialog instead.
 *  3. The native print dialog cannot be driven over CDP, so the *routing* is asserted with a
 *     recording adapter at the DiagramPrinter seam (same trick as the PDF export e2e). The
 *     render+show half of the real backend was probed separately (window + page count).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser, Page } from 'playwright';
import {
    closeDrawioTabs,
    connectEditorPage,
    ensureFreshAssets,
    electronWindowCount,
    isCanvasVisible,
    openBlankDrawing,
    STEP_TIMEOUT,
} from './fixtures/drawioEditor';

type RecordingWindow = {
    __printRequests?: Array<{ request: Record<string, unknown>; options?: { preview?: boolean } }>;
    __siyuanPrintRestore?: () => void;
};

let browser: Browser;
let page: Page;
let windowsBefore = 0;

/** Opens 文件 → 打印... and returns once the drawio print dialog is visible. */
async function openPrintDialog(frame: ReturnType<Page['frameLocator']>): Promise<void> {
    await frame.locator('.geMenubar .geItem').filter({ hasText: /文件|File/ }).first().click();
    await frame
        .locator('.mxPopupMenu tr')
        .filter({ hasText: /打印\.\.\.|Print\.\.\./ })
        .first()
        .click({ timeout: STEP_TIMEOUT });
    await frame.locator('.geDialog').waitFor({ state: 'visible', timeout: STEP_TIMEOUT });
}

async function restorePrinter(): Promise<void> {
    await page
        .evaluate(() => (window as unknown as RecordingWindow).__siyuanPrintRestore?.())
        .catch(() => undefined);
}

describe('local print channel (文件 → 打印)', () => {
    beforeAll(async () => {
        ({ browser, page } = await connectEditorPage());
        await ensureFreshAssets(page);
        await closeDrawioTabs(page);
        windowsBefore = await electronWindowCount(page);
    }, 60000);

    afterAll(async () => {
        if (page) {
            await restorePrinter();
            await closeDrawioTabs(page);
        }
        // The CDP connection is shared with the other e2e files; never close the editor.
    }, 30000);

    it('the editor patch is installed and the host reports a printer channel', async () => {
        const capability = await page.evaluate(async () => {
            const reply = await new Promise<{ pdfExport?: boolean; print?: boolean } | null>((resolve) => {
                const onMessage = (ev: MessageEvent) => {
                    if (ev.data?.type === 'drawio_callback' && ev.data.callbackId === 'e2e-print-caps') {
                        window.removeEventListener('message', onMessage);
                        resolve(ev.data.payload?.[0] ?? null);
                    }
                };
                window.addEventListener('message', onMessage);
                window.postMessage({ type: 'drawio_getCapabilities', callbackId: 'e2e-print-caps' });
                setTimeout(() => resolve(null), 4000);
            });

            return reply;
        });

        expect(capability).toMatchObject({ pdfExport: true, print: true });
    });

    it('routes 文件 → 打印 to the host printer instead of the blocked preview window', async () => {
        const frame = await openBlankDrawing(page);

        // Recording adapter at the DiagramPrinter seam: asserts the request the guest builds
        // without letting a native print dialog appear (CDP cannot drive those).
        await page.evaluate(() => {
            const w = window as unknown as RecordingWindow & {
                drawioPlugin: { getDiagramPrinter: () => unknown; setDiagramPrinter: (p: unknown) => void };
            };
            w.__printRequests = [];
            const real = w.drawioPlugin.getDiagramPrinter();
            w.__siyuanPrintRestore = () => w.drawioPlugin.setDiagramPrinter(real);
            w.drawioPlugin.setDiagramPrinter({
                print: async (request: Record<string, unknown>, options?: { preview?: boolean }) => {
                    w.__printRequests?.push({ request, options });
                    return { status: 'printed' };
                },
            });
        });

        const pagesBefore = browser.contexts().flatMap((c) => c.pages()).length;
        await openPrintDialog(frame);
        await frame.locator('.geDialog .geBtn').filter({ hasText: /^打印$|^Print$/ }).first().click({ timeout: STEP_TIMEOUT });
        await frame.locator('.geDialog:visible').waitFor({ state: 'detached', timeout: STEP_TIMEOUT }).catch(() => undefined);

        const requests = await page.evaluate(() => (window as unknown as RecordingWindow).__printRequests ?? []);
        expect(requests).toHaveLength(1);
        expect(requests[0].request).toMatchObject({ format: 'pdf' });
        expect(String(requests[0].request.xml)).toContain('mxfile');
        expect(String(requests[0].request.title)).toMatch(/\.drawio$/);
        // The 打印 button prints; only the dialog's 预览 button asks for a preview.
        expect(requests[0].options).toEqual({ preview: false });

        // Upstream's failure mode (更新预览出错) and the conversion service are both gone:
        // no extra window, no leftover dialog, editor still usable.
        expect(browser.contexts().flatMap((c) => c.pages()).length).toBe(pagesBefore);
        expect(await frame.locator('.geDialog:visible').count()).toBe(0);
        expect(await isCanvasVisible(page)).toBe(true);
        expect(await electronWindowCount(page)).toBe(windowsBefore);

        await restorePrinter();
    }, 90000);
});
