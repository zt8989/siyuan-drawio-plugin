import {
    Plugin,
    showMessage,
    Dialog,
    openTab,
    Custom,
    Protyle,
    fetchPost,
    IProtyle,
    IWebSocketData,
    getFrontend,
} from "siyuan";
import { logger } from "./logger";
import {
    hasClosestByAttribute,
    hasClosestByClassName
} from "@/protyle/util/hasClosest";
import { upDownHint } from "@/util/upDownHint";

import "@/index.scss";


import { getIframeFromEventSource } from "./utils";
import { saveDrawIoXml, searchDrawioFiles } from "./api";
import { CALLBAK_TYPE, COPY_LINK, DOCK_TYPE, DRAWIO_CONFIG, NEW_TYPE, OPEN_TAB_BY_PATH, OPEN_TYPE, TAB_TYPE, UPDATE_TITLE, ICON_STANDARD, DRAWIO_EXTENSION, drawioAssetsPath, STORAGE_PATH } from "./constants";
import { createLinkFromTitle, createUrlFromTitle, getTitleFromPath } from "./link";
import { ShowDialogCallback } from "./types";
import { genDrawioHTMLByUrl } from "./asset/renderAssets";
import qs from "query-string";
import Dock from "./components/dock.svelte";

export default class DrawioPlugin extends Plugin {
    customTab: () => Custom;
    private isMobile: boolean;
    private configLoaded = false

    async onload() {
        window.drawioPlugin = this
        
        this.eventBus.on("open-siyuan-url-plugin", this.onOpenTab.bind(this));
        this.eventBus.on("loaded-protyle-static", this.bindStaticEvent.bind(this))
        this.eventBus.on("ws-main", this.bindWsEvent.bind(this))

        window.addEventListener("message", this.onMessage)
        window.addEventListener('storage', this.onStorage)
        
        const frontEnd = getFrontend();
        this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";

        // 图标的制作参见帮助文档
        this.addIcons(`<symbol id="${ICON_STANDARD}" viewBox="0 0 32 32">
<path d="M16.634 11.932l1.756-1.016 5.090 8.814-1.756 1.014-5.090-8.812zM8.526 19.714l5.072-8.784 1.76 1.018-5.070 8.784-1.762-1.018z"></path>
<path d="M12.276 4.296h7.448c0.9 0 1.348 0.45 1.348 1.348v5.786c0 0.9-0.45 1.348-1.348 1.348h-7.448c-0.9 0-1.348-0.45-1.348-1.348v-5.786c0-0.9 0.45-1.348 1.348-1.348zM19.714 19.224h7.45c0.898 0 1.346 0.448 1.346 1.346v5.788c0 0.898-0.448 1.346-1.346 1.346h-7.45c-0.898 0-1.348-0.448-1.348-1.346v-5.788c0-0.898 0.45-1.346 1.348-1.346zM4.838 19.224h7.448c0.9 0 1.348 0.448 1.348 1.346v5.788c0 0.898-0.45 1.346-1.348 1.346h-7.446c-0.9 0-1.348-0.448-1.348-1.346v-5.788c0-0.898 0.45-1.346 1.348-1.346z"></path>
</symbol><symbol id="icon-drawio-inverse" viewBox="0 0 32 32">
<path d="M31.454 31.454h-31.454v-31.454h31.454v31.454zM18.241 20.403v4.545c0 0.944 0.765 1.709 1.709 1.709h5.893c0.944 0 1.709-0.765 1.709-1.709v-4.545c0-0.944-0.765-1.709-1.709-1.709h-3.266l-3.476-5.92c0.753-0.179 1.313-0.855 1.313-1.662v-4.606c0-0.944-0.765-1.709-1.709-1.709h-5.893c-0.944 0-1.709 0.765-1.709 1.709v4.606c0 0.788 0.533 1.45 1.258 1.648l-3.484 5.934h-3.266c-0.944 0-1.709 0.765-1.709 1.709v4.545c0 0.944 0.765 1.709 1.709 1.709h5.893c0.944 0 1.709-0.765 1.709-1.709v-4.545c0-1.032-0.53-1.709-2.199-1.709l3.448-5.873h2.651l3.448 5.873c-1.681-0.116-2.366 0.988-2.322 1.709z"></path>
</symbol>`);

        this.addTopBar({
            icon: ICON_STANDARD,
            title: this.i18n.openDrawio,
            position: "right",
            callback: () => {
                this.openNewCustomTab()
            }
        });

        const that = this
        this.customTab = this.addTab({
            type: TAB_TYPE,
            init() {
                const checkConfig = () => {
                    if (that.configLoaded) {
                        const urlObj = qs.stringify(this.data || {})
                        this.element.innerHTML = `<iframe class="siyuan-drawio-plugin__custom-tab" src="/plugins/siyuan-drawio-plugin/webapp/?${urlObj.toString()}"></iframe>`
                    } else {
                        setTimeout(checkConfig, 100);
                    }
                };
                checkConfig();
            }
        });

        this.protyleSlash = [{
            filter: ["插入/选择drawio", "insert/select drawio", "crdrawio"],
            id: "insertDrawio",
            html: `<div class="b3-list-item__first"><svg class="b3-list-item__graphic"><use xlink:href="#icon-drawio-standard"></use></svg><span class="b3-list-item__text">${this.i18n.insertDrawio}</span></div>`,
            callback: this.showInsertDialog,
            }
        ];

        this.addCommand({
            langKey: "openDrawio",
            hotkey: "⇧⌘d",
            globalCallback: () => {
                this.openNewCustomTab()
            },
        });

        this.addDock({
            config: {
                position: "LeftBottom",
                size: { width: 200, height: 0 },
                icon: ICON_STANDARD,
                title: that.i18n.title,
                hotkey: "⌥⌘W",
            },
            data: {
            },
            type: DOCK_TYPE,
            init: (dock) => {
                new Dock({
                    target: dock.element,
                    props: {
                        plugin: this,
                    }
                });
            },
            destroy() {
                console.log("destroy dock:", DOCK_TYPE);
            }
        });

        this.restoreData()
    }

    async restoreData(){
        const remoteDataObj = await this.loadData(DRAWIO_CONFIG)
        const remoteData = typeof remoteDataObj == 'string' ? remoteDataObj : JSON.stringify(remoteDataObj) 
        const localData = localStorage.getItem(DRAWIO_CONFIG)
        logger.debug("restoreData, remoteData: %s, localData: %s", remoteData, localData)
        if(remoteData != localData) {
            logger.debug("localStorage.setItem(DRAWIO_CONFIG)")
            localStorage.setItem(DRAWIO_CONFIG, remoteData)
        }
        this.configLoaded = true
    }

    onLayoutReady() {
    }

    async onunload() {
        window.removeEventListener("message", this.onMessage)
        window.addEventListener('storage', this.onStorage)
    }

    uninstall() {
    }

    onStorage = (ev: { key: string, newValue: string, oldValue: string }) => {
        const { key, newValue, oldValue } = ev
        if (key == DRAWIO_CONFIG && newValue != oldValue) {
            logger.debug("this.saveData", key, newValue)
            this.saveData(key, newValue)
        }
    }

    onMessage = (ev: MessageEvent<{ type: string, payload: any, callbackId?: string }>) => {
        // Only process messages from same origin
        if (ev.origin !== window.location.origin) {
            logger.debug('Rejected message from invalid origin:', ev.origin);
            return;
        }
        
        switch(ev.data.type) {
            case NEW_TYPE:
                this.openNewCustomTab()
                break
            case OPEN_TYPE:
                this.showOpenDialog(false, (url, dialog) => {
                    dialog.destroy()
                    if(ev.data.callbackId) {
                        const iframeElement = getIframeFromEventSource(ev.source as Window)
                        ev.source.postMessage({
                            type: CALLBAK_TYPE,
                            callbackId: ev.data.callbackId,
                            payload: [url, getTitleFromPath(url)]
                        })
                        this.updateTabTitle(iframeElement, getTitleFromPath(url))
                    }
                })
                break
            case UPDATE_TITLE:
                const iframeElement = getIframeFromEventSource(ev.source as Window)
                this.updateTabTitle(iframeElement, ev.data.payload)
                break
            case COPY_LINK:
                this.copyLink(ev.data.payload)
                break
            case OPEN_TAB_BY_PATH:
                this.openCustomTabByPath(ev.data.payload)
                break
            // case SET_ITEM:
            //     this.setStorageItem(ev.data.payload)
            //     break
        } 
        logger.debug(ev)
    }

    setStorageItem({ key, value }: any) {
        if (key == DRAWIO_CONFIG) {
            this.saveData(key, typeof value == 'string' ? value : JSON.stringify(value))
        }
    }

    public copyLink(title: string){
        var link = createLinkFromTitle(title)
        navigator.clipboard.writeText(link).then(() => {
            showMessage(this.i18n.linkCopiedToClipboard)
        }).catch(err => {
            logger.debug('Failed to copy link: ', err);
            showMessage(err, 6000, "error")
        });
    }

    public copyRawLink(link: string){
        navigator.clipboard.writeText(link).then(() => {
            showMessage(this.i18n.linkCopiedToClipboard)
        }).catch(err => {
            logger.debug('Failed to copy link: ', err);
            showMessage(err, 6000, "error")
        });
    }

    public updateTabTitle(frameElement: HTMLIFrameElement, title: string) {
        const dataId = frameElement?.parentElement?.getAttribute('data-id');
        if (dataId) {
            const tabs = this.getOpenedTab()[TAB_TYPE]
            const tab = tabs.map(tab => tab.tab).filter(tab => tab.id === dataId)
            if(tab.length > 0) {
                const model = tab[0].model as any
                model.data = { url: createUrlFromTitle(title) }
                tab[0].addModel(model)
                tab[0].updateTitle(title)
            }
        }
    }

    public showOpenDialog(showCreate: boolean, callback?: ShowDialogCallback) {
        const that = this
        const position: IPosition = {
            x: 500,
            y: 500
        }
        const exts = [DRAWIO_EXTENSION]
        const createDiv = showCreate ? `<div class="search__tip">
            <kbd>shift ↵</kbd> ${this.i18n.create}
            <kbd>Esc</kbd> ${this.i18n.exitSearch}
        </div>` : ''
        const dialog = new Dialog({
            title: `${this.i18n.selectDrawio}`,
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
        width: this.isMobile ? "92vw" : "560px",
        });
        dialog.bindInput(dialog.element.querySelector("input"))

        function bind(element) {
            element.style.maxWidth = "none";
            const listElement = element.querySelector(".b3-list");
            const inputElement = element.querySelector("input");
            inputElement.addEventListener("keydown", (event: KeyboardEvent) => {
                if (event.isComposing) {
                    return;
                }
                const isEmpty = element.querySelector(".b3-list--empty");
                if (!isEmpty) {
                    upDownHint(listElement, event);
                }
    
                if (event.key === "Enter") {
                    if (!isEmpty || event.shiftKey) {
                        const currentElement = element.querySelector(".b3-list-item--focus");
                        if (callback) {
                            callback(currentElement?.getAttribute("data-value"), dialog, event.shiftKey,inputElement.value);
                        }
                    }
                    // 空行处插入 mp3 会多一个空的 mp3 块
                    event.preventDefault();
                    event.stopPropagation();
                }
            });
            inputElement.addEventListener("input", (event: InputEvent) => {
                if (event.isComposing) {
                    return;
                }
                event.stopPropagation();
                that.renderAssetList(element, inputElement.value, position, exts);
            });
            inputElement.addEventListener("compositionend", (event: InputEvent) => {
                event.stopPropagation();
                that.renderAssetList(element, inputElement.value, position, exts);
            });
            element.lastElementChild.addEventListener("click", (event) => {
                const target = event.target as HTMLElement;
                const previousElement = hasClosestByAttribute(target, "data-type", "previous");
                if (previousElement) {
                    inputElement.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowUp"}));
                    event.stopPropagation();
                    return;
                }
                const nextElement = hasClosestByAttribute(target, "data-type", "next");
                if (nextElement) {
                    inputElement.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown"}));
                    event.stopPropagation();
                    return;
                }
                const listItemElement = hasClosestByClassName(target, "b3-list-item");
                if (listItemElement) {
                    event.stopPropagation();
                    const currentURL = listItemElement.getAttribute("data-value");
                    if (callback) {
                        callback(currentURL, dialog, false, inputElement.value);
                    }
                }
            });
            that.renderAssetList(element, "", position, exts);
        }

        bind(dialog.element)
    }



    showInsertDialog = (protyle: Protyle) => {
        const range = protyle.protyle.toolbar.range;
        let nodeElement = protyle.hasClosestBlock(range.startContainer) as HTMLElement;
        if (!nodeElement) {
            return;
        }
        range.deleteContents()
        this.showOpenDialog(true, (url, dialog, isNew, value) => {
            if(isNew){
                this.onSave(dialog, value, protyle)
            } else {
                dialog.destroy()
                protyle.insert(genDrawioHTMLByUrl(url), true, true)
            }
            
        })
    }

    private onSave(dialog: Dialog, value: string, protyle: Protyle){
        // if(!value || checkInvalidPathChar(value)) {
        //     showMessage(`Drawio: 名称 ${value} 不合法`)
        //     return
        // }
        // const drawio = ".drawio";
        // if(!value.endsWith(drawio)) {
        //     value += drawio
        // }
        saveDrawIoXml(value).then((data) => {
            dialog.destroy()
            // const textNode = document.createTextNode(createLink(data["succMap"][value]));
            // range.insertNode(textNode);
            // range.setEnd(textNode, value.length);
            // range.collapse(false);
            // focusByRange(range);
            const url = data["succMap"][value] || data["succMap"][value + DRAWIO_EXTENSION]
            protyle.insert(genDrawioHTMLByUrl(url), true, true)
            this.openCustomTab(getTitleFromPath(url), undefined, {
                url
            })
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

    openNewCustomTab() {
        this.openCustomTab(undefined, undefined, { nounce: (new Date).getTime() })
    }

    openCustomTab(title?: string, icon?: string, data?: any,) {
        return openTab({   
            app: this.app,
            custom: {
                icon:  icon || ICON_STANDARD,
                title: title || "drawio",
                data: data,
                id: this.name + TAB_TYPE,
            },
        });

    }

    openCustomTabByPath(path: string) {
        this.openCustomTab(getTitleFromPath(path), undefined, {
            url: path
        })
    }

    bindStaticEvent(data: CustomEvent<{ protyle: IProtyle }>) {
        if(data.detail.protyle) {
            const element: HTMLElement = data.detail.protyle.wysiwyg.element
            this.bindClickEvent(element)
        }
    }

    bindClickEvent(element: HTMLElement) {
        const list = element.querySelectorAll('[data-type="a"]')
        list.forEach((item: HTMLElement) => {
            if(item.dataset.href && item.dataset.href.endsWith(DRAWIO_EXTENSION)) {
              item.addEventListener("click", this.onClickEvent)
            }
        })
    }

    onClickEvent = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const target: HTMLElement = event.target as HTMLElement
        this.openCustomTabByPath(target.dataset.href)
    }

    bindDynamicEvent(data: CustomEvent<{ protyle: IProtyle }>) {
        logger.debug("bindDynamicEvent", data)
        if(data.detail.protyle) {
            // const element: HTMLElement = data.detail.protyle.wysiwyg.element
            // const list = element.querySelectorAll('[data-type="a"]')
            // list.forEach((item: HTMLElement) => {
            //     if(item.dataset.href && item.dataset.href.endsWith(".drawio")) {
            //       item.addEventListener("click", (event) => {
            //         event.preventDefault();
            //         event.stopPropagation();
            //         const target: HTMLElement = event.target as HTMLElement
            //         this.openCustomTabByPath(target.dataset.href)
            //       })
            //     }
            // })
        }
    }

    bindWsEvent(data: CustomEvent<IWebSocketData>) {
        if("savedoc" === data.detail.cmd){
            const el = data.target as HTMLElement
            this.bindClickEvent(el.parentNode as HTMLElement)
        }
    }


    async renderAssetList(element: Element, k: string, position: IPosition, exts: string[] = []) {
        const frontEnd = getFrontend();
        const isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";
    
        try {
            // If we're specifically looking for drawio files, use our custom search
            if (exts.includes(DRAWIO_EXTENSION)) {
                // Search in both new and old locations
                const searchDirs = [STORAGE_PATH, drawioAssetsPath];
                const response = await searchDrawioFiles(k, searchDirs);
    
                let searchHTML = "";
                response.forEach((item: { path: string, hName: string }, index: number) => {
                    searchHTML += `<div data-value="${item.path}" class="b3-list-item${index === 0 ? " b3-list-item--focus" : ""}" style="display:block">
                        <div class="b3-list-item__text">
                            ${item.hName}</div>
                        <div class="b3-list-item__text" style="font-size: 0.7em">
                            ${item.path}</div>
                    </div>`;
                });
    
                const listElement = element.querySelector(".b3-list");
                const inputElement = element.querySelector("input");
                listElement.innerHTML = searchHTML || `<li class="b3-list--empty">${this.i18n.emptyContent}</li>`;
                if (isMobile) {
                    window.siyuan.menus.menu.fullscreen();
                } else {
                    window.siyuan.menus.menu.popup(position);
                }
                if (!k) {
                    inputElement.select();
                }
            } else {
                // For other file types, use the standard API
                fetchPost("/api/search/searchAsset", {
                    k,
                    exts
                }, (response) => {
                    let searchHTML = "";
                    response.data.forEach((item: { path: string, hName: string }, index: number) => {
                        searchHTML += `<div data-value="${item.path}" class="b3-list-item${index === 0 ? " b3-list-item--focus" : ""}" style="display:block">
                        <div class="b3-list-item__text">
                            ${item.hName}</div>
                        <div class="b3-list-item__text" style="font-size: 0.7em">
                            ${item.path}</div>
                    </div>`;
                    });
    
                    const listElement = element.querySelector(".b3-list");
                    const inputElement = element.querySelector("input");
                    listElement.innerHTML = searchHTML || `<li class="b3-list--empty">${this.i18n.emptyContent}</li>`;
                    if (isMobile) {
                        window.siyuan.menus.menu.fullscreen();
                    } else {
                        window.siyuan.menus.menu.popup(position);
                    }
                    if (!k) {
                        inputElement.select();
                    }
                });
            }
        } catch (error) {
            console.error("Error rendering asset list:", error);
            const listElement = element.querySelector(".b3-list");
            listElement.innerHTML = `<li class="b3-list--empty">${this.i18n.emptyContent}</li>`;
        }
    };
}
