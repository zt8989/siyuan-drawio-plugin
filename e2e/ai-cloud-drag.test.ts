/**
 * E2E regression: dragging an AI-generated cloud to the canvas must not
 * squeeze the chat window to the top-left corner.
 *
 * User report: "帮我画一朵云" -> drag cloud to canvas -> page "auto
 * refreshes" -> chat box squeezed to top-left.
 *
 * Root cause (probed live via playwright-cli, CDP 9222): the drop marks
 * the diagram dirty, draw.io autosaves ~3s later via putFile into the
 * plugin's storage/petal dir, and SiYuan hot-reloads the plugin on any
 * change there (its <style> is removed for ~300ms). The tab iframe then
 * lapses to the 300x150 default, and draw.io's installResizeHandler
 * permanently clamps the oversized chat window to 0,0 @ 300x150.
 * Fix: size the iframe inline in TabManager.getIframeHtml so it never
 * depends on the plugin stylesheet.
 *
 * Path: open tab -> geDialog 创建新绘图 -> 空白框图 -> 生成 toolbar ->
 * textarea fill + Enter -> mocked cloud SSE -> drag result item to an
 * uncovered canvas spot -> cloud inserted, chat window geometry unchanged.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page, type FrameLocator } from 'playwright';

const DEFAULT_CDP = process.env.CDP_URL || 'http://127.0.0.1:9222';
const DEFAULT_PATTERN = process.env.E2E_PATTERN || 'stage/build/app';
const STEP_TIMEOUT = 10000;
const PROMPT = '帮我画一朵云';

// Minimal SSE carrying a single cloud cell as mxGraphModel.
const CLOUD_XML =
    '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
    '<mxCell id="cloud1" value="" style="shape=cloud;html=1;whiteSpace=wrap;fillColor=#EBF8FB;strokeColor=#55A6C8;strokeWidth=2;shadow=0;gradientColor=none;" vertex="1" parent="1">' +
    '<mxGeometry height="150" width="220" x="110" y="390" as="geometry"/></mxCell></root></mxGraphModel>';
const CLOUD_SSE = `data: {"choices":[{"delta":{"content":${JSON.stringify(CLOUD_XML)}}}]}\n\ndata: [DONE]\n\n`;

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
            const t = tab.textContent || '';
            if (t.includes('drawio') || t.includes('.drawio')) {
                (tab.querySelector('.item__close') as HTMLElement | null)?.click();
            }
        });
    });
    await page.waitForTimeout(800);
}

async function visibleDrawioFrame(page: Page): Promise<FrameLocator> {
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

interface WinRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

async function chatRect(page: Page): Promise<WinRect | null> {
    return page.evaluate(() => {
        const fs = [...document.querySelectorAll('iframe.siyuan-drawio-plugin__custom-tab')];
        const f = (fs.find((x) => (x as HTMLElement).offsetParent !== null) || fs[fs.length - 1]) as HTMLIFrameElement;
        const d = f.contentDocument!;
        const wins = [...d.querySelectorAll('.mxWindow')].filter((w) => ((w.querySelector('.mxWindowTitle') as HTMLElement | null)?.textContent || '') === '生成');
        // Outermost window = largest area (mxWindow nests two matches).
        wins.sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height);
        const w = wins[0];
        if (!w) return null;
        const r = w.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    });
}

async function canvasGroups(page: Page): Promise<number> {
    return page.evaluate(() => {
        const fs = [...document.querySelectorAll('iframe.siyuan-drawio-plugin__custom-tab')];
        const f = (fs.find((x) => (x as HTMLElement).offsetParent !== null) || fs[fs.length - 1]) as HTMLIFrameElement;
        const svg = f.contentDocument!.querySelector('.geDiagramContainer svg');
        return svg ? svg.querySelectorAll('g').length : -1;
    });
}

describe('ai cloud drag keeps chat window', () => {
    let browser: Browser;
    let page: Page;

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
        'drag cloud to canvas inserts it and chat window stays put',
        { timeout: 120000 },
        async () => {
            await page.route('**/chat/completions', async (route) => {
                await route.fulfill({ status: 200, contentType: 'text/event-stream', body: CLOUD_SSE });
            });

            await closeDrawioTabs(page);
            const opened = await page.evaluate(() => {
                const p = (window as unknown as { drawioPlugin?: { openNewCustomTab: () => void } }).drawioPlugin;
                if (!p) return false;
                p.openNewCustomTab();
                return true;
            });
            expect(opened).toBe(true);
            const frame = await visibleDrawioFrame(page);

            const dialog = frame.locator('.geDialog');
            await withTimeout(dialog.first().waitFor({ state: 'visible', timeout: 20000 }), 22000, 'wait geDialog');
            await frame.locator('.geBigButton', { hasText: '创建新绘图' }).first().click();
            const blank = frame.locator('[title="空白框图"]').first();
            await withTimeout(blank.waitFor({ state: 'visible', timeout: STEP_TIMEOUT }), STEP_TIMEOUT, 'wait 空白框图');
            await blank.click();
            await blank.dblclick().catch(() => {});
            const canvas = frame.locator('.geDiagramContainer').first();
            await withTimeout(canvas.waitFor({ state: 'visible', timeout: 15000 }), 17000, 'wait canvas');

            const genBtn = frame.locator('[title="生成"]').first();
            await withTimeout(genBtn.waitFor({ state: 'visible', timeout: STEP_TIMEOUT }), STEP_TIMEOUT, 'wait 生成');
            await genBtn.click();
            const input = frame.locator('textarea[placeholder*="描述"]').first();
            await withTimeout(input.waitFor({ state: 'visible', timeout: STEP_TIMEOUT }), STEP_TIMEOUT, 'wait chat input');
            await input.fill(PROMPT);

            const donePromise = page.evaluate(
                () =>
                    new Promise<Record<string, unknown>>((resolve, reject) => {
                        const fs = [...document.querySelectorAll('iframe.siyuan-drawio-plugin__custom-tab')];
                        const f = (fs.find((x) => (x as HTMLElement).offsetParent !== null) || fs[fs.length - 1]) as HTMLIFrameElement;
                        const timer = setTimeout(() => reject(new Error('no stream done event')), 25000);
                        f.contentWindow!.addEventListener(
                            'drawio-ai-stream-done',
                            (e) => {
                                clearTimeout(timer);
                                resolve(((e as CustomEvent).detail || {}) as Record<string, unknown>);
                            },
                            { once: true },
                        );
                    }),
            );
            await input.press('Enter');
            const done = await withTimeout(donePromise, 30000, 'wait stream done');
            expect((done.contentLength as number) || 0).toBeGreaterThan(0);

            // Result item: the wide a.geItem inside the response bubble.
            const items = frame.locator('.geSidebar a.geItem');
            await withTimeout(
                page.waitForFunction(() => {
                    const fs = [...document.querySelectorAll('iframe.siyuan-drawio-plugin__custom-tab')];
                    const f = (fs.find((x) => (x as HTMLElement).offsetParent !== null) || fs[fs.length - 1]) as HTMLIFrameElement;
                    return [...f.contentDocument!.querySelectorAll('.geSidebar a.geItem')].some(
                        (el) => (el as HTMLElement).offsetParent !== null && el.getBoundingClientRect().width > 100,
                    );
                }, { timeout: 15000 }),
                17000,
                'wait cloud result item',
            );
            const n = await items.count();
            let srcIdx = -1;
            for (let i = n - 1; i >= 0; i--) {
                const box = await items.nth(i).boundingBox().catch(() => null);
                if (box && box.width > 100) {
                    srcIdx = i;
                    break;
                }
            }
            expect(srcIdx).toBeGreaterThanOrEqual(0);
            const src = items.nth(srcIdx);
            await src.scrollIntoViewIfNeeded().catch(() => {});

            const before = await chatRect(page);
            expect(before).not.toBeNull();
            const groupsBefore = await canvasGroups(page);

            // Drop point: canvas spot not covered by the chat window.
            const dropPt = await page.evaluate(() => {
                const fs = [...document.querySelectorAll('iframe.siyuan-drawio-plugin__custom-tab')];
                const iframe = (fs.find((x) => (x as HTMLElement).offsetParent !== null) || fs[fs.length - 1]) as HTMLIFrameElement;
                const fr = iframe.getBoundingClientRect();
                const doc = iframe.contentDocument!;
                const cr = doc.querySelector('.geDiagramContainer')!.getBoundingClientRect();
                const cands: Array<[number, number]> = [[0.85, 0.75], [0.7, 0.85], [0.5, 0.85], [0.85, 0.4], [0.3, 0.85]];
                for (const [fx, fy] of cands) {
                    const cx = cr.x + cr.width * fx;
                    const cy = cr.y + cr.height * fy;
                    const el = doc.elementFromPoint(cx, cy);
                    if (el && (el as Element).closest('.geDiagramContainer')) return { x: fr.x + cx, y: fr.y + cy };
                }
                return null;
            });
            expect(dropPt).not.toBeNull();

            const srcBox = await src.boundingBox();
            expect(srcBox).not.toBeNull();
            const sx = srcBox!.x + srcBox!.width / 2;
            const sy = srcBox!.y + srcBox!.height / 2;
            await page.mouse.move(sx, sy);
            await page.mouse.down();
            await page.waitForTimeout(300);
            await page.mouse.move((sx + dropPt!.x) / 2, (sy + dropPt!.y) / 2, { steps: 15 });
            await page.waitForTimeout(300);
            await page.mouse.move(dropPt!.x, dropPt!.y, { steps: 15 });
            await page.waitForTimeout(300);
            await page.mouse.up();

            const groupsAfter = await canvasGroups(page);
            console.log('[cloud-drag] canvas groups:', groupsBefore, '->', groupsAfter);
            expect(groupsAfter).toBeGreaterThan(groupsBefore);

            // Autosave (~3s after drop) used to squeeze the chat window to
            // 0,0 @ ~300x200 via a transient 300x150 iframe; wait past it.
            await page.waitForTimeout(8000);
            const after = await chatRect(page);
            console.log('[cloud-drag] chat:', JSON.stringify(before), '->', JSON.stringify(after));
            expect(after).not.toBeNull();
            expect(Math.abs(after!.x - before!.x)).toBeLessThanOrEqual(2);
            expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(2);
            expect(Math.abs(after!.w - before!.w)).toBeLessThanOrEqual(2);
            expect(Math.abs(after!.h - before!.h)).toBeLessThanOrEqual(2);

            await closeDrawioTabs(page);
        },
    );
});
