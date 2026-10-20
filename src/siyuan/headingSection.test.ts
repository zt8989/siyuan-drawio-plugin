import { describe, it, expect } from "vitest";
import {
    documentOrder,
    extractHeadingSection,
    headingLevel,
    sectionMarkdown,
    sectionText,
    type BlockRow,
} from "./headingSection";

function row(id: string, type: string, subtype: string, parentId: string, sort: number, content = ""): BlockRow {
    return { id, type, subtype, parentId, sort, content };
}

// 文档结构：
// doc
// ├─ h1 A (10)
// │   ├─ p A1 (10)
// │   ├─ h2 A.1 (20)
// │   │   └─ p A.1.1 (10)
// │   └─ p A2 (30)
// ├─ h1 B (20)
// │   └─ p B1 (10)
// └─ h3 C (30)
export const doc: BlockRow[] = [
    row("doc", "d", "", "", 0),
    row("A", "h", "h1", "doc", 10, "A"),
    row("A1", "p", "", "A", 10, "A1"),
    row("A1h", "h", "h2", "A", 20, "A.1"),
    row("A11", "p", "", "A1h", 10, "A.1.1"),
    row("A2", "p", "", "A", 30, "A2"),
    row("B", "h", "h1", "doc", 20, "B"),
    row("B1", "p", "", "B", 10, "B1"),
    row("C", "h", "h3", "doc", 30, "C"),
];

describe("headingLevel", () => {
    it("解析 h1-h6，其它返回 0", () => {
        expect(headingLevel("h1")).toBe(1);
        expect(headingLevel("h6")).toBe(6);
        expect(headingLevel("")).toBe(0);
        expect(headingLevel("p")).toBe(0);
    });
});

describe("documentOrder", () => {
    it("按 parent/sort 深度优先还原阅读顺序", () => {
        expect(documentOrder(doc).map((r) => r.id)).toEqual([
            "doc", "A", "A1", "A1h", "A11", "A2", "B", "B1", "C",
        ]);
    });
});

describe("extractHeadingSection", () => {
    it("h1 章节包含自己的子树与子标题，遇到下一个 h1 停止", () => {
        expect(extractHeadingSection(doc, "A").map((r) => r.id)).toEqual(["A1", "A1h", "A11", "A2"]);
    });

    it("h2 章节包含其后内容，遇到 h1 停止", () => {
        expect(extractHeadingSection(doc, "A1h").map((r) => r.id)).toEqual(["A11", "A2"]);
    });

    it("h1 章节里的 h3 子标题保留在章节内", () => {
        expect(extractHeadingSection(doc, "B").map((r) => r.id)).toEqual(["B1", "C"]);
    });

    it("找不到标题时返回空数组", () => {
        expect(extractHeadingSection(doc, "missing")).toEqual([]);
    });
});

describe("sectionMarkdown", () => {
    it("保留标题层级、列表项与代码块", () => {
        const rows = [
            row("p1", "p", "", "", 10, "第一段"),
            row("h1", "h", "h3", "", 20, "子标题"),
            row("i1", "i", "", "", 30, "列表项"),
            row("c1", "c", "", "", 40, "const a = 1;"),
        ];
        expect(sectionMarkdown(rows)).toBe("第一段\n\n### 子标题\n\n- 列表项\n\n```\nconst a = 1;\n```");
    });
});

describe("sectionText", () => {
    it("只取文本块并跳过列表/容器，块之间空一行", () => {
        const rows = [
            row("p1", "p", "", "", 10, "第一段"),
            row("l1", "l", "", "", 20, "1. 列表"),
            row("i1", "i", "", "l1", 10, "列表项"),
            row("c1", "c", "", "", 30, "const a = 1;"),
            row("empty", "p", "", "", 40, "  "),
        ];
        expect(sectionText(rows)).toBe("第一段\n\n列表项\n\nconst a = 1;");
    });
});
