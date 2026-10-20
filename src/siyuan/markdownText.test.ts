import { describe, it, expect } from "vitest";
import { markdownToPlainText } from "./markdownText";

describe("markdownToPlainText — 卡片正文只保留可读文本", () => {
    it("去掉标题井号、强调与行内代码", () => {
        const result = markdownToPlainText("# 标题\n\n这是 **加粗**、*斜体* 与 `code`。\n\n## 二级标题");
        expect(result.text).toBe("标题\n\n这是 加粗、斜体 与 code。\n\n二级标题");
        expect(result.truncated).toBe(false);
    });

    it("链接与图片只保留可读文本", () => {
        const result = markdownToPlainText("见 [文档](https://example.com/a) 与 ![截图](assets/a.png)");
        expect(result.text).toBe("见 文档 与 截图");
    });

    it("去掉引用、列表与分隔线标记", () => {
        const result = markdownToPlainText("> 引用一行\n\n- 第一项\n- 第二项\n\n1. 有序\n\n---");
        expect(result.text).toBe("引用一行\n\n第一项\n第二项\n\n有序");
    });

    it("去掉围栏行但保留代码正文，并清理 SiYuan 块属性", () => {
        const result = markdownToPlainText("```js\nconst a = 1;\n```\n\n段落{: id=\"20240101120000-abcdefg\" updated=\"20240101120000\" }");
        expect(result.text).toBe("const a = 1;\n\n段落");
    });

    it("折叠多余空行并去掉 HTML 标签", () => {
        const result = markdownToPlainText("<span style=\"color:red\">红字</span>\n\n\n\n下一段");
        expect(result.text).toBe("红字\n\n下一段");
    });

    it("超长内容在空白处截断并标记 truncated", () => {
        const long = "第一段内容。\n\n" + "第二段".repeat(50);
        const result = markdownToPlainText(long, 40);
        expect(result.truncated).toBe(true);
        expect(result.text.endsWith("…")).toBe(true);
        expect(result.text.length).toBeLessThanOrEqual(41);
    });

    it("空输入返回空文本", () => {
        expect(markdownToPlainText("")).toEqual({ text: "", truncated: false });
    });
});
