import { request } from "@/api";
import { markdownToPlainText } from "./markdownText";
import {
    markdownToCardHtml,
    stripFrontMatter,
    stripLeadingTitleHeading,
    type MarkdownRenderer,
} from "./markdownHtml";
import { extractHeadingSection, headingLevel, sectionMarkdown, sectionText, type BlockRow } from "./headingSection";

/**
 * SiyuanNotes — draw.io 画布上的「嵌入 / 引用」组件读取的思源笔记来源。
 *
 * 外部接缝：SiyuanNoteSource（search / read），画布侧只认这两个动作。
 * 内部接缝：SiyuanRequest（POST /api/*），测试注入假实现即可，不碰真实 HTTP。
 * 深度：小的接口隐藏 SQL、文档/标题两种读取方式、Markdown → 纯文本的转换与截断。
 *
 * 选择项有两种：整篇文档（type='d'）与标题章节（type='h'）。标题章节只嵌入
 * 该标题下的内容（下一个同级/更高级标题为止），见 headingSection。
 */

export type SiyuanNoteKind = "doc" | "heading";

/** 选择弹窗里的一行。 */
export interface SiyuanNoteSummary {
    id: string;
    title: string;
    hpath: string;
    updated: string;
    kind: SiyuanNoteKind;
    /** 标题级别（1-6）；文档为 undefined。 */
    level?: number;
}

/** 嵌入卡片需要的正文（已转纯文本并按上限截断）。 */
export interface SiyuanNoteContent extends SiyuanNoteSummary {
    /** 纯文本（预览卡片、渲染失败时的兜底）。 */
    text: string;
    /** Markdown 渲染后的卡片 HTML（draw.io 标签用）。 */
    html: string;
    truncated: boolean;
}

export interface SiyuanNoteSource {
    /** 按关键字搜索文档与标题；空关键字返回最近更新的文档。 */
    search(keyword: string): Promise<SiyuanNoteSummary[]>;
    /** 读取正文：文档导出 Markdown，标题取该章节下的块。 */
    read(id: string): Promise<SiyuanNoteContent>;
}

export type SiyuanRequest = (url: string, data: unknown) => Promise<unknown>;

/** 默认用思源自带的 Lute 渲染，保证和笔记里的 Markdown 排版一致。 */
export function luteMarkdownRenderer(markdown: string): string {
    try {
        const Lute = (globalThis as unknown as { Lute?: { New?: () => { Md2HTML?: (markdown: string) => string } } }).Lute;
        const lute = Lute && typeof Lute.New === "function" ? Lute.New() : null;
        return lute && typeof lute.Md2HTML === "function" ? lute.Md2HTML(markdown) : "";
    } catch (error) {
        return "";
    }
}

/** 搜索返回的最大条数，避免弹窗一次渲染上千行。 */
export const NOTE_SEARCH_LIMIT = 30;
/** 嵌入卡片保存的正文上限（字符数）。 */
export const EMBED_MAX_CHARS = 3000;
/** 单个文档取块的上限，防止超大文档拖慢读取。 */
export const SECTION_BLOCK_LIMIT = 20000;

interface SqlRow {
    id?: string;
    type?: string;
    subtype?: string;
    root_id?: string;
    parent_id?: string;
    sort?: string | number;
    content?: string;
    hpath?: string;
    updated?: string;
}

/** SQL 字面量转义：单引号翻倍，防止搜索词破坏语句。 */
export function escapeSqlLiteral(value: string): string {
    return value.replace(/'/g, "''");
}

/** `/foo/bar` → `bar`；导出接口只给路径时用它推导标题。 */
export function noteTitleFromPath(hpath: string | undefined | null): string {
    const segments = (hpath || "").split("/").filter((segment) => segment !== "");
    return segments.length > 0 ? segments[segments.length - 1] : "";
}

export function buildSearchStatement(keyword: string): string {
    const trimmed = keyword.trim();
    const fields = "id, type, subtype, content, hpath, updated";
    if (trimmed === "") {
        // 空关键字只列最近文档，避免把整库标题一次性铺满弹窗
        return `SELECT ${fields} FROM blocks WHERE type = 'd' ORDER BY updated DESC LIMIT ${NOTE_SEARCH_LIMIT}`;
    }
    return `SELECT ${fields} FROM blocks WHERE (type = 'd' OR type = 'h') AND content LIKE '%${escapeSqlLiteral(trimmed)}%' ORDER BY updated DESC LIMIT ${NOTE_SEARCH_LIMIT}`;
}

export function buildBlockMetaStatement(id: string): string {
    return `SELECT id, type, subtype, root_id, content, hpath, updated FROM blocks WHERE id = '${escapeSqlLiteral(id)}' LIMIT 1`;
}

export function buildDocBlocksStatement(rootId: string): string {
    return `SELECT id, type, subtype, parent_id, sort, content FROM blocks WHERE root_id = '${escapeSqlLiteral(rootId)}' ORDER BY sort LIMIT ${SECTION_BLOCK_LIMIT}`;
}

function toBlockRow(row: SqlRow): BlockRow {
    return {
        id: row.id || "",
        type: row.type || "",
        subtype: row.subtype || "",
        parentId: row.parent_id || "",
        sort: Number(row.sort) || 0,
        content: row.content || "",
    };
}

export class SiyuanApiNoteSource implements SiyuanNoteSource {
    constructor(
        private readonly send: SiyuanRequest = request as unknown as SiyuanRequest,
        private readonly renderMarkdown: MarkdownRenderer = luteMarkdownRenderer,
    ) {}

    async search(keyword: string): Promise<SiyuanNoteSummary[]> {
        const data = await this.send("/api/query/sql", { stmt: buildSearchStatement(keyword) });
        if (!Array.isArray(data)) {
            return [];
        }
        return (data as SqlRow[])
            .filter((row) => typeof row.id === "string" && row.id !== "")
            .map((row) => {
                const heading = row.type === "h";
                return {
                    id: row.id as string,
                    title: row.content || noteTitleFromPath(row.hpath),
                    hpath: row.hpath || "",
                    updated: row.updated || "",
                    kind: heading ? "heading" as const : "doc" as const,
                    level: heading ? headingLevel(row.subtype) || 1 : undefined,
                };
            });
    }

    async read(id: string): Promise<SiyuanNoteContent> {
        const meta = await this.blockMeta(id);
        if (meta && meta.type === "h") {
            return this.readHeading(meta);
        }
        return this.readDocument(id);
    }

    private async blockMeta(id: string): Promise<SqlRow | null> {
        const data = await this.send("/api/query/sql", { stmt: buildBlockMetaStatement(id) });
        return Array.isArray(data) && data.length > 0 ? (data[0] as SqlRow) : null;
    }

    /** 整篇文档：`exportMdContent` 直接给 Markdown。 */
    private async readDocument(id: string): Promise<SiyuanNoteContent> {
        const data = (await this.send("/api/export/exportMdContent", { id })) as
            | { hPath?: string; content?: string }
            | null;
        if (!data || typeof data.content !== "string") {
            throw new Error(`无法读取笔记内容: ${id}`);
        }
        const hpath = data.hPath || "";
        const title = noteTitleFromPath(hpath);
        const markdown = stripLeadingTitleHeading(stripFrontMatter(data.content), title);
        const { text, truncated } = markdownToPlainText(markdown, EMBED_MAX_CHARS);
        const { html } = markdownToCardHtml(markdown, this.renderMarkdown);
        return {
            id,
            title,
            hpath,
            updated: "",
            kind: "doc",
            text,
            html,
            truncated,
        };
    }

    /** 标题章节：取整篇文档的块树，再截出该标题下的内容。 */
    private async readHeading(meta: SqlRow): Promise<SiyuanNoteContent> {
        const id = meta.id || "";
        const rootId = meta.root_id || "";
        const data = await this.send("/api/query/sql", { stmt: buildDocBlocksStatement(rootId) });
        const rows = Array.isArray(data) ? (data as SqlRow[]).map(toBlockRow) : [];
        const section = extractHeadingSection(rows, id);
        const markdown = sectionMarkdown(section);
        const { text, truncated } = markdownToPlainText(sectionText(section), EMBED_MAX_CHARS);
        const { html } = markdownToCardHtml(markdown, this.renderMarkdown);
        return {
            id,
            title: meta.content || "",
            hpath: meta.hpath || "",
            updated: meta.updated || "",
            kind: "heading",
            level: headingLevel(meta.subtype) || 1,
            text,
            html,
            truncated,
        };
    }
}
