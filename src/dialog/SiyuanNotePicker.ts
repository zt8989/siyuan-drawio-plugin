import { Dialog } from "siyuan";
import { hasClosestByClassName } from "@/protyle/util/hasClosest";
import { upDownHint } from "@/util/upDownHint";
import type { SiyuanNoteSource, SiyuanNoteSummary } from "@/siyuan/SiyuanNotes";

/**
 * SiyuanNotePicker — 「嵌入 / 引用思源笔记」的搜索弹窗。
 *
 * 外部接缝：open(title, onPick)。onPick(null) 表示用户取消，调用方据此结束等待。
 * 内部：Dialog 构造、300ms 防抖、上下键浏览、列表渲染都藏在这里。
 */

export interface SiyuanNotePickerDeps {
    source: SiyuanNoteSource;
    isMobile: boolean;
    i18n: {
        emptyContent: string;
        searchPlaceholder: string;
    };
}

const SEARCH_DEBOUNCE_MS = 250;

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** 文档/标题的区分沿用思源的列表样式：标题前放 H1-H6 小标签。 */
function kindBadge(note: SiyuanNoteSummary): string {
    if (note.kind !== "heading" || !note.level) {
        return "";
    }
    return `<span class="b3-list-item__meta" style="margin-right:4px;opacity:.65;font-size:.85em">H${note.level}</span>`;
}

export function renderNoteList(notes: SiyuanNoteSummary[], emptyContent: string): string {
    if (notes.length === 0) {
        return `<li class="b3-list--empty">${escapeHtml(emptyContent)}</li>`;
    }
    return notes
        .map((note, index) => `<div data-id="${escapeHtml(note.id)}" class="b3-list-item${index === 0 ? " b3-list-item--focus" : ""}" style="display:block">
    <div class="b3-list-item__text">${kindBadge(note)}${escapeHtml(note.title || note.hpath)}</div>
    <div class="b3-list-item__text" style="font-size: 0.7em">${escapeHtml(note.hpath)}</div>
</div>`)
        .join("");
}

export class SiyuanNotePicker {
    constructor(private deps: SiyuanNotePickerDeps) {}

    open(title: string, onPick: (note: SiyuanNoteSummary | null) => void): Dialog {
        const deps = this.deps;
        let picked = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const dialog = new Dialog({
            title,
            content: `<div class="fn__flex" style="max-height: 50vh">
<div class="fn__flex-column" style="width:100%">
    <div class="fn__flex" style="margin: 0 8px 4px 8px">
        <input class="b3-text-field fn__flex-1" placeholder="${escapeHtml(deps.i18n.searchPlaceholder)}"/>
    </div>
    <div class="b3-list fn__flex-1 b3-list--background" style="position: relative"><img style="margin: 0 auto;display: block;width: 64px;height: 64px" src="/stage/loading-pure.svg"></div>
</div>
</div>`,
            width: deps.isMobile ? "92vw" : "560px",
            destroyCallback: () => {
                if (timer) clearTimeout(timer);
                if (!picked) onPick(null);
            },
        });

        const listElement = dialog.element.querySelector(".b3-list") as HTMLElement;
        const inputElement = dialog.element.querySelector("input") as HTMLInputElement;
        dialog.bindInput(inputElement);

        let searchToken = 0;
        let currentNotes: SiyuanNoteSummary[] = [];
        const render = async (keyword: string) => {
            const token = ++searchToken;
            try {
                const notes = await deps.source.search(keyword);
                if (token !== searchToken) return;
                currentNotes = notes;
                listElement.innerHTML = renderNoteList(notes, deps.i18n.emptyContent);
            } catch (error) {
                if (token !== searchToken) return;
                console.error("Error searching SiYuan notes:", error);
                listElement.innerHTML = `<li class="b3-list--empty">${escapeHtml(deps.i18n.emptyContent)}</li>`;
            }
        };

        const schedule = (keyword: string) => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => render(keyword), SEARCH_DEBOUNCE_MS);
        };

        inputElement.addEventListener("input", (event: InputEvent) => {
            if ((event as unknown as { isComposing: boolean }).isComposing) return;
            event.stopPropagation();
            schedule(inputElement.value);
        });
        inputElement.addEventListener("compositionend", (event: InputEvent) => {
            event.stopPropagation();
            schedule(inputElement.value);
        });

        const pick = (element: Element) => {
            const id = element.getAttribute("data-id") || "";
            const note = currentNotes.find((candidate) => candidate.id === id);
            if (!note) return;
            picked = true;
            onPick(note);
            dialog.destroy();
        };

        inputElement.addEventListener("keydown", (event: KeyboardEvent) => {
            if ((event as unknown as { isComposing: boolean }).isComposing) return;
            const isEmpty = listElement.querySelector(".b3-list--empty");
            if (event.key === "Enter" && !isEmpty) {
                const current = listElement.querySelector(".b3-list-item--focus");
                if (current) {
                    event.preventDefault();
                    event.stopPropagation();
                    pick(current);
                }
                return;
            }
            upDownHint(listElement, event);
        });

        listElement.addEventListener("click", (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            const item = hasClosestByClassName(target, "b3-list-item");
            if (item) {
                event.stopPropagation();
                pick(item as Element);
            }
        });

        render("");
        return dialog;
    }
}
