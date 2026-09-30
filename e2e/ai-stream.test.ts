/**
 * E2E: draw.io AI chat streams with thinking UI (mocked SSE, real UI path).
 * Requires SiYuan running with --remote-debugging-port=9222 (CDP_URL override supported).
 *
 * Interaction path probed live via playwright-cli (2026-09-07, SiYuan 3.8.2):
 * open tab -> geDialog 创建新绘图 -> 空白框图 template -> 生成 toolbar ->
 * textarea(描述您的绘图) fill + Enter -> thinking row -> final diagram.
 * The chat/completions request is intercepted and answered with a real
 * dumped stream (e2e/fixtures/deepseek-whale.sse.txt), so no external API
 * key traffic or cost occurs at test time.
 * A full live run against DeepSeek ("画一个DeepSeek的鲸鱼", ~2.5min thinking)
 * already verified the same path end to end without hitting the 90s timeout.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page, type FrameLocator } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitSseEvents, extractDelta, formatThinkingPreview } from '../src/ai/AiStreamUtils';

const DEFAULT_CDP = process.env.CDP_URL || 'http://127.0.0.1:9222';
const DEFAULT_PATTERN = process.env.E2E_PATTERN || 'stage/build/app';
const STEP_TIMEOUT = 10000;

// Real stream dumped from DeepSeek (deepseek-v4-flash, "画一个DeepSeek的鲸鱼"),
// sampled to keep the repo lean: first/last 30 reasoning-only events, all
// content events, [DONE]. Raw dump was ~4.9MB of mostly per-event overhead;
// the fixture preserves real chunk order, shapes and the final diagram.
const FIXTURE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'deepseek-whale.sse.txt');
const SSE_BODY = fs.readFileSync(FIXTURE_PATH, 'utf-8');

function fixtureExpectations(body: string): { fullReasoning: string; finalPreview: string; fullContent: string } {
    const { events } = splitSseEvents(body);
    let fullReasoning = '';
    let fullContent = '';
    for (const ev of events) {
        const d = extractDelta(ev);
        fullReasoning += d.reasoning;
        fullContent += d.content;
    }
    return { fullReasoning, finalPreview: formatThinkingPreview(fullReasoning), fullContent };
}

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

async function visibleDrawioFrame(page: Page): Promise<FrameLocator> {
    // Wait until a visible drawio iframe exists, then scope to the last one.
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
    return page.frameLocator('iframe.siyuan-drawio-plugin__custom-tab').last();
}

describe('drawio ai chat streaming', () => {
    let browser: Browser;
    let page: Page;
    let requestedStream: boolean | null = null;

    beforeAll(async () => {
        const cdpEndpoint = await resolveCdpEndpoint(DEFAULT_CDP);
        browser = await withTimeout(chromium.connectOverCDP(cdpEndpoint), STEP_TIMEOUT, 'connectOverCDP');
        const found = null;
        for (const ctx of browser.contexts()) {
            for (const p of ctx.pages()) {
                if (p.url().includes(DEFAULT_PATTERN)) {
                    page = p;
                    break;
                }
            }
            if (page!) break;
        }
        if (!found && !page!) {
            const all = browser.contexts().flatMap((c) => c.pages().map((p) => ` - ${p.url()}`));
            throw new Error(`no page matching "${DEFAULT_PATTERN}". available:\n${all.join('\n')}`);
        }
        await page!.bringToFront().catch(() => {});
        console.log('[e2e-stream] target:', page!.url());
    }, 30000);

    afterAll(async () => {
        await page?.unroute('**/chat/completions').catch(() => {});
        await browser?.close().catch(() => {});
    });

    it(
        'streams thinking UI then renders the diagram (real dumped SSE)',
        { timeout: 90000 },
        async () => {
            // Prerequisite: the test workspace has a real AI provider
            // configured (chat/completions backend). The request itself is
            // intercepted below, so no real key traffic or cost occurs; the
            // configured model name is irrelevant to the mock.
            const backend = await page.evaluate(() => {
                const ai = (window as unknown as { siyuan?: { config?: { ai?: any } } }).siyuan?.config?.ai;
                const providers = ai?.providers || [];
                const p = providers.find((x: any) => x.enabled && x.apiKey) || providers.find((x: any) => x.apiKey);
                return p ? (p.models?.find((m: any) => m.enabled)?.name || p.models?.[0]?.name || null) : null;
            });
            expect(
                backend,
                'test workspace needs an enabled AI provider (request is mocked, key is never used)',
            ).toBeTruthy();
            console.log('[e2e-stream] workspace model:', backend);

            // 2) Intercept the chat request: capture stream flag, answer SSE.
            await page.route('**/chat/completions', async (route) => {
                try {
                    const body = route.request().postDataJSON() as { stream?: unknown } | null;
                    requestedStream = body?.stream === true;
                    console.log('[e2e-stream] intercepted chat/completions, stream =', requestedStream);
                } catch {
                    requestedStream = false;
                }
                await route.fulfill({ status: 200, contentType: 'text/event-stream', body: SSE_BODY });
            });

            // 3) Fresh tab through the real UI entry.
            await closeDrawioTabs(page);
            const opened = await page.evaluate(() => {
                const p = (window as unknown as { drawioPlugin?: { openNewCustomTab: () => void } }).drawioPlugin;
                if (!p) return false;
                p.openNewCustomTab();
                return true;
            });
            expect(opened).toBe(true);
            const frame = await visibleDrawioFrame(page);

            // 4) Create flow: geDialog -> 创建新绘图 -> 空白框图.
            const dialog = frame.locator('.geDialog');
            await withTimeout(dialog.first().waitFor({ state: 'visible', timeout: 20000 }), 22000, 'wait geDialog');
            const createBtn = frame.locator('.geBigButton', { hasText: '创建新绘图' }).first();
            await withTimeout(createBtn.waitFor({ state: 'visible', timeout: STEP_TIMEOUT }), STEP_TIMEOUT, 'wait 创建新绘图');
            await createBtn.click();
            const blank = frame.locator('[title="空白框图"]').first();
            await withTimeout(blank.waitFor({ state: 'visible', timeout: STEP_TIMEOUT }), STEP_TIMEOUT, 'wait 空白框图');
            await blank.click();
            await blank.dblclick().catch(() => {});
            const canvas = frame.locator('.geDiagramContainer').first();
            await withTimeout(canvas.waitFor({ state: 'visible', timeout: 15000 }), 17000, 'wait canvas');

            // 5) Open chat via the 生成 toolbar button.
            const genBtn = frame.locator('[title="生成"]').first();
            await withTimeout(genBtn.waitFor({ state: 'visible', timeout: STEP_TIMEOUT }), STEP_TIMEOUT, 'wait 生成');
            await genBtn.click();
            const input = frame.locator('textarea[placeholder*="描述"]').first();
            await withTimeout(input.waitFor({ state: 'visible', timeout: STEP_TIMEOUT }), STEP_TIMEOUT, 'wait chat input');
            await input.fill('画一个DeepSeek的鲸鱼');

            // 6) Collect every thinking preview until the stream completes.
            // Atomic fulfill may resolve in one read or many TCP chunks, so
            // assert over the whole sequence, not a single snapshot.
            const eventsPromise = page.evaluate(
                () =>
                    new Promise<{ previews: string[]; thinkStyle: Record<string, string> | null; done: Record<string, unknown> }>((resolve, reject) => {
                        const fs = [...document.querySelectorAll('iframe.siyuan-drawio-plugin__custom-tab')];
                        const f = (fs.find((x) => (x as HTMLElement).offsetParent !== null) || fs[fs.length - 1]) as HTMLIFrameElement;
                        const previews: string[] = [];
                        let thinkStyle: Record<string, string> | null = null;
                        let expandedMidStream = false;
                        const timer = setTimeout(() => reject(new Error('no stream done event')), 25000);
                        const doc = f.contentDocument!;
                        f.contentWindow!.addEventListener('drawio-ai-stream-thinking', (e) => {
                            previews.push((e as CustomEvent).detail?.preview || '');
                            // The row was just rendered synchronously before
                            // the event: capture its single-line ellipsis style.
                            if (!thinkStyle) {
                                const row = [...doc.querySelectorAll('div')].find(
                                    (el) => (el.textContent || '').includes('思考中') && el.children.length === 0,
                                );
                                if (row) {
                                    const cs = f.contentWindow!.getComputedStyle(row);
                                    thinkStyle = { whiteSpace: cs.whiteSpace, overflow: cs.overflow, textOverflow: cs.textOverflow };
                                }
                            }
                            // Expand mid-stream: later refreshes and completion
                            // must not collapse it back.
                            if (!expandedMidStream) {
                                expandedMidStream = true;
                                const row = [...doc.querySelectorAll('div')].find((el) =>
                                    (el.textContent || '').startsWith('思考中：'),
                                ) as HTMLElement | undefined;
                                row?.click();
                            }
                        });
                        f.contentWindow!.addEventListener(
                            'drawio-ai-stream-done',
                            (e) => {
                                clearTimeout(timer);
                                resolve({ previews, thinkStyle, done: ((e as CustomEvent).detail || {}) as Record<string, unknown> });
                            },
                            { once: true },
                        );
                    }),
            );
            await input.press('Enter');

            // 7) Request went out as SSE stream; thinking UI tracked the
            // real reasoning (every preview is a slice of it, the last one
            // is the final line).
            const { previews, thinkStyle, done } = await withTimeout(eventsPromise, 30000, 'wait stream events');
            const expected = fixtureExpectations(SSE_BODY);
            console.log('[e2e-stream] thinking events:', previews.length, 'last preview:', previews[previews.length - 1]);
            expect(expected.fullReasoning.length).toBeGreaterThan(0);
            expect(expected.finalPreview).not.toBe('');
            expect(previews.length).toBeGreaterThan(0);
            for (const p of previews) {
                expect(p).not.toBe('');
                expect(expected.fullReasoning.includes(p)).toBe(true);
            }
            expect(previews[previews.length - 1]).toBe(expected.finalPreview);
            expect(done.hadThinking).toBe(true);
            expect(done.contentLength).toBe(expected.fullContent.length);
            expect(requestedStream).toBe(true);
            // Thinking row stays on one line with ellipsis (no wrapped,
            // half-cut second line in the narrow bubble).
            console.log('[e2e-stream] thinkStyle:', thinkStyle);
            expect(thinkStyle?.whiteSpace).toBe('nowrap');
            expect(thinkStyle?.overflow).toBe('hidden');
            expect(thinkStyle?.textOverflow).toBe('ellipsis');

            // 8) Final render replaced the thinking row with the diagram.
            // Locate the response bubble as the .geSidebar sibling following
            // the user bubble (a bare last-of-document query is unreliable:
            // the sidebar reuses .geSidebar for hundreds of elements).
            const finalState = await withTimeout(
                page
                    .evaluate(
                        () =>
                            new Promise<{ ok: boolean; head: string }>((resolve, reject) => {
                                const start = Date.now();
                                const timer = setInterval(() => {
                                    try {
                                        const fs = [...document.querySelectorAll('iframe.siyuan-drawio-plugin__custom-tab')];
                                        const f = (fs.find((x) => (x as HTMLElement).offsetParent !== null) ||
                                            fs[fs.length - 1]) as HTMLIFrameElement;
                                        const d = f.contentDocument!;
                                        const user = [...d.querySelectorAll('div')].find(
                                            (el) =>
                                                String(el.getAttribute('style') || '').includes('40%') &&
                                                (el.textContent || '').includes('画一个DeepSeek的鲸鱼'),
                                        );
                                        let sib = user?.nextElementSibling || null;
                                        let resp: Element | null = null;
                                        for (let i = 0; i < 4 && sib; i++) {
                                            if (sib.className === 'geSidebar' && (sib.textContent || '').length > 0) {
                                                resp = sib;
                                                break;
                                            }
                                            sib = sib.nextElementSibling;
                                        }
                                        const t = (resp?.textContent || '') as string;
                                        // Rendered diagram, no thinking residue and no raw
                                        // envelope text (<mxfile>/<diagram> must be unwrapped).
                                        if (
                                            resp &&
                                            !t.includes('思考中') &&
                                            !t.includes('<mxfile') &&
                                            !t.includes('<diagram') &&
                                            resp.querySelector('svg')
                                        ) {
                                            clearInterval(timer);
                                            resolve({ ok: true, head: t.slice(0, 120) });
                                        } else if (Date.now() - start > 25000) {
                                            clearInterval(timer);
                                            resolve({ ok: false, head: t.slice(0, 120) });
                                        }
                                    } catch (e) {
                                        clearInterval(timer);
                                        reject(e);
                                    }
                                }, 400);
                            }),
                    )
                    .catch(() => ({ ok: false, head: 'evaluate failed' })),
                30000,
                'wait final render',
            );
            console.log('[e2e-stream] final:', finalState);
            expect(finalState.ok).toBe(true);

            // 9) Thinking row persists as 思考：<last line>; it was expanded
            // mid-stream and must still be expanded (refreshes and completion
            // never collapse it). Click collapses back to the preview.
            const expandState = await page.evaluate(() => {
                const fs = [...document.querySelectorAll('iframe.siyuan-drawio-plugin__custom-tab')];
                const f = (fs.find((x) => (x as HTMLElement).offsetParent !== null) ||
                    fs[fs.length - 1]) as HTMLIFrameElement;
                const d = f.contentDocument!;
                const row = [...d.querySelectorAll('div')].find((el) =>
                    (el.textContent || '').startsWith('思考：'),
                ) as HTMLElement | undefined;
                if (!row) return { found: false };
                const stillExpanded =
                    row.dataset.expanded === '1' && f.contentWindow!.getComputedStyle(row).whiteSpace === 'pre-wrap';
                const expandedText = row.textContent || '';
                row.click();
                const collapsedAgain = row.textContent || '';
                return {
                    found: true,
                    stillExpanded,
                    expandedLen: expandedText.length,
                    expandedStartsWithLabel: expandedText.startsWith('思考：'),
                    collapsedLen: collapsedAgain.length,
                    collapsedAgain,
                };
            });
            console.log('[e2e-stream] think-row:', JSON.stringify(expandState).slice(0, 300));
            expect(expandState.found).toBe(true);
            if (expandState.found) {
                const expectedFull = fixtureExpectations(SSE_BODY).fullReasoning;
                expect(expandState.stillExpanded).toBe(true);
                expect(expandState.expandedLen).toBe('思考：\n'.length + expectedFull.length);
                expect(expandState.expandedStartsWithLabel).toBe(true);
                expect(expandState.collapsedLen).toBeLessThan(150);
                expect(expandState.collapsedAgain).toBe(
                    `思考：${fixtureExpectations(SSE_BODY).finalPreview}`,
                );
            }

            await closeDrawioTabs(page);
        },
    );
});
