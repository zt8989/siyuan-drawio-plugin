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
import { CALLBAK_TYPE, COPY_LINK, DOCK_TYPE, DRAWIO_CONFIG, NEW_TYPE, OPEN_TAB_BY_PATH, OPEN_TYPE, TAB_TYPE, UPDATE_TITLE, ICON_STANDARD, DRAWIO_EXTENSION, drawioAssetsPath, STORAGE_PATH, ICON_DRAWIO_HTML, ICON_DRAWIO_PNG, ICON_DRAWIO_SVG } from "./constants";
import { createLinkFromTitle, createUrlFromTitle, getTitleFromPath } from "./link";
import { ShowDialogCallback } from "./types";
import { genDrawioHTMLByUrl } from "./asset/renderAssets";
import qs from "query-string";
import Dock from "./components/dock.svelte";

const renderAssetList = async (element: Element, k: string, position: IPosition, exts: string[] = []) => {
    const frontEnd = getFrontend();
    const isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";

    try {
        // If we're specifically looking for drawio files, use our custom search
        if (exts.includes(DRAWIO_EXTENSION)) {
            const response = await searchDrawioFiles(k);

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
            listElement.innerHTML = searchHTML || `<li class="b3-list--empty">${window.siyuan.languages.emptyContent}</li>`;
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
                listElement.innerHTML = searchHTML || `<li class="b3-list--empty">${window.siyuan.languages.emptyContent}</li>`;
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
        listElement.innerHTML = `<li class="b3-list--empty">${window.siyuan.languages.emptyContent}</li>`;
    }
};

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
        this.addIcons([`<symbol id="${ICON_STANDARD}" viewBox="0 0 32 32">
<path d="M16.634 11.932l1.756-1.016 5.090 8.814-1.756 1.014-5.090-8.812zM8.526 19.714l5.072-8.784 1.76 1.018-5.070 8.784-1.762-1.018z"></path>
<path d="M12.276 4.296h7.448c0.9 0 1.348 0.45 1.348 1.348v5.786c0 0.9-0.45 1.348-1.348 1.348h-7.448c-0.9 0-1.348-0.45-1.348-1.348v-5.786c0-0.9 0.45-1.348 1.348-1.348zM19.714 19.224h7.45c0.898 0 1.346 0.448 1.346 1.346v5.788c0 0.898-0.448 1.346-1.346 1.346h-7.45c-0.898 0-1.348-0.448-1.348-1.346v-5.788c0-0.898 0.45-1.346 1.348-1.346zM4.838 19.224h7.448c0.9 0 1.348 0.448 1.348 1.346v5.788c0 0.898-0.45 1.346-1.348 1.346h-7.446c-0.9 0-1.348-0.448-1.348-1.346v-5.788c0-0.898 0.45-1.346 1.348-1.346z"></path>
</symbol><symbol id="icon-drawio-inverse" viewBox="0 0 32 32">
<path d="M31.454 31.454h-31.454v-31.454h31.454v31.454zM18.241 20.403v4.545c0 0.944 0.765 1.709 1.709 1.709h5.893c0.944 0 1.709-0.765 1.709-1.709v-4.545c0-0.944-0.765-1.709-1.709-1.709h-3.266l-3.476-5.92c0.753-0.179 1.313-0.855 1.313-1.662v-4.606c0-0.944-0.765-1.709-1.709-1.709h-5.893c-0.944 0-1.709 0.765-1.709 1.709v4.606c0 0.788 0.533 1.45 1.258 1.648l-3.484 5.934h-3.266c-0.944 0-1.709 0.765-1.709 1.709v4.545c0 0.944 0.765 1.709 1.709 1.709h5.893c0.944 0 1.709-0.765 1.709-1.709v-4.545c0-1.032-0.53-1.709-2.199-1.709l3.448-5.873h2.651l3.448 5.873c-1.681-0.116-2.366 0.988-2.322 1.709z"></path>
</symbol>`, `<symbol class="aicon" viewBox="0 0 1024 1024" id="${ICON_DRAWIO_PNG}" xmlns="http://www.w3.org/2000/svg">
<path d="M1005.327 258.41 785.83 24.334A70.174 70.174 0 0 0 734.81 2.23H141.312a28.01 28.01 0 0 0-28.07 27.889V404.36a9.577 9.577 0 0 0 9.638 9.577h37.346a9.638 9.638 0 0 0 9.577-9.638V66.38a6.867 6.867 0 0 1 6.927-6.927h525.553a5.903 5.903 0 0 1 5.903 5.843v241.062c0 15.42 12.59 27.889 28.01 27.949h224.497a5.903 5.903 0 0 1 5.903 5.843v619.64a6.867 6.867 0 0 1-6.988 6.927H122.94a9.638 9.638 0 0 0-9.637 9.638v36.502a9.517 9.517 0 0 0 9.637 9.638h872.99a28.01 28.01 0 0 0 28.01-27.95v-688.79c0-17.588-6.626-34.514-18.673-47.405"/>
<path d="M207.21 643.915h-35.54l-7.469 59.754h37.768a27.889 27.889 0 0 0 19.095-4.88 34.756 34.756 0 0 0 7.228-20.178l1.204-11.264v-5.903a16.083 16.083 0 0 0-5.24-13.553 28.672 28.672 0 0 0-17.167-4.036"/>
<path d="m678.972 655.12-.843 5.6h-45.417a14.456 14.456 0 0 0-6.265-13.25 39.996 39.996 0 0 0-20.36-3.856h-12.649a34.093 34.093 0 0 0-26.262 7.59 68.91 68.91 0 0 0-9.397 32.105l-3.915 31.684c-.422 4.096-.904 7.65-1.145 10.601a96.648 96.648 0 0 0-.301 7.83 20.3 20.3 0 0 0 5.662 16.746 37.707 37.707 0 0 0 21.685 4.458h13.794a44.092 44.092 0 0 0 23.07-4.638 21.685 21.685 0 0 0 8.493-16.746l1.265-9.939h-28.431l3.915-30.66h72.102l-3.976 29.877a87.16 87.16 0 0 1-22.287 54.574 73.547 73.547 0 0 1-52.826 17.167H560.97c-35.539 0-53.368-19.878-53.428-59.814a174.682 174.682 0 0 1 1.265-18.312l3.614-28.792c1.265-23.01 9.698-45.056 24.094-63.127a71.295 71.295 0 0 1 54.934-20.178h27.227c15.66-.784 31.02 3.734 43.67 12.89 10.421 7.65 16.445 19.878 16.264 32.768.24 1.807.361 3.614.361 5.421zM465.498 792.093h-70.053l-43.31-140.83h-1.566l-17.468 140.83h-42.526l22.89-185.826h70.354l42.526 139.204h2.29L445.8 606.328h42.527l-22.89 185.766zm-189.32-130.77c-.481 2.71-.903 4.637-1.023 5.842l-1.506 12.77a69.33 69.33 0 0 1-21.323 47.164 82.643 82.643 0 0 1-52.405 13.854h-39.996l-6.325 51.2h-44.936l22.89-185.765h84.932c15.842-1.205 31.744 2.41 45.477 10.48 10.3 8.915 15.661 22.288 14.216 35.78v8.674zm500.677 228.893V489.532A13.734 13.734 0 0 0 763.06 475.8H13.734A13.734 13.734 0 0 0 0 489.472v400.745c0 7.59 6.144 13.734 13.794 13.734H762.94a13.854 13.854 0 0 0 13.915-13.673z"/>
</symbol>`, `<symbol class="aicon" viewBox="0 0 1024 1024" id="${ICON_DRAWIO_SVG}" xmlns="http://www.w3.org/2000/svg">
<path d="M192 384h640a42.667 42.667 0 0 1 42.667 42.667v362.666A42.667 42.667 0 0 1 832 832H192v106.667A21.333 21.333 0 0 0 213.333 960h725.334A21.333 21.333 0 0 0 960 938.667V308.82l-10.09-10.154H823.38a98.048 98.048 0 0 1-98.048-98.048V72.66L716.715 64H213.333A21.333 21.333 0 0 0 192 85.333V384zm-64 448H42.667A42.667 42.667 0 0 1 0 789.333V426.667A42.667 42.667 0 0 1 42.667 384H128V85.333A85.333 85.333 0 0 1 213.333 0H743.36L1024 282.453v656.214A85.333 85.333 0 0 1 938.667 1024H213.333A85.333 85.333 0 0 1 128 938.667V832zm61.376-364.885c-27.435 0-49.899 6.528-67.712 19.968-19.221 13.824-28.501 33.024-28.501 57.216s9.621 42.624 29.226 55.296c7.467 4.608 27.094 12.288 58.432 23.04 28.139 9.216 44.523 15.36 49.515 18.048 15.68 8.448 23.872 19.968 23.872 34.56 0 11.52-5.696 20.352-16.384 27.264-10.688 6.528-25.664 9.984-44.181 9.984-21.014 0-36.352-4.224-46.315-11.904-11.05-8.832-17.813-23.808-20.672-44.544H85.333c1.792 34.944 13.547 60.288 34.923 76.416 17.45 13.056 42.027 19.584 73.387 19.584 32.426 0 57.706-7.296 75.52-21.12 17.813-14.208 26.73-33.792 26.73-58.368 0-25.344-11.05-44.928-33.13-59.136-9.984-6.144-32.064-15.36-66.624-26.88-23.51-8.064-38.123-13.824-43.478-16.896-12.096-6.912-17.813-16.512-17.813-28.032 0-13.056 4.992-22.656 15.68-28.416 8.555-4.992 20.672-7.296 36.693-7.296 18.539 0 32.79 3.456 42.048 11.136 9.259 7.296 16.022 19.584 19.584 36.48h41.344c-2.496-29.952-12.821-52.224-30.656-66.432-16.725-13.44-40.256-19.968-70.186-19.968zm118.976 5.376 90.496 274.176h50.24l90.496-274.176h-45.227l-69.845 223.488h-1.067L353.6 472.49h-45.227zm368.405-5.376c-37.76 0-67.69 13.824-89.792 42.24-21.013 26.496-31.36 60.288-31.36 101.376 0 40.704 10.347 74.112 31.36 99.84 22.443 27.648 53.803 41.472 94.422 41.472 22.805 0 43.093-3.072 61.632-9.216a143.83 143.83 0 0 0 46.314-26.112V600.747H680.32v38.4h67.328v56.448c-8.533 5.376-17.45 9.6-27.435 12.672a123.285 123.285 0 0 1-34.197 4.608c-30.997 0-53.803-9.216-68.416-27.648-13.525-17.28-20.31-42.24-20.31-74.496 0-33.792 7.489-59.52 22.827-77.952 13.867-17.664 32.768-26.112 56.64-26.112 19.222 0 34.902 4.224 46.656 13.056 11.414 8.832 19.243 21.888 22.827 39.552h42.027c-4.63-30.72-16.043-53.376-34.198-68.736-18.88-15.744-44.544-23.424-77.312-23.424z"/>
</symbol>`, `<symbol class="aicon" viewBox="0 0 1024 1024" id="${ICON_DRAWIO_HTML}" xmlns="http://www.w3.org/2000/svg">
<path d="M192 384h640a42.667 42.667 0 0 1 42.667 42.667v362.666A42.667 42.667 0 0 1 832 832H192v106.667A21.333 21.333 0 0 0 213.333 960h725.334A21.333 21.333 0 0 0 960 938.667V308.82l-10.09-10.154H823.38a98.048 98.048 0 0 1-98.048-98.048V72.66L716.715 64H213.333A21.333 21.333 0 0 0 192 85.333V384zm-64 448H42.667A42.667 42.667 0 0 1 0 789.333V426.667A42.667 42.667 0 0 1 42.667 384H128V85.333A85.333 85.333 0 0 1 213.333 0H743.36L1024 282.453v656.214A85.333 85.333 0 0 1 938.667 1024H213.333A85.333 85.333 0 0 1 128 938.667V832zM64 472.49v274.177h37.227V625.323h93.866v121.344h37.248V472.49h-37.248v114.432h-93.866V472.49H64zm195.37 0v38.4h52.545v235.777h37.248V510.89h52.522v-38.4H259.392zm169.387 0v274.177h37.227V557.739h1.28l66.795 188.928h32.128l66.837-188.928h1.28v188.928h37.227V472.49h-43.606l-77.013 215.04h-1.28L472.32 472.49h-43.605zm287.36 0v274.177H832v-38.4h-78.976V472.49h-36.907z"/>
</symbol>`].join("\n"));

        

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
        const position: IPosition = {
            x: 500,
            y: 500
        }
        const exts = [DRAWIO_EXTENSION]
        const createDiv = showCreate ? `<div class="search__tip">
            <kbd>shift ↵</kbd> 创建
            <kbd>Esc</kbd> 退出搜索
        </div>` : ''
        const dialog = new Dialog({
            title: `选择drawio`,
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
                renderAssetList(element, inputElement.value, position, exts);
            });
            inputElement.addEventListener("compositionend", (event: InputEvent) => {
                event.stopPropagation();
                renderAssetList(element, inputElement.value, position, exts);
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
            renderAssetList(element, "", position, exts);
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


    
}
