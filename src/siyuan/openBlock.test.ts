import { describe, it, expect, afterEach } from "vitest";
import {
    emitOpenUrlViaIpc,
    extractSiyuanBlockId,
    isSiyuanBlockLink,
    openSiyuanBlock,
    openSiyuanUrlInWindow,
    siyuanBlockUrl,
} from "./openBlock";

function fakeDoc() {
    const clicked: string[] = [];
    const removed: string[] = [];
    const anchor = {
        href: "",
        style: { display: "" },
        click() { clicked.push(this.href); },
        remove() { removed.push(this.href); },
    } as unknown as HTMLAnchorElement;
    const doc = {
        createElement: () => anchor,
        body: { appendChild: () => anchor },
    } as unknown as Document;
    return { doc, anchor, clicked, removed };
}

describe("openSiyuanBlock — 优先宿主 IPC，其次隐藏锚点", () => {
    afterEach(() => {
        delete (globalThis as unknown as { require?: unknown }).require;
    });

    it("链接与 block id 互转", () => {
        const href = "siyuan://blocks/20240101120000-abcdefg";
        expect(siyuanBlockUrl("20240101120000-abcdefg")).toBe(href);
        expect(isSiyuanBlockLink(href)).toBe(true);
        expect(extractSiyuanBlockId(href)).toBe("20240101120000-abcdefg");
        expect(isSiyuanBlockLink("https://example.com")).toBe(false);
        expect(isSiyuanBlockLink(null)).toBe(false);
    });

    it("IPC 通道成功时不触碰 DOM", () => {
        const { doc, clicked } = fakeDoc();
        const emitted: string[] = [];
        openSiyuanBlock("20240101120000-abcdefg", {
            emitOpenUrl: (url) => { emitted.push(url); return true; },
            doc,
        });
        expect(emitted).toEqual(["siyuan://blocks/20240101120000-abcdefg"]);
        expect(clicked).toEqual([]);
    });

    it("IPC 不可用时走 window.open 深链", () => {
        const { doc, clicked } = fakeDoc();
        const opened: string[] = [];
        openSiyuanBlock("20240101120000-abcdefg", {
            emitOpenUrl: () => false,
            openWindow: (url) => { opened.push(url); return true; },
            doc,
        });
        expect(opened).toEqual(["siyuan://blocks/20240101120000-abcdefg"]);
        expect(clicked).toEqual([]);
    });

    it("所有宿主通道都不可用时退回隐藏锚点点击，并在点击后移除", () => {
        const { doc, anchor, clicked, removed } = fakeDoc();
        openSiyuanBlock("20240101120000-abcdefg", { emitOpenUrl: () => false, openWindow: () => false, doc });
        expect(clicked).toEqual(["siyuan://blocks/20240101120000-abcdefg"]);
        expect(removed).toEqual(["siyuan://blocks/20240101120000-abcdefg"]);
        expect(anchor.style.display).toBe("none");
    });

    it("空 id 不产生任何动作", () => {
        let emitted = 0;
        openSiyuanBlock("", { emitOpenUrl: () => { emitted++; return true; } });
        expect(emitted).toBe(0);
    });

    it("非浏览器环境 openSiyuanUrlInWindow 返回 false", () => {
        expect(openSiyuanUrlInWindow("siyuan://blocks/x")).toBe(false);
    });

    it("非 Electron 环境下 emitOpenUrlViaIpc 返回 false", () => {
        expect(emitOpenUrlViaIpc("siyuan://blocks/x")).toBe(false);
    });

    it("Electron 环境通过 siyuan-open-url 通道派发", () => {
        const events: Array<{ channel: string; payload: unknown }> = [];
        (globalThis as unknown as { require?: unknown }).require = () => ({
            ipcRenderer: { emit: (channel: string, _event: unknown, payload: unknown) => events.push({ channel, payload }) },
        });
        expect(emitOpenUrlViaIpc("siyuan://blocks/20240101120000-abcdefg")).toBe(true);
        expect(events).toEqual([{ channel: "siyuan-open-url", payload: "siyuan://blocks/20240101120000-abcdefg" }]);
    });
});
