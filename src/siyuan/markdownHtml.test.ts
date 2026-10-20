import { describe, it, expect } from "vitest";
import { markdownToCardHtml, sanitizeCardHtml, truncateHtml } from "./markdownHtml";

describe("sanitizeCardHtml — 卡片里只保留排版", () => {
    it("去掉图片、链接地址与 SiYuan 私有属性", () => {
        const html = '<h2 data-node-id="x" class="h2">标题</h2><p><img src="assets/a.png"><a href="https://example.com">链接</a></p>';
        expect(sanitizeCardHtml(html)).toBe('<h2 class="h2">标题</h2><p>链接</p>');
    });

    it("保留加粗、列表、代码块等排版标签", () => {
        const html = "<ul><li><strong>加粗</strong></li></ul><pre><code>const a = 1;</code></pre><blockquote><p>引用</p></blockquote>";
        expect(sanitizeCardHtml(html)).toBe(html);
    });
});

describe("markdownToCardHtml", () => {
    it("使用注入的渲染器，并清理结果", () => {
        const render = () => '<h2 data-node-id="n">标题</h2><img src="x.png">';
        const result = markdownToCardHtml("# 标题", render);
        expect(result.html).toBe("<h2>标题</h2>");
        expect(result.truncated).toBe(false);
    });

    it("渲染器抛错或返回空时得到空 HTML（调用方回退纯文本）", () => {
        expect(markdownToCardHtml("# 标题", () => { throw new Error("boom"); }).html).toBe("");
        expect(markdownToCardHtml("# 标题", () => "").html).toBe("");
        expect(markdownToCardHtml("", () => "<p>x</p>").html).toBe("");
    });

    it("超长 Markdown 截断后带 truncated 标记", () => {
        const result = markdownToCardHtml("x".repeat(50), (md) => `<p>${md}</p>`, 20);
        expect(result.truncated).toBe(true);
        expect(result.html.length).toBeLessThanOrEqual(21);
    });
});

describe("truncateHtml", () => {
    it("优先在标签结束时截断", () => {
        expect(truncateHtml("<p>hello</p><p>world</p>", 14)).toBe("<p>hello</p>…");
    });

    it("不超长时原样返回", () => {
        expect(truncateHtml("<p>ok</p>", 100)).toBe("<p>ok</p>");
    });
});
