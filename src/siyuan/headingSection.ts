/**
 * headingSection — 从思源文档的块树里取出「某个标题下的内容」。
 *
 * 思源没有现成的“按标题导出”接口：`exportMdContent` 给整篇，`getBlockKramdown`
 * 只给标题那一行。但 blocks 表带 parent_id / sort，可以在本地还原文档顺序：
 * 标题后面跟着它的子树，直到下一个同级或更高级标题为止。
 *
 * 纯函数（不做 HTTP/DOM），标题嵌入的边界规则集中在这里。
 */

export interface BlockRow {
    id: string;
    type: string;
    subtype: string;
    parentId: string;
    sort: number;
    content: string;
}

/** `h1`..`h6` → 1..6；非标题返回 0。 */
export function headingLevel(subtype: string | undefined): number {
    const match = /^h([1-6])$/.exec(subtype || "");
    return match ? Number(match[1]) : 0;
}

/** 把同一文档的块按 parent_id / sort 还原成阅读顺序（深度优先）。 */
export function documentOrder(rows: BlockRow[]): BlockRow[] {
    const children = new Map<string, BlockRow[]>();
    const ids = new Set(rows.map((row) => row.id));
    for (const row of rows) {
        const parent = row.parentId || "";
        const siblings = children.get(parent);
        if (siblings) {
            siblings.push(row);
        } else {
            children.set(parent, [row]);
        }
    }
    for (const siblings of children.values()) {
        siblings.sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
    }

    const ordered: BlockRow[] = [];
    const visited = new Set<string>();
    const visit = (parent: string) => {
        for (const row of children.get(parent) || []) {
            if (visited.has(row.id)) continue;
            visited.add(row.id);
            ordered.push(row);
            visit(row.id);
        }
    };
    // 父节点不在结果集里的即为根（文档块本身、或被裁剪过的片段）
    for (const parent of children.keys()) {
        if (!ids.has(parent)) visit(parent);
    }
    return ordered;
}

/**
 * 返回标题正文所在的块（不含标题本身），直到下一个同级/更高级标题。
 * 更深的子标题及其内容会保留在结果里。
 */
export function extractHeadingSection(rows: BlockRow[], headingId: string): BlockRow[] {
    const ordered = documentOrder(rows);
    const index = ordered.findIndex((row) => row.id === headingId);
    if (index < 0) {
        return [];
    }
    const level = headingLevel(ordered[index].subtype);
    const section: BlockRow[] = [];
    for (let i = index + 1; i < ordered.length; i++) {
        const row = ordered[i];
        if (row.type === "h" && level > 0 && headingLevel(row.subtype) <= level) {
            break;
        }
        section.push(row);
    }
    return section;
}

/** 会进入卡片正文的块类型：跳过列表/引用的容器块，避免内容重复。 */
export const TEXT_BLOCK_TYPES = new Set(["h", "p", "i", "c", "m", "tb", "b"]);

/**
 * 章节块 → Markdown（保留标题层级、列表项、代码块），交给 Lute 渲染成卡片 HTML。
 * 列表层级在 blocks 表里以 parent_id 表达，这里按单层展开（卡片宽度有限）。
 */
export function sectionMarkdown(rows: BlockRow[]): string {
    const parts: string[] = [];
    for (const row of rows) {
        if (!TEXT_BLOCK_TYPES.has(row.type)) continue;
        const content = (row.content || "").trim();
        if (content === "") continue;
        if (row.type === "h") {
            parts.push("#".repeat(headingLevel(row.subtype) || 1) + " " + content);
        } else if (row.type === "i") {
            parts.push("- " + content);
        } else if (row.type === "c") {
            parts.push("```\n" + content + "\n```");
        } else {
            parts.push(content);
        }
    }
    return parts.join("\n\n");
}

/** 章节块 → 纯文本（块之间空一行）。 */
export function sectionText(rows: BlockRow[]): string {
    return rows
        .filter((row) => TEXT_BLOCK_TYPES.has(row.type) && (row.content || "").trim() !== "")
        .map((row) => row.content.trim())
        .join("\n\n");
}
