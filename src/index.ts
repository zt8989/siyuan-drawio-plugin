import {
    Plugin,
    showMessage,
    Dialog,
    openTab,
    IModel,
    Protyle,
    fetchPost,
    fetchSyncPost,
    IProtyle
} from "siyuan";
import "@/index.scss";


import { checkInvalidPathChar } from "./utils";
import { upload } from "./api";
import { blankDrawio, drawioPath } from "./constants";
import { saveContentAsFile } from "./file";
import { createLink, getTitleFromPath } from "./link";
const TAB_TYPE = "drawio_tab";

export default class DrawioPlugin extends Plugin {

    customTab: () => IModel;
    private isMobile: boolean;

    async onload() {
        window.drawioPlugin = this
        window.fetchPost = fetchPost
        window.fetchSyncPost = fetchSyncPost
        window.showMessage = showMessage
        this.eventBus.on("open-siyuan-url-plugin", this.onOpenTab.bind(this));
        this.eventBus.on("loaded-protyle-static", this.bindEvent.bind(this))

        // 图标的制作参见帮助文档
        this.addIcons(`<symbol id="icon-drawio-standard" viewBox="0 0 32 32">
<path d="M16.634 11.932l1.756-1.016 5.090 8.814-1.756 1.014-5.090-8.812zM8.526 19.714l5.072-8.784 1.76 1.018-5.070 8.784-1.762-1.018z"></path>
<path d="M12.276 4.296h7.448c0.9 0 1.348 0.45 1.348 1.348v5.786c0 0.9-0.45 1.348-1.348 1.348h-7.448c-0.9 0-1.348-0.45-1.348-1.348v-5.786c0-0.9 0.45-1.348 1.348-1.348zM19.714 19.224h7.45c0.898 0 1.346 0.448 1.346 1.346v5.788c0 0.898-0.448 1.346-1.346 1.346h-7.45c-0.898 0-1.348-0.448-1.348-1.346v-5.788c0-0.898 0.45-1.346 1.348-1.346zM4.838 19.224h7.448c0.9 0 1.348 0.448 1.348 1.346v5.788c0 0.898-0.45 1.346-1.348 1.346h-7.446c-0.9 0-1.348-0.448-1.348-1.346v-5.788c0-0.898 0.45-1.346 1.348-1.346z"></path>
</symbol><symbol id="icon-drawio-inverse" viewBox="0 0 32 32">
<path d="M31.454 31.454h-31.454v-31.454h31.454v31.454zM18.241 20.403v4.545c0 0.944 0.765 1.709 1.709 1.709h5.893c0.944 0 1.709-0.765 1.709-1.709v-4.545c0-0.944-0.765-1.709-1.709-1.709h-3.266l-3.476-5.92c0.753-0.179 1.313-0.855 1.313-1.662v-4.606c0-0.944-0.765-1.709-1.709-1.709h-5.893c-0.944 0-1.709 0.765-1.709 1.709v4.606c0 0.788 0.533 1.45 1.258 1.648l-3.484 5.934h-3.266c-0.944 0-1.709 0.765-1.709 1.709v4.545c0 0.944 0.765 1.709 1.709 1.709h5.893c0.944 0 1.709-0.765 1.709-1.709v-4.545c0-1.032-0.53-1.709-2.199-1.709l3.448-5.873h2.651l3.448 5.873c-1.681-0.116-2.366 0.988-2.322 1.709z"></path>
</symbol>`);

        this.addTopBar({
            icon: "icon-drawio-standard",
            title: this.i18n.openDrawio,
            position: "right",
            callback: () => {
                this.openCustomTab()
            }
        });

        this.customTab = this.addTab({
            type: TAB_TYPE,
            init() {
                const urlObj = new URLSearchParams(this.data || {})
                this.element.innerHTML = `<iframe class="siyuan-drawio-plugin__custom-tab" src="/plugins/siyuan-drawio-plugin/webapp/?${urlObj.toString()}"></iframe>`
            }
        });

        this.protyleSlash = [{
            filter: ["drawio"],
            id: "insertDrawio",
            html: `<div class="b3-list-item__first"><div class="color__square">A</div><span class="b3-list-item__text">${this.i18n.insertDrawio}</span></div>`,
            callback: this.showInsertDialog,
            }
        ];
    }

    onLayoutReady() {
    }

    async onunload() {
    }

    uninstall() {
    }

    private showInsertDialog(protyle: Protyle) {
        const range = protyle.protyle.toolbar.range;
        let nodeElement = protyle.hasClosestBlock(range.startContainer) as HTMLElement;
        if (!nodeElement) {
            return;
        }
        range.deleteContents()
        const dialog = new Dialog({
            title: `创建drawio`,
            content: `<div class="b3-dialog__content">
        <label class="fn__flex b3-label config__item">
                <div class="fn__flex-1">名称<div class="b3-label__text">名称为文件名，不可包含/,*,$等特殊字符</div>
                </div><span class="fn__space"></span><input id="draw-name"
                    class="b3-text-field fn__flex-center fn__size200" value="">
            </label>
            <div class="button-group" style="float: right; margin: 20px 0px 10px;"><button id="save-drawio"
                    class="b3-button">保存</button></div>
</div>`,
            width: this.isMobile ? "92vw" : "560px",
        });
        dialog.bindInput(dialog.element.querySelector("#draw-name"), console.log)
        const input: HTMLInputElement = dialog.element.querySelector("#draw-name")
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                this.onSave(dialog, input, protyle)
            }
        })
        dialog.element.querySelector("#save-drawio").addEventListener("click", () => {
            this.onSave(dialog, input, protyle)
        })
    }

    private onSave(dialog: Dialog, input: HTMLInputElement, protyle: Protyle){
        let value = input.value && input.value.trim()
        if(!value || checkInvalidPathChar(value)) {
            showMessage(`Drawio: 名称 ${value} 不合法`)
            return
        }
        const drawio = ".drawio";
        if(!value.endsWith(drawio)) {
            value += drawio
        }
        upload(drawioPath, [saveContentAsFile(value, blankDrawio)]).then((data) => {
            dialog.destroy()
            // const textNode = document.createTextNode(createLink(data["succMap"][value]));
            // range.insertNode(textNode);
            // range.setEnd(textNode, value.length);
            // range.collapse(false);
            // focusByRange(range);
            protyle.insert(createLink(data["succMap"][value]), true, true)
        }).catch(e => {
            console.error(e)
            showMessage(e, 6000, "error")
        })
    }

    onOpenTab(data: CustomEvent<{ url: string }>) {
        if (data.detail.url) {
            const urlObj = new URL(data.detail.url)
            this.openCustomTab(
                urlObj.searchParams.get("title"),
                urlObj.searchParams.get("icon"),
                urlObj.searchParams.get("data") ? JSON.parse(urlObj.searchParams.get("data")) : {},
            )
        }
    }

    openCustomTab(title?: string, icon?: string, data?: any,) {
        openTab({
            app: this.app,
            custom: {
                icon:  icon || "icon-drawio",
                title: title || "drawio",
                data: data,
                id: this.name + TAB_TYPE
            },
        });

    }

    openCustomTabByPath(path: string) {
        this.openCustomTab(getTitleFromPath(path), undefined, {
            url: path
        })
    }

    bindEvent(data: CustomEvent<{ protyle: IProtyle }>) {
        if(data.detail.protyle) {
            const element: HTMLElement = data.detail.protyle.wysiwyg.element
            const list = element.querySelectorAll('[data-type="a"]')
            list.forEach((item: HTMLElement) => {
                if(item.dataset.href && item.dataset.href.endsWith(".drawio")) {
                  item.addEventListener("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const target: HTMLElement = event.target as HTMLElement
                    this.openCustomTabByPath(target.dataset.href)
                  })
                }
            })
        }
    }
}
