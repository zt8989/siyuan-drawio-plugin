/**
 * openSiyuanBlock — 让画布上的「引用」卡片跳回思源。
 *
 * 三条通道，优先级从快到慢：
 * 1. Electron IPC：思源前端监听 `siyuan-open-url` 并调用 `processSiYuanUri`
 *    （内部 openFileById：已打开则聚焦，否则新建页签），不离开当前进程。
 * 2. `window.open("siyuan://blocks/<id>")`：Electron 的 window-open 处理器把它交给
 *    shell.openExternal，再经 siyuan:// 深链回到思源。桌面端实测可用。
 * 3. 隐藏锚点点击：走思源对 siyuan:// 链接的全局点击处理。
 *
 * 端口（emitOpenUrl / openWindow / doc）可注入，测试不依赖 Electron 或真实 DOM。
 */

export const SIYUAN_BLOCK_SCHEME = "siyuan://blocks/";
export const SIYUAN_OPEN_URL_CHANNEL = "siyuan-open-url";

export function siyuanBlockUrl(id: string): string {
    return `${SIYUAN_BLOCK_SCHEME}${id}`;
}

export function isSiyuanBlockLink(href: string | null | undefined): boolean {
    return typeof href === "string" && href.startsWith(SIYUAN_BLOCK_SCHEME);
}

export function extractSiyuanBlockId(href: string): string {
    return href.startsWith(SIYUAN_BLOCK_SCHEME) ? href.slice(SIYUAN_BLOCK_SCHEME.length) : "";
}

function resolveRequire(): ((name: string) => unknown) | undefined {
    const scopes: unknown[] = [globalThis];
    if (typeof window !== "undefined") {
        scopes.push(window);
    }
    for (const scope of scopes) {
        try {
            const candidate = (scope as { require?: unknown })?.require;
            if (typeof candidate === "function") {
                return candidate as (name: string) => unknown;
            }
        } catch (error) {
            // 跨域或受限作用域：继续尝试下一条通道
        }
    }
    return undefined;
}

/** 桌面端：直接触发思源自己的 IPC 事件；不可用时返回 false。 */
export function emitOpenUrlViaIpc(url: string): boolean {
    const requireFn = resolveRequire();
    if (!requireFn) {
        return false;
    }
    try {
        const electron = requireFn("electron") as { ipcRenderer?: { emit?: (channel: string, event: unknown, payload: unknown) => void } };
        const ipc = electron?.ipcRenderer;
        if (!ipc || typeof ipc.emit !== "function") {
            return false;
        }
        ipc.emit(SIYUAN_OPEN_URL_CHANNEL, {}, url);
        return true;
    } catch (error) {
        return false;
    }
}

/** 桌面端深链：Electron 把 siyuan:// 交给系统协议，再回到思源。 */
export function openSiyuanUrlInWindow(url: string): boolean {
    if (typeof window === "undefined" || typeof window.open !== "function") {
        return false;
    }
    try {
        window.open(url, "_blank");
        return true;
    } catch (error) {
        return false;
    }
}

function clickAnchor(url: string, doc: Document): void {
    const anchor = doc.createElement("a");
    anchor.href = url;
    anchor.style.display = "none";
    doc.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
}

export interface OpenBlockPorts {
    /** 返回 true 表示已经通过宿主通道打开，不再回退。 */
    emitOpenUrl?: (url: string) => boolean;
    /** 返回 true 表示已经交给 window.open，不再回退。 */
    openWindow?: (url: string) => boolean;
    doc?: Document;
}

export function openSiyuanBlock(id: string, ports: OpenBlockPorts = {}): void {
    if (!id) {
        return;
    }
    const url = siyuanBlockUrl(id);
    const emit = ports.emitOpenUrl ?? emitOpenUrlViaIpc;
    if (emit(url)) {
        return;
    }
    const openWindow = ports.openWindow ?? openSiyuanUrlInWindow;
    if (openWindow(url)) {
        return;
    }
    const doc = ports.doc ?? (typeof document !== "undefined" ? document : undefined);
    if (doc) {
        clickAnchor(url, doc);
    }
}
