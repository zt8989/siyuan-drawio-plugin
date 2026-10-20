/**
 * markdownHtml — 把 Markdown 渲染成 draw.io 卡片可用的 HTML 片段。
 *
 * 渲染器由宿主注入（SiYuan 的 Lute，与笔记内的排版一致）；这里只负责：
 * - 按上限截断源 Markdown
 * - 去掉在画布里没有意义/会坏掉的内容：图片（相对路径取不到）、
 *   链接（避免点卡片文字变成打开网页）、SiYuan 专用 data-* 属性
 *
 * 纯函数，便于单元测试。
 */

export type MarkdownRenderer = (markdown: string) => string;

export const CARD_HTML_MAX_CHARS = 4000;

/** 去掉导出 Markdown 开头的 YAML front matter（title/date/lastmod 等）。 */
export function stripFrontMatter(markdown: string): string {
    return (markdown || "").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

/** 去掉与卡片标题重复的首个一级标题，避免正文里再出现一次大标题。 */
export function stripLeadingTitleHeading(markdown: string, title: string): string {
    const expected = (title || "").trim();
    if (expected === "") {
        return markdown;
    }
    const lines = (markdown || "").split("\n");
    let index = 0;
    while (index < lines.length && lines[index].trim() === "") index++;
    const first = (lines[index] || "").trim();
    if (/^#\s+/.test(first) && first.replace(/^#\s+/, "").trim() === expected) {
        lines.splice(index, 1);
        return lines.join("\n");
    }
    return markdown;
}

/** 卡片 HTML 只保留排版标签，丢掉图片/链接/SiYuan 私有属性。 */
export function sanitizeCardHtml(html: string): string {
    let result = html || "";
    result = result.replace(/<script\b[\s\S]*?<\/script>/gi, "");
    result = result.replace(/<img\b[^>]*>/gi, "");
    // 链接只保留文字：画布里的 <a> 会被 draw.io 当成外链点击
    result = result.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1");
    result = result.replace(/\s(data-[\w-]+|contenteditable|spellcheck)="[^"]*"/gi, "");
    return result.trim();
}

/** 截断 HTML 时尽量停在标签边界，避免产生半截标签。 */
export function truncateHtml(html: string, maxChars: number = CARD_HTML_MAX_CHARS): string {
    if (html.length <= maxChars) {
        return html;
    }
    const clipped = html.slice(0, maxChars);
    const lastClose = clipped.lastIndexOf(">");
    return (lastClose > maxChars * 0.6 ? clipped.slice(0, lastClose + 1) : clipped) + "…";
}

export interface CardHtmlResult {
    html: string;
    truncated: boolean;
}

export function markdownToCardHtml(
    markdown: string,
    render: MarkdownRenderer,
    maxChars: number = CARD_HTML_MAX_CHARS,
): CardHtmlResult {
    const body = stripFrontMatter(markdown || "");
    if (body.trim() === "") {
        return { html: "", truncated: false };
    }
    const source = body.length > maxChars ? body.slice(0, maxChars) : body;
    let rendered = "";
    try {
        rendered = render(source) || "";
    } catch (error) {
        rendered = "";
    }
    return {
        html: truncateHtml(sanitizeCardHtml(rendered), maxChars),
        truncated: markdown.length > maxChars,
    };
}
