import { Dialog } from "siyuan";
import { hasClosestByAttribute, hasClosestByClassName } from "@/protyle/util/hasClosest";
import { upDownHint } from "@/util/upDownHint";
import type { AssetStore } from "@/asset/AssetStore";
import type { ShowDialogCallback } from "@/types";

export interface AssetPickerDeps {
    assetStore: AssetStore;
    isMobile: boolean;
    i18n: { selectDrawio: string; create: string; exitSearch: string; emptyContent: string };
}

/**
 * AssetPickerDialog — deep module owning the "Select drawio" dialog.
 * Small interface (open) hides Dialog construction, input wiring, upDownHint, and AssetStore.search.
 * Plugin composes it; tests can inject FakeAssetStore via deps.assetStore (interface is test surface).
 */
export class AssetPickerDialog {
    constructor(private deps: AssetPickerDeps) {}

    async renderAssetList(element: Element, k: string, position: IPosition): Promise<void> {
        const isMobile = this.deps.isMobile;
        try {
            const response = await this.deps.assetStore.search(k);
            let searchHTML = "";
            response.forEach((item: { path: string; hName: string }, index: number) => {
                searchHTML += `<div data-value="${item.path}" class="b3-list-item${index === 0 ? " b3-list-item--focus" : ""}" style="display:block">
                    <div class="b3-list-item__text">${item.hName}</div>
                    <div class="b3-list-item__text" style="font-size: 0.7em">${item.path}</div>
                </div>`;
            });
            const listElement = element.querySelector(".b3-list") as HTMLElement;
            const inputElement = element.querySelector("input") as HTMLInputElement;
            listElement.innerHTML = searchHTML || `<li class="b3-list--empty">${this.deps.i18n.emptyContent}</li>`;
            if (isMobile) {
                (window as unknown as { siyuan: { menus: { menu: { fullscreen: () => void } } } }).siyuan.menus.menu.fullscreen();
            } else {
                (window as unknown as { siyuan: { menus: { menu: { popup: (p: IPosition) => void } } } }).siyuan.menus.menu.popup(position);
            }
            if (!k) inputElement.select();
        } catch (error) {
            console.error("Error rendering asset list:", error);
            const listElement = element.querySelector(".b3-list") as HTMLElement;
            listElement.innerHTML = `<li class="b3-list--empty">${this.deps.i18n.emptyContent}</li>`;
        }
    }

    showOpenDialog(showCreate: boolean, callback?: ShowDialogCallback): Dialog {
        const deps = this.deps;
        const position: IPosition = { x: 500, y: 500 };
        const createDiv = showCreate
            ? `<div class="search__tip"><kbd>shift ↵</kbd> ${deps.i18n.create} <kbd>Esc</kbd> ${deps.i18n.exitSearch}</div>`
            : "";
        const dialog = new Dialog({
            title: `${deps.i18n.selectDrawio}`,
            content: `<div class="fn__flex" style="max-height: 50vh">
<div class="fn__flex-column" style="width:100%">
    <div class="fn__flex" style="margin: 0 8px 4px 8px">
        <input class="b3-text-field fn__flex-1"/>
        <span class="fn__space"></span>
        <span data-type="previous" class="block__icon block__icon--show"><svg><use xlink:href="#iconLeft"></use></svg></span>
        <span class="fn__space"></span>
        <span data-type="next" class="block__icon block__icon--show"><svg><use xlink:href="#iconRight"></use></svg></span>
    </div>
    <div class="b3-list fn__flex-1 b3-list--background" style="position: relative"><img style="margin: 0 auto;display: block;width: 64px;height: 64px" src="/stage/loading-pure.svg"></div>
    ${createDiv}
</div>
</div>`,
            width: deps.isMobile ? "92vw" : "560px",
        });
        dialog.bindInput(dialog.element.querySelector("input") as HTMLInputElement);

        const bind = (element: Element) => {
            element.setAttribute("style", "max-width: none;");
            const listElement = element.querySelector(".b3-list") as HTMLElement;
            const inputElement = element.querySelector("input") as HTMLInputElement;
            inputElement.addEventListener("keydown", (event: KeyboardEvent) => {
                if ((event as unknown as { isComposing: boolean }).isComposing) return;
                const isEmpty = element.querySelector(".b3-list--empty");
                if (!isEmpty) upDownHint(listElement, event);
                if (event.key === "Enter") {
                    if (!isEmpty || event.shiftKey) {
                        const currentElement = element.querySelector(".b3-list-item--focus") as HTMLElement | null;
                        if (callback) callback(currentElement?.getAttribute("data-value") || "", dialog, event.shiftKey, inputElement.value);
                    }
                    event.preventDefault();
                    event.stopPropagation();
                }
            });
            inputElement.addEventListener("input", (event: InputEvent) => {
                if ((event as unknown as { isComposing: boolean }).isComposing) return;
                event.stopPropagation();
                this.renderAssetList(element, inputElement.value, position);
            });
            inputElement.addEventListener("compositionend", (event: InputEvent) => {
                event.stopPropagation();
                this.renderAssetList(element, inputElement.value, position);
            });
            (element.lastElementChild as HTMLElement).addEventListener("click", (event: MouseEvent) => {
                const target = event.target as HTMLElement;
                const previousElement = hasClosestByAttribute(target, "data-type", "previous");
                if (previousElement) {
                    inputElement.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
                    event.stopPropagation();
                    return;
                }
                const nextElement = hasClosestByAttribute(target, "data-type", "next");
                if (nextElement) {
                    inputElement.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
                    event.stopPropagation();
                    return;
                }
                const listItemElement = hasClosestByClassName(target, "b3-list-item");
                if (listItemElement) {
                    event.stopPropagation();
                    const currentURL = listItemElement.getAttribute("data-value") || "";
                    if (callback) callback(currentURL, dialog, false, inputElement.value);
                }
            });
            this.renderAssetList(element, "", position);
        };
        bind(dialog.element);
        return dialog;
    }
}
