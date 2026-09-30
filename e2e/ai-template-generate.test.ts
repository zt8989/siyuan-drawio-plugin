/**
 * E2E: template-chooser Generate dialog rerouted to the SiYuan BYO model.
 * Requires SiYuan running with --remote-debugging-port=9222 (CDP_URL override supported).
 *
 * Background: upstream posts the template Generate prompt to
 * https://www.draw.io/generate/v3, which rejects self-hosted origins with
 * "Unauthorized. Request must come from an authorized draw.io domain".
 * The client patch reroutes it to the configured chat/completions endpoint.
 *
 * Interaction path probed live via playwright-cli (SiYuan 3.8.2):
 * open tab -> geDialog 创建新绘图 -> template dialog textarea(描述您的绘图)
 * fill + 确定 -> .geTemplate[title=<desc>] appears (no Unauthorized) ->
 * select it -> 创建 -> canvas contains the generated cell.
 * Prerequisite: the test workspace has an enabled AI provider (request is
 * mocked, the key is never used).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page, type FrameLocator } from 'playwright';

const DEFAULT_CDP = process.env.CDP_URL || 'http://127.0.0.1:9222';
const DEFAULT_PATTERN = process.env.E2E_PATTERN || 'stage/build/app';
const STEP_TIMEOUT = 10000;
const DESC = 'probe rectangle';

const SSE_BODY = [
    'data: {"choices":[{"delta":{"content":"<mxGraphModel><root><mxCell id=\\"0\\"/><mxCell id=\\"1\\" parent=\\"0\\"/><mxCell id=\\"2\\" value=\\"ProbeRect\\" vertex=\\"1\\" parent=\\"1\\"><mxGeometry x=\\"20\\" y=\\"20\\" width=\\"120\\" height=\\"60\\" as=\\"geometry\\"/></mxCell></root></mxGraphModel>"}}]}',
    '',
    'data: [DONE]',
    '',
].join('\n');

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
        5000,
        'fetch json/version',
    );
    return res.webSocketDebuggerUrl || cdp;
}

async function closeDrawioTabs(page: Page): Promise<void> {
    await page.evaluate(() => {
        [...document.querySelectorAll('li.item')].forEach((tab) => {
            if ((tab.textContent || '').includes('drawio') || (tab.textContent || '').includes('.drawio')) {
                (tab.querySelector('.item__close') as HTMLElement | null)?.click();
            }
        });
    });
    await page.waitForTimeout(800);
}

describe('drawio template generate reroute', () => {
    let browser: Browser;
    let page: Page;
    let requestedStream: boolean | null = null;

    beforeAll(async () => {
        const cdpEndpoint = await resolveCdpEndpoint(DEFAULT_CDP);
        browser = await withTimeout(chromium.connectOverCDP(cdpEndpoint), STEP_TIMEOUT, 'connectOverCDP');
        for (const ctx of browser.contexts()) {
            for (const p of ctx.pages()) {
                if (p.url().includes(DEFAULT_PATTERN)) {
                    page = p;
                    break;
                }
            }
            if (page!) break;
        }
        if (!page!) throw new Error(`no page matching "${DEFAULT_PATTERN}"`);
        await page!.bringToFront().catch(() => {});
    }, 30000);

    afterAll(async () => {
        await page?.unroute('**/chat/completions').catch(() => {});
        await browser?.close().catch(() => {});
    });

    it(
        'generates via BYO model without Unauthorized and inserts the cell',
        { timeout: 90000 },
        async () => {
            const backend = await page.evaluate(() => {
                const ai = (window as unknown as { siyuan?: { config?: { ai?: any } } }).siyuan?.config?.ai;
                const providers = ai?.providers || [];
                const p = providers.find((x: any) => x.enabled && x.apiKey) || providers.find((x: any) => x.apiKey);
                return p ? (p.models?.find((m: any) => m.enabled)?.name || p.models?.[0]?.name || null) : null;
            });
            expect(backend, 'test workspace needs an enabled AI provider').toBeTruthy();

            await page.route('**/chat/completions', async (route) => {
                try {
                    const body = route.request().postDataJSON() as { stream?: unknown } | null;
                    requestedStream = body?.stream === true;
                } catch {
                    requestedStream = false;
                }
                await route.fulfill({ status: 200, contentType: 'text/event-stream', body: SSE_BODY });
            });

            await closeDrawioTabs(page);
            const opened = await page.evaluate(() => {
                const p = (window as unknown as { drawioPlugin?: { openNewCustomTab: () => void } }).drawioPlugin;
                if (!p) return false;
                p.openNewCustomTab();
                return true;
            });
            expect(opened).toBe(true);
            await withTimeout(
                page.waitForFunction(
                    () =>
                        [...document.querySelectorAll('iframe.siyuan-drawio-plugin__custom-tab')].some(
                            (f) => (f as HTMLElement).offsetParent !== null,
                        ),
                    { timeout: STEP_TIMEOUT },
                ),
                STEP_TIMEOUT + 2000,
                'wait visible drawio iframe',
            );
            const frame: FrameLocator = page.frameLocator('iframe.siyuan-drawio-plugin__custom-tab').last();

            // Create flow into the template chooser.
            const dialog = frame.locator('.geDialog');
            await withTimeout(dialog.first().waitFor({ state: 'visible', timeout: 20000 }), 22000, 'wait geDialog');
            const createBtn = frame.locator('.geBigButton', { hasText: '创建新绘图' }).first();
            await withTimeout(createBtn.waitFor({ state: 'visible', timeout: STEP_TIMEOUT }), STEP_TIMEOUT, 'wait 创建新绘图');
            await createBtn.click();

            // Generate form lives inside the template dialog behind the
            // 生成 entry: select it first to reveal the textarea.
            const genEntrySelect = frame.locator('.geDialog .geTemplate[title="生成"]').first();
            await withTimeout(genEntrySelect.waitFor({ state: 'visible', timeout: STEP_TIMEOUT }), STEP_TIMEOUT, 'wait 生成 entry');
            await genEntrySelect.click();
            const genInput = frame.locator('.geDialog textarea[placeholder*="描述"]').first();
            await withTimeout(genInput.waitFor({ state: 'visible', timeout: STEP_TIMEOUT }), STEP_TIMEOUT, 'wait generate input');
            await genInput.fill(DESC);
            const okBtn = frame.locator('.geDialog button', { hasText: '确定' }).first();
            await withTimeout(okBtn.waitFor({ state: 'visible', timeout: STEP_TIMEOUT }), STEP_TIMEOUT, 'wait 确定');
            await okBtn.click();

            // The generated result becomes a template entry titled with the
            // description; the hosted Unauthorized error must not appear.
            const genEntry = frame.locator(`.geDialog .geTemplate[title="${DESC}"]`).first();
            await withTimeout(genEntry.waitFor({ state: 'visible', timeout: 25000 }), 27000, 'wait generated template entry');
            const bodyText = await page.evaluate(() => document.body.innerText || '');
            expect(bodyText.includes('Unauthorized')).toBe(false);
            expect(requestedStream).toBe(true);

            // Select it and create: the generated cell lands on the canvas.
            await genEntry.click();
            await genEntry.dblclick().catch(() => {});
            const createFromTemplate = frame.locator('.geDialog button', { hasText: '创建' }).first();
            await withTimeout(createFromTemplate.waitFor({ state: 'visible', timeout: STEP_TIMEOUT }), STEP_TIMEOUT, 'wait 创建');
            await createFromTemplate.click();
            await withTimeout(
                page.waitForFunction(
                    () =>
                        [...document.querySelectorAll('iframe.siyuan-drawio-plugin__custom-tab')].some((f) => {
                            if ((f as HTMLElement).offsetParent === null) return false;
                            const doc = (f as HTMLIFrameElement).contentDocument;
                            return !!doc && !doc.querySelector('.geDialog') && (doc.body.innerText || '').includes('ProbeRect');
                        }),
                    { timeout: 20000 },
                ),
                22000,
                'wait ProbeRect on canvas',
            );

            await closeDrawioTabs(page);
        },
    );
});
