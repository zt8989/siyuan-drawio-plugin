/**
 * markdownText — 把思源导出的 Markdown 压成适合画布卡片显示的纯文本。
 *
 * 画布上的卡片是固定尺寸的 draw.io 形状，放不下 Markdown 语法本身，
 * 只需要可读的正文：去掉围栏、标题井号、强调符号、链接目标、块属性等。
 * 纯函数，便于单元测试；截断长度由调用方决定。
 */

export interface PlainTextResult {
    text: string;
    truncated: boolean;
}

const DEFAULT_MAX_CHARS = 3000;

const HTML_ENTITIES: Record<string, string> = {
    "&nbsp;": " ",
    "&lt;": "<",
    "&gt;": ">",
    "&amp;": "&",
    "&quot;": "\"",
    "&#39;": "'",
};

function decodeEntities(text: string): string {
    return text.replace(/&(nbsp|lt|gt|amp|quot|#39);/g, (match) => HTML_ENTITIES[match] ?? match);
}

/** 去掉 SiYuan 行尾块属性，例如 `{: id="20240101..." updated="..." }` */
function stripBlockAttributes(text: string): string {
    return text.replace(/[ \t]*\{:[^}\n]*\}[ \t]*$/gm, "");
}

export function markdownToPlainText(markdown: string, maxChars: number = DEFAULT_MAX_CHARS): PlainTextResult {
    if (!markdown) {
        return { text: "", truncated: false };
    }

    let text = markdown.replace(/\r\n?/g, "\n");

    // YAML front matter
    text = text.replace(/^---\n[\s\S]*?\n---\n?/, "");

    // 围栏代码块只去围栏行，保留代码正文
    text = text.replace(/^[ \t]*(```|~~~).*$/gm, "");

    // 图片 / 链接只保留可读文本
    text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
    text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
    text = text.replace(/<https?:\/\/[^>]+>/g, "");

    // 行内代码与数学公式的定界符
    text = text.replace(/`([^`]*)`/g, "$1");
    text = text.replace(/\$\$?([^$]*)\$\$?/g, "$1");

    // 标题
    text = text.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "");
    text = text.replace(/[ \t]+#+[ \t]*$/gm, "");

    // 引用块 / 列表 / 分隔线
    text = text.replace(/^[ \t]{0,3}>[ \t]?/gm, "");
    text = text.replace(/^[ \t]{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, "");
    text = text.replace(/^([ \t]*)[-*+][ \t]+/gm, "$1");
    text = text.replace(/^([ \t]*)\d+[.)][ \t]+/gm, "$1");

    // 强调 / 高亮 / 删除线
    text = text.replace(/(\*\*\*|___)(.*?)\1/g, "$2");
    text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");
    text = text.replace(/(\*|_)(.*?)\1/g, "$2");
    text = text.replace(/~~(.*?)~~/g, "$1");
    text = text.replace(/==(.*?)==/g, "$1");

    // HTML 片段与块属性
    text = text.replace(/<[^>]*>/g, "");
    text = stripBlockAttributes(text);
    text = decodeEntities(text);

    // 统一空白：去行尾空格、压缩空行
    text = text
        .split("\n")
        .map((line) => line.replace(/[ \t]+$/g, ""))
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    if (text.length <= maxChars) {
        return { text, truncated: false };
    }

    // 截断时尽量停在空白处，避免切断半个词
    const clipped = text.slice(0, maxChars);
    const lastBreak = Math.max(clipped.lastIndexOf("\n"), clipped.lastIndexOf(" "));
    const body = (lastBreak > maxChars * 0.6 ? clipped.slice(0, lastBreak) : clipped).replace(/[\s,;:，；：]+$/g, "");
    return { text: body + "…", truncated: true };
}
