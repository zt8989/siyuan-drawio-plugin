import { describe, it, expect } from "vitest";
import {
    SiyuanApiNoteSource,
    buildSearchStatement,
    escapeSqlLiteral,
    noteTitleFromPath,
    type SiyuanRequest,
} from "./SiyuanNotes";

describe("SiyuanNotes — 搜索语句与文档标题", () => {
    it("空关键字只按文档类型取最近更新，不拼 LIKE", () => {
        const stmt = buildSearchStatement("   ");
        expect(stmt).toContain("WHERE type = 'd'");
        expect(stmt).not.toContain("LIKE");
        expect(stmt).toContain("ORDER BY updated DESC");
    });

    it("有关键字时同时搜文档与标题块", () => {
        expect(buildSearchStatement("标题")).toContain("(type = 'd' OR type = 'h')");
    });

    it("搜索词里的单引号被转义，不破坏 SQL 字面量", () => {
        expect(escapeSqlLiteral("a'b")).toBe("a''b");
        expect(buildSearchStatement("a'b")).toContain("content LIKE '%a''b%'");
    });

    it("hpath 推导标题，兼容首尾斜杠", () => {
        expect(noteTitleFromPath("/foo/bar")).toBe("bar");
        expect(noteTitleFromPath("/foo/bar/")).toBe("bar");
        expect(noteTitleFromPath("")).toBe("");
        expect(noteTitleFromPath(undefined)).toBe("");
    });
});

describe("SiyuanApiNoteSource — 外部接缝是 SiyuanRequest", () => {
    it("search 映射文档与标题行，过滤缺失 id 的行", async () => {
        const calls: Array<{ url: string; data: unknown }> = [];
        const send: SiyuanRequest = async (url, data) => {
            calls.push({ url, data });
            return [
                { id: "20240101120000-aaaaaaa", type: "d", content: "笔记 A", hpath: "/a/笔记 A", updated: "20240101120000" },
                { id: "20240101120000-hhhhhhh", type: "h", subtype: "h3", content: "标题 A", hpath: "/a/笔记 A", updated: "20240101120000" },
                { hpath: "/missing/id" },
            ];
        };
        const source = new SiyuanApiNoteSource(send);
        const notes = await source.search("笔记");
        expect(calls[0].url).toBe("/api/query/sql");
        expect(notes[0]).toMatchObject({ id: "20240101120000-aaaaaaa", title: "笔记 A", kind: "doc" });
        expect(notes[1]).toMatchObject({ id: "20240101120000-hhhhhhh", title: "标题 A", kind: "heading", level: 3 });
        expect(notes).toHaveLength(2);
    });

    it("search 在接口失败（null）时返回空数组", async () => {
        const source = new SiyuanApiNoteSource(async () => null);
        expect(await source.search("x")).toEqual([]);
    });

    it("read 文档：先查 block 类型，再导出 Markdown 并转纯文本", async () => {
        const send: SiyuanRequest = async (url, data) => {
            if (url === "/api/query/sql") {
                expect((data as { stmt: string }).stmt).toContain("type, subtype, root_id");
                return [{ id: "20240101120000-aaaaaaa", type: "d", content: "笔记 A", hpath: "/a/笔记 A" }];
            }
            expect(url).toBe("/api/export/exportMdContent");
            expect(data).toEqual({ id: "20240101120000-aaaaaaa" });
            return { hPath: "/a/笔记 A", content: "# 笔记 A\n\n正文 **加粗**" };
        };
        const rendered: string[] = [];
        const source = new SiyuanApiNoteSource(send, (markdown) => {
            rendered.push(markdown);
            return "<p>渲染结果</p>";
        });
        const content = await source.read("20240101120000-aaaaaaa");
        expect(content.html).toBe("<p>渲染结果</p>");
        expect(rendered[0]).toContain("正文 **加粗**");
        expect(rendered[0]).not.toContain("# 笔记 A");
        expect(content.title).toBe("笔记 A");
        expect(content.hpath).toBe("/a/笔记 A");
        expect(content.kind).toBe("doc");
        expect(content.text).toBe("正文 加粗");
        expect(content.truncated).toBe(false);
    });

    it("read 标题：只取该标题下的块，不调用整篇导出", async () => {
        const urls: string[] = [];
        const send: SiyuanRequest = async (url) => {
            urls.push(url);
            if (url === "/api/query/sql") {
                if (urls.length === 1) {
                    return [{ id: "H", type: "h", subtype: "h2", root_id: "R", content: "我的标题", hpath: "/a/文档" }];
                }
                return [
                    { id: "doc", type: "d", subtype: "", parent_id: "", sort: 0, content: "文档" },
                    { id: "H", type: "h", subtype: "h2", parent_id: "doc", sort: 10, content: "我的标题" },
                    { id: "p1", type: "p", subtype: "", parent_id: "H", sort: 10, content: "章节第一段" },
                    { id: "H2", type: "h", subtype: "h3", parent_id: "H", sort: 20, content: "子标题" },
                    { id: "p2", type: "p", subtype: "", parent_id: "H2", sort: 10, content: "子章节正文" },
                    { id: "NEXT", type: "h", subtype: "h2", parent_id: "doc", sort: 20, content: "下一个标题" },
                ];
            }
            throw new Error("unexpected " + url);
        };
        const rendered: string[] = [];
        const source = new SiyuanApiNoteSource(send, (markdown) => {
            rendered.push(markdown);
            return "<div>章节</div>";
        });
        const content = await source.read("H");
        expect(content).toMatchObject({ id: "H", title: "我的标题", kind: "heading", level: 2, hpath: "/a/文档" });
        expect(content.text).toBe("章节第一段\n\n子标题\n\n子章节正文");
        expect(content.html).toBe("<div>章节</div>");
        expect(rendered[0]).toContain("### 子标题");
        expect(urls).toEqual(["/api/query/sql", "/api/query/sql"]);
    });

    it("read 在正文缺失时抛错，调用方可以回给画布提示", async () => {
        const send: SiyuanRequest = async (url) => {
            if (url === "/api/query/sql") {
                return [{ id: "bad-id", type: "d", content: "x", hpath: "/x" }];
            }
            return { hPath: "/x" };
        };
        const source = new SiyuanApiNoteSource(send);
        await expect(source.read("bad-id")).rejects.toThrow("无法读取笔记内容");
    });
});
