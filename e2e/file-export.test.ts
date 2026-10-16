/**
 * Vitest E2E for the local save channel (issue #76) via Playwright + CDP.
 * Requires SiYuan running with --remote-debugging-port=9222 (see docs/e2e-probe-sop.md).
 *
 * Probed first, which is how the defect showed up: `文件 → 导出为 → PNG...` renders the image
 * client-side, then `saveLocalFile → doSaveLocalFile` clicks an `<a download>` — and SiYuan's
 * Electron has no will-download handler, so nothing lands on disk (verified with a synthetic
 * download too). After the patch the same menu path asks the plugin host to save the bytes.
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

const PNG_PATH = path.join(os.tmpdir(), `siyuan-drawio-file-e2e-${Date.now()}.png`);
const SVG_PATH = path.join(os.tmpdir(), `siyuan-drawio-file-e2e-${Date.now()}.svg`);

const PNG_MAGIC_HEX = '89504e470d0a1a0a';

type RecordedRequest = { filename: string; mimeType: string; data: string };

/** Records the request the editor builds while keeping the host's native dialog out of the way. */
async function useRecordingFileExporter(page: Page): Promise<void> {
    await page.evaluate(() => {
        const w = window as unknown as {
            drawioPlugin: { getFileExporter: () => unknown; setFileExporter: (e: unknown) => void };
            __fileRequests: RecordedRequest[];
            __siyuanFileRestore?: () => void;
        };
        w.__fileRequests = [];
        const real = w.drawioPlugin.getFileExporter();
        w.__siyuanFileRestore = () => w.drawioPlugin.setFileExporter(real);
        w.drawioPlugin.setFileExporter({
            exportFile: async (request: RecordedRequest) => {
                w.__fileRequests.push(request);
                return { status: 'saved', path: '/tmp/e2e-recording.out' };
            },
        });
    });
}

/** Puts the host's real writer back so the bytes can be landed on disk for inspection. */
async function useRealFileExporter(page: Page): Promise<void> {
    await page.evaluate(() => (window as unknown as { __siyuanFileRestore?: () => void }).__siyuanFileRestore?.());
}

async function recordedRequests(page: Page): Promise<RecordedRequest[]> {
    return page.evaluate(() => (window as unknown as { __fileRequests: RecordedRequest[] }).__fileRequests);
}

function decode(base64: string): Buffer {
    return Buffer.from(base64, 'base64');
}

function writeWithRealExporter(page: Page, request: RecordedRequest, targetPath: string) {
    return page.evaluate(
        async ({ req, target }) => {
            const plugin = (window as unknown as { drawioPlugin: { getFileExporter: () => { exportFile: (r: unknown, o: unknown) => Promise<unknown> } } }).drawioPlugin;
            return plugin.getFileExporter().exportFile(req, { targetPath: target });
        },
        { req: request, target: targetPath },
    );
}

let browser: Browser;
let page: Page;
let windowsBefore = 0;

describe('local save channel (issue #76)', () => {
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
                    const w = window as unknown as { __siyuanFileRestore?: () => void; __fileRequests?: unknown[] };
                    w.__siyuanFileRestore?.();
                    w.__fileRequests = [];
                })
                .catch(() => undefined);
        }
        for (const file of [PNG_PATH, SVG_PATH]) {
            if (fs.existsSync(file)) fs.unlinkSync(file);
        }
        // The CDP connection is shared with the other e2e files; never close the editor.
    }, 30000);

    it('installs the local-save patch and reports the capability', async () => {
        const report = await page.evaluate(async () => {
            const capability = await new Promise<{ fileExport?: boolean } | null>((resolve) => {
                const onMessage = (ev: MessageEvent) => {
                    if (ev.data?.type === 'drawio_callback' && ev.data.callbackId === 'e2e-file-caps') {
                        window.removeEventListener('message', onMessage);
                        resolve(ev.data.payload?.[0] ?? null);
                    }
                };
                window.addEventListener('message', onMessage);
                window.postMessage({ type: 'drawio_getCapabilities', callbackId: 'e2e-file-caps' });
                setTimeout(() => resolve(null), 4000);
            });

            return capability;
        });

        expect(report).toMatchObject({ fileExport: true });
    });

    it('saves a real PNG from the editor instead of dropping a browser download', async () => {
        const frame = await openBlankDrawing(page);
        const pagesBefore = browser.contexts().flatMap((c) => c.pages()).length;
        await useRecordingFileExporter(page);
        const patch = await page.evaluate(() => {
            const iframe = [...document.querySelectorAll('iframe.siyuan-drawio-plugin__custom-tab')].find(
                (f) => (f as HTMLElement).offsetParent !== null,
            ) as HTMLIFrameElement | null;
            return (iframe?.contentWindow as unknown as { __fileExportPatch?: unknown })?.__fileExportPatch ?? null;
        });
        expect(patch).toMatchObject({ installed: true });

        await exportViaMenu(frame, 'PNG...');
        await waitForSnackbar(page, '/tmp/e2e-recording.out');

        const requests = await recordedRequests(page);
        expect(requests).toHaveLength(1);
        expect(requests[0].mimeType).toBe('image/png');
        expect(requests[0].filename).toMatch(/\.png$/);

        // The editor rendered the pixels: the payload really is a PNG.
        const png = decode(requests[0].data);
        expect(png.subarray(0, 8).toString('hex')).toBe(PNG_MAGIC_HEX);
        expect(png.length).toBeGreaterThan(100);

        // No upstream destination dialog and no extra window: the conversion service is not involved.
        expect(await frame.locator('.geDialog:visible').count()).toBe(0);
        expect(browser.contexts().flatMap((c) => c.pages()).length).toBe(pagesBefore);

        // And the host's real writer puts exactly those bytes on disk.
        await useRealFileExporter(page);
        expect(await writeWithRealExporter(page, requests[0], PNG_PATH)).toEqual({ status: 'saved', path: PNG_PATH });
        expect(fs.readFileSync(PNG_PATH).subarray(0, 8).toString('hex')).toBe(PNG_MAGIC_HEX);
    }, 90000);

    it('saves SVG as text (UTF-8 base64 round trip), not as a bitmap', async () => {
        const frame = await openBlankDrawing(page);
        await useRecordingFileExporter(page);

        await exportViaMenu(frame, 'SVG...');
        await page.waitForTimeout(1500);

        const requests = await recordedRequests(page);
        expect(requests).toHaveLength(1);
        expect(requests[0].mimeType).toMatch(/svg/);

        const svg = decode(requests[0].data).toString('utf8');
        expect(svg.trimStart().startsWith('<?xml') || svg.includes('<svg')).toBe(true);

        await useRealFileExporter(page);
        expect(await writeWithRealExporter(page, requests[0], SVG_PATH)).toEqual({ status: 'saved', path: SVG_PATH });
        expect(fs.readFileSync(SVG_PATH, 'utf8')).toBe(svg);
    }, 90000);

    it('leaves the editor usable and no window behind', async () => {
        await page.evaluate(() => (window as unknown as { __siyuanFileRestore?: () => void }).__siyuanFileRestore?.());
        expect(await isCanvasVisible(page)).toBe(true);
        expect(await electronWindowCount(page)).toBe(windowsBefore);
    }, 30000);
});