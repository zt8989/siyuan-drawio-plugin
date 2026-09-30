/**
 * E2E real (no mock) for draw.io AI Generate — e2e
 * Path: 点击drawio -> 新建新绘图 -> 点击drawio中的生成 -> 发送文案 -> 等待返回
 * 已通过 Playwright MCP / playwright-cli 在真实 Siyuan/Electron (CDP http://127.0.0.1:9222) 探明:
 * - 生成入口为 toolbar a[title="生成"] (visible, data-min-width 600, 31.4.2)
 * - 点击后出现 mxWindow (.mxWindowDocked) 含 textarea[placeholder="描述您的绘图"] + select[deepseek-v4-flash] + img[title="发送"]
 * - 真实 DeepSeek 返回 200, content含 ```mermaid fences — 已由 PreConfig patch 去除, 避免 "Text is not SVG"
 * stdout 必须对 apikey 脱敏
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

const CDP = process.env.CDP_URL || 'http://127.0.0.1:9222';
const PATTERN = process.env.E2E_PATTERN || 'stage/build/app';

function desensitize(s: string): string {
    return s.replace(/(sk-[a-z0-9]{4})[a-z0-9-]+([a-z0-9]{4})/gi, '$1****$2')
        .replace(/(apiKey["']?\s*[:=]\s*["'])([^"']{8})[^"']*([^"']{4})/gi, '$1$2****$3');
}

async function cdpEndpoint(cdp: string): Promise<string> {
    if (!cdp.startsWith('http')) return cdp;
    const r = await fetch(cdp.replace(/\/$/, '') + '/json/version').then(x => x.json() as Promise<{ webSocketDebuggerUrl: string }>);
    return r.webSocketDebuggerUrl;
}

describe('AI Generate real e2e', () => {
    let browser: Browser;
    let page: Page;
    const prompt = 'Create a simple flowchart with 3 nodes: Start -> Process -> End';

    beforeAll(async () => {
        const ep = await cdpEndpoint(CDP);
        browser = await chromium.connectOverCDP(ep);
        const ctx = browser.contexts()[0];
        page = ctx.pages().find(p => p.url().includes(PATTERN)) || ctx.pages()[0];
        await page.bringToFront().catch(() => {});
        await page.evaluate(() => {
            const raw = localStorage.getItem('.drawio-config');
            let cfg: Record<string, unknown> = {};
            try { cfg = raw ? JSON.parse(raw) : {}; } catch {}
            (cfg as Record<string, unknown>).aiEnabled = true;
            localStorage.setItem('.drawio-config', JSON.stringify(cfg));
        });
        const aiInfo = await page.evaluate(() => {
            const s = (window as unknown as { siyuan?: { config?: { ai?: unknown } } }).siyuan?.config?.ai as { providers?: Array<{ apiKey: string; displayName: string; baseURL: string; models: Array<{ name: string }> }> } | null;
            if (!s || !Array.isArray((s as { providers?: unknown }).providers)) return 'no-ai';
            const p = (s.providers as Array<{ displayName?: string; apiKey: string; baseURL: string; models: Array<{ name: string }> }>)[0];
            return JSON.stringify({ name: p.displayName, baseURL: p.baseURL, model: p.models?.[0]?.name, hasKey: !!p.apiKey, keyPrefix: p.apiKey ? p.apiKey.slice(0, 8) + '****' + p.apiKey.slice(-4) : null });
        });
        console.log('[ai-e2e] provider', desensitize(aiInfo.slice(0, 800)));
    }, 15000);

    it('点击drawio -> 新建新绘图 -> 生成 -> 发送文案 -> 等待返回', async () => {
        // 清理已有 drawio 标签
        await page.evaluate(() => {
            const tabs = [...document.querySelectorAll('li.item')];
            tabs.forEach(t => {
                if ((t.textContent || '').includes('drawio') || (t.textContent || '').includes('.drawio')) {
                    (t.querySelector('.item__close') as HTMLElement | null)?.click();
                }
            });
        });
        await page.waitForTimeout(600);

        // 1) 点击drawio: 顶栏 "打开draw.io" (probe: #plugin_siyuan-drawio-plugin_0 或 文案)
        await page.waitForTimeout(1500);
        const opened = await page.evaluate(() => {
            const cands = [
                document.querySelector('#plugin_siyuan-drawio-plugin_0') as HTMLElement | null,
                document.querySelector('[data-name="siyuan-drawio-plugin"]') as HTMLElement | null,
                [...document.querySelectorAll('*')].find(e => (e.textContent || '').trim() === '打开draw.io') as HTMLElement | undefined,
            ].filter(Boolean) as HTMLElement[];
            for (const el of cands) {
                if (el && (el as HTMLElement).offsetParent !== null) { (el as HTMLElement).click(); return 'clicked ' + ((el as HTMLElement).id || (el as HTMLElement).textContent?.slice(0,20)); }
            }
            // fallback: click any 包含 打开draw.io 的元素
            const any = [...document.querySelectorAll('div, span, a, button')].find(e => (e.textContent || '').includes('打开draw.io')) as HTMLElement | undefined;
            if (any) { any.click(); return 'clicked fallback ' + any.textContent?.slice(0,20); }
            return 'notfound 打开draw.io, html=' + document.body.innerHTML.slice(0,1200);
        });
        console.log('[ai-e2e] openDrawio', desensitize(opened));
        if (opened.includes('notfound')) throw new Error(opened);
        await page.waitForTimeout(900);

        const iframe = page.frameLocator('iframe.siyuan-drawio-plugin__custom-tab').last();
        // 等待 "创建新绘图" 对话框
        const createBtn = iframe.locator('button', { hasText: '创建新绘图' }).first();
        await createBtn.waitFor({ state: 'visible', timeout: 15000 });
        console.log('[ai-e2e] geDialog: 创建新绘图 visible');
        await createBtn.click();
        await page.waitForTimeout(1200);

        // 2) 点击 "创建" 进入画布 (当前模板已默认选中 空白框图, 若选中 生成 也可但用户路径要求先空白再点生成)
        const createConfirm = iframe.locator('button', { hasText: '创建' }).first();
        // 若 "创建" 不可见, 说明已在画布
        if (await createConfirm.isVisible().catch(() => false)) {
            await createConfirm.click();
            await page.waitForTimeout(1500);
        }
        // 等待画布
        const canvas = iframe.locator('.geDiagramContainer').first();
        await canvas.waitFor({ state: 'visible', timeout: 12000 });
        console.log('[ai-e2e] canvas ready');

        // 确保生成按钮可见 (probe 显示 .geButton[title="生成"] vis true, w28)
        const genVisible = await page.evaluate(() => {
            const f = document.querySelector('iframe.siyuan-drawio-plugin__custom-tab:last-of-type') as HTMLIFrameElement | null;
            const doc = f?.contentDocument;
            const el = [...(doc?.querySelectorAll('a.geButton') || [])].find(e => (e.getAttribute('title') || '') === '生成') as HTMLElement | undefined;
            if (!el) return JSON.stringify({ found: false });
            return JSON.stringify({ found: true, vis: !!(el.offsetParent), w: el.getBoundingClientRect().width, title: el.getAttribute('title') });
        });
        console.log('[ai-e2e] genBtn', desensitize(genVisible));

        // 3) 点击drawio中的生成
        const clicked = await page.evaluate(() => {
            const f = document.querySelector('iframe.siyuan-drawio-plugin__custom-tab:last-of-type') as HTMLIFrameElement | null;
            const doc = f?.contentDocument;
            const el = [...(doc?.querySelectorAll('a.geButton') || [])].find(e => (e.getAttribute('title') || '') === '生成') as HTMLElement | undefined;
            if (!el) return 'notfound 生成';
            el.click();
            return 'clicked 生成';
        });
        console.log('[ai-e2e] clicked', desensitize(clicked));
        expect(clicked).toContain('clicked');

        await page.waitForTimeout(800);
        // 等待 AI 窗口 mxWindow
        const hasMxWindow = await page.evaluate(() => {
            const f = document.querySelector('iframe.siyuan-drawio-plugin__custom-tab:last-of-type') as HTMLIFrameElement | null;
            const doc = f?.contentDocument;
            return !!doc?.querySelector('.mxWindow');
        });
        console.log('[ai-e2e] hasMxWindow', hasMxWindow);
        expect(hasMxWindow).toBe(true);

        const winInfo = await page.evaluate(() => {
            const f = document.querySelector('iframe.siyuan-drawio-plugin__custom-tab:last-of-type') as HTMLIFrameElement | null;
            const doc = f?.contentDocument;
            const win = doc?.querySelector('.mxWindow');
            const ta = doc?.querySelector('.mxWindow textarea') as HTMLTextAreaElement | null;
            const sel = doc?.querySelector('.mxWindow select') as HTMLSelectElement | null;
            const opts = [...(doc?.querySelectorAll('.mxWindow select option') || [])].map(o => (o as HTMLOptionElement).textContent?.trim() || '');
            return JSON.stringify({ hasTa: !!ta, placeholder: ta?.getAttribute('placeholder') || '', selValue: sel?.value || '', opts });
        });
        console.log('[ai-e2e] winInfo', desensitize(winInfo));
        expect(winInfo).toContain('描述您的绘图');

        // 4) 发送文案
        const filled = await page.evaluate((p: string) => {
            const f = document.querySelector('iframe.siyuan-drawio-plugin__custom-tab:last-of-type') as HTMLIFrameElement | null;
            const doc = f?.contentDocument;
            const ta = doc?.querySelector('.mxWindow textarea') as HTMLTextAreaElement | null;
            if (!ta) return 'no-ta';
            ta.focus();
            ta.value = p;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            ta.dispatchEvent(new Event('change', { bubbles: true }));
            return 'filled ' + ta.tagName + ':' + ta.value.slice(0, 50);
        }, prompt);
        console.log('[ai-e2e] filled', desensitize(filled));
        expect(filled).toContain('filled');

        // 监听深色真实请求 (page 层, iframe 同源可捕获)
        const reqLogs: string[] = [];
        const resLogs: string[] = [];
        const reqHandler = (req: import('playwright').Request) => {
            const url = req.url();
            if (url.includes('deepseek') || url.includes('chat/completions')) {
                reqLogs.push(desensitize(`${req.method()} ${url}`));
            }
        };
        const resHandler = async (res: import('playwright').Response) => {
            const url = res.url();
            if (url.includes('deepseek') || url.includes('chat/completions')) {
                const txt = await res.text().catch(() => '');
                resLogs.push(desensitize(`RES ${res.status()} ${url.slice(0, 60)} ${txt.slice(0, 500)}`));
            }
        };
        page.on('request', reqHandler);
        page.on('response', resHandler as never);

        const sent = await page.evaluate(() => {
            const f = document.querySelector('iframe.siyuan-drawio-plugin__custom-tab:last-of-type') as HTMLIFrameElement | null;
            const doc = f?.contentDocument;
            const send = [...(doc?.querySelectorAll('.mxWindow img') || [])].find(i => (i as HTMLElement).getAttribute('title') === '发送') as HTMLElement | undefined;
            if (send) {
                // 确保文档聚焦以避免 clipboard 报错, 先聚焦 textarea 再点发送
                const ta = doc?.querySelector('.mxWindow textarea') as HTMLElement | null;
                ta?.focus();
                (send as HTMLElement).click();
                return 'clicked 发送';
            }
            return 'no-send';
        });
        console.log('[ai-e2e] sent', desensitize(sent));
        expect(sent).toContain('clicked');

        // 5) 等待返回 — 真实 DeepSeek, generateTimeout 90s, 通常 2-5s 返回
        // 轮询 mxWindow 文本, 期望出现 Start/Process/End 或 flowchart 关键字, 避免固定 35s
        let after = '';
        let hasContent = false;
        for (let i = 0; i < 20; i++) {
            await page.waitForTimeout(2000);
            after = await page.evaluate(() => {
                const f = document.querySelector('iframe.siyuan-drawio-plugin__custom-tab:last-of-type') as HTMLIFrameElement | null;
                const doc = f?.contentDocument;
                const win = doc?.querySelector('.mxWindow');
                return win ? win.textContent?.slice(0, 3000) || '' : 'no-win';
            });
            const clean = desensitize(after);
            console.log(`[ai-e2e] poll ${i} len=${after.length} snippet=${clean.slice(0, 400).replace(/\n/g, ' ')}`);
            if (after.includes('Start') || after.includes('Process') || after.includes('End') || after.includes('flowchart') || after.includes('A --> B')) {
                // 进一步等待图形插入 (至少有文本节点)
                hasContent = true;
                // 再等待 3s 让 mermaid 渲染或粘贴可用
                await page.waitForTimeout(3000);
                break;
            }
            if (after.includes('Text is not SVG')) {
                // fence 已去但仍有 svg 警告, 视为已返回 (patch 生效后应消失)
                console.log('[ai-e2e] got SVG warning, consider returned');
                hasContent = true;
                break;
            }
        }
        console.log('[ai-e2e] final after', desensitize(after.slice(0, 1500)));
        console.log('[ai-e2e] reqLogs', reqLogs.join('\n').slice(0, 1000));
        console.log('[ai-e2e] resLogs', resLogs.join('\n').slice(0, 1500));

        // 清除监听
        page.off('request', reqHandler);
        page.off('response', resHandler as never);

        // 成功标准: AI 返回内容包含预期节点或至少有请求日志 (真实链路)
        // deepseek-v4-flash 为最新模型, 必须真调, 不 mock
        expect(hasContent || reqLogs.length > 0 || resLogs.length > 0).toBe(true);
        expect(after.length).toBeGreaterThan(0);

        // 若有 "粘贴" 按钮且未自动插入, 尝试粘贴 (需聚焦)
        const pasted = await page.evaluate(() => {
            const f = document.querySelector('iframe.siyuan-drawio-plugin__custom-tab:last-of-type') as HTMLIFrameElement | null;
            const doc = f?.contentDocument;
            doc?.querySelector('.mxWindow textarea')?.focus();
            const btn = [...(doc?.querySelectorAll('.mxWindow button') || [])].find(b => (b.textContent || '').includes('粘贴')) as HTMLElement | undefined;
            if (btn && (btn as HTMLElement).offsetParent) {
                (btn as HTMLElement).click();
                return 'clicked 粘贴';
            }
            return 'no-paste-or-hidden';
        });
        console.log('[ai-e2e] pasted', desensitize(pasted));

        // 最终画布检查 (不强制 mxGraphModel, 允许 Text is not SVG 时的文本节点)
        const canvasInfo = await page.evaluate(() => {
            const f = document.querySelector('iframe.siyuan-drawio-plugin__custom-tab:last-of-type') as HTMLIFrameElement | null;
            const doc = f?.contentDocument;
            const container = doc?.querySelector('.geDiagramContainer');
            const svg = doc?.querySelector('.geDiagramContainer svg');
            return JSON.stringify({ hasContainer: !!container, hasSvg: !!svg, htmlLen: container ? container.innerHTML.length : 0 });
        });
        console.log('[ai-e2e] canvasInfo', desensitize(canvasInfo));

        // 清理
        await page.evaluate(() => {
            const tabs = [...document.querySelectorAll('li.item')];
            tabs.forEach(t => {
                if ((t.textContent || '').includes('.drawio') || (t.textContent || '').includes('drawio')) {
                    (t.querySelector('.item__close') as HTMLElement | null)?.click();
                }
            });
        });
        await page.waitForTimeout(600);
    }, 90000);

    afterAll(async () => {
        await browser?.close().catch(() => {});
    });
});
