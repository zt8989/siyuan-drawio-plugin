import {
    Plugin,
    showMessage,
    Dialog,
    Custom,
    Protyle,
    IProtyle,
    IWebSocketData,
    getFrontend,
} from "siyuan";
import { logger } from "./logger";

import "@/index.scss";


import { getIframeFromEventSource } from "./utils";
import { CALLBAK_TYPE, COPY_LINK, DOCK_TYPE, DRAWIO_CONFIG, DRAWIO_CONFIG_KEYS, NEW_TYPE, OPEN_TAB_BY_PATH, OPEN_TYPE, TAB_TYPE, UPDATE_TITLE, ICON_STANDARD, DRAWIO_EXTENSION, drawioAssetsPath } from "./constants";
import { SiyuanAssetStore, type AssetStore } from "./asset/AssetStore";
import { createLinkFromTitle, getTitleFromPath } from "./link";
import { ShowDialogCallback, DrawioConfig } from "./types";
import { genDrawioHTMLByUrl } from "./asset/renderAssets";
import { isValidBridgeMessage } from "./bridge/DrawioBridge";
import { TabManager } from "./tabs/TabManager";
import { AssetPickerDialog } from "./dialog/AssetPickerDialog";
import Dock from "./components/dock.svelte";
import DrawioSettings from "./components/drawio-settings.svelte";

export default class DrawioPlugin extends Plugin {
    customTab: () => Custom;
    private isMobile: boolean;
    private configLoaded = false
    private drawioConfig: DrawioConfig | null = null
    public assetStore: AssetStore = new SiyuanAssetStore()
    private tabManager!: TabManager
    private assetPicker!: AssetPickerDialog

    // Pre-bind methods to ensure same reference for event cleanup
    private boundOnOpenTab = this.onOpenTab.bind(this)
    private boundBindStaticEvent = this.bindStaticEvent.bind(this)
    private boundBindWsEvent = this.bindWsEvent.bind(this)
    private boundOpenMenuImage = this.openMenuImage.bind(this)

    async onload() {
        window.drawioPlugin = this
        
        this.eventBus.on("open-siyuan-url-plugin", this.boundOnOpenTab);
        this.eventBus.on("loaded-protyle-static", this.boundBindStaticEvent)
        this.eventBus.on("ws-main", this.boundBindWsEvent)
        this.eventBus.on("open-menu-image", this.boundOpenMenuImage);

        window.addEventListener("message", this.onMessage)
        window.addEventListener('storage', this.onStorage)
        
        const frontEnd = getFrontend();
        this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";

        // Composition root wiring: deep modules behind small interfaces (locality, leverage)
        this.tabManager = new TabManager({
            app: this.app,
            name: this.name,
            isMobile: this.isMobile,
            getConfigLoaded: () => this.configLoaded,
            getOpenedTab: () => this.getOpenedTab() as unknown as Record<string, Array<{ tab: { id: string; model: unknown; addModel: (m: unknown) => void; updateTitle: (t: string) => void } }>>,
            i18n: this.i18n as unknown as { title?: string },
        });
        this.assetPicker = new AssetPickerDialog({
            assetStore: this.assetStore,
            isMobile: this.isMobile,
            i18n: this.i18n as unknown as { selectDrawio: string; create: string; exitSearch: string; emptyContent: string },
        });

        // 图标的制作参见帮助文档
        this.addIcons(`<symbol id="${ICON_STANDARD}" viewBox="0 0 32 32">
<path d="M16.634 11.932l1.756-1.016 5.090 8.814-1.756 1.014-5.090-8.812zM8.526 19.714l5.072-8.784 1.76 1.018-5.070 8.784-1.762-1.018z"></path>
<path d="M12.276 4.296h7.448c0.9 0 1.348 0.45 1.348 1.348v5.786c0 0.9-0.45 1.348-1.348 1.348h-7.448c-0.9 0-1.348-0.45-1.348-1.348v-5.786c0-0.9 0.45-1.348 1.348-1.348zM19.714 19.224h7.45c0.898 0 1.346 0.448 1.346 1.346v5.788c0 0.898-0.448 1.346-1.346 1.346h-7.45c-0.898 0-1.348-0.448-1.348-1.346v-5.788c0-0.898 0.45-1.346 1.348-1.346zM4.838 19.224h7.448c0.9 0 1.348 0.448 1.348 1.346v5.788c0 0.898-0.45 1.346-1.348 1.346h-7.446c-0.9 0-1.348-0.448-1.348-1.346v-5.788c0-0.898 0.45-1.346 1.348-1.346z"></path>
</symbol><symbol id="icon-drawio-inverse" viewBox="0 0 32 32">
<path d="M31.454 31.454h-31.454v-31.454h31.454v31.454zM18.241 20.403v4.545c0 0.944 0.765 1.709 1.709 1.709h5.893c0.944 0 1.709-0.765 1.709-1.709v-4.545c0-0.944-0.765-1.709-1.709-1.709h-3.266l-3.476-5.92c0.753-0.179 1.313-0.855 1.313-1.662v-4.606c0-0.944-0.765-1.709-1.709-1.709h-5.893c-0.944 0-1.709 0.765-1.709 1.709v4.606c0 0.788 0.533 1.45 1.258 1.648l-3.484 5.934h-3.266c-0.944 0-1.709 0.765-1.709 1.709v4.545c0 0.944 0.765 1.709 1.709 1.709h5.893c0.944 0 1.709-0.765 1.709-1.709v-4.545c0-1.032-0.53-1.709-2.199-1.709l3.448-5.873h2.651l3.448 5.873c-1.681-0.116-2.366 0.988-2.322 1.709z"></path>
</symbol>`);

        if(!this.isMobile) {
            this.addTopBar({
                icon: ICON_STANDARD,
                title: this.i18n.openDrawio,
                position: "right",
                callback: () => {
                    this.openNewCustomTab()
                }
            });
        }

        const that = this
        this.customTab = this.addTab({
            type: TAB_TYPE,
            init() {
                const checkConfig = () => {
                    if (that.configLoaded) {
                        this.element.innerHTML = that.getIframeHtml(this.data || {})
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

    private getIframeHtml(data: Record<string, unknown> = {}): string {
        return this.tabManager.getIframeHtml(data);
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
        if (remoteDataObj) {
            this.drawioConfig = typeof remoteDataObj === 'string' ? JSON.parse(remoteDataObj) : remoteDataObj;
        }
        this.configLoaded = true
    }

    onLayoutReady() {
    }

    async onunload() {
        this.eventBus.off("open-siyuan-url-plugin", this.boundOnOpenTab);
        this.eventBus.off("loaded-protyle-static", this.boundBindStaticEvent)
        this.eventBus.off("ws-main", this.boundBindWsEvent)
        this.eventBus.off("open-menu-image", this.boundOpenMenuImage);
        
        window.removeEventListener("message", this.onMessage)
        window.removeEventListener('storage', this.onStorage)
    }

    uninstall() {
    }

    onStorage = (ev: { key: string, newValue: string, oldValue: string }) => {
        const { key, newValue, oldValue } = ev
        if (DRAWIO_CONFIG_KEYS.includes(key) && newValue != oldValue) {
            logger.debug("this.saveData", key, newValue)
            this.saveData(key, newValue)
            if (key === DRAWIO_CONFIG) {
                this.drawioConfig = JSON.parse(newValue);
            }
        }
    }

    onMessage = (ev: MessageEvent<{ type: string, payload: any, callbackId?: string }>) => {
        // Only process messages from same origin + valid BridgeMessage (typed seam, test surface)
        if (ev.origin !== window.location.origin) {
            logger.debug('Rejected message from invalid origin:', ev.origin);
            return;
        }
        if (!isValidBridgeMessage(ev.data)) {
            logger.debug('Rejected invalid bridge message:', ev.data);
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
        if (DRAWIO_CONFIG_KEYS.includes(key)) {
            this.saveData(key, typeof value == 'string' ? value : JSON.stringify(value))
            if (key === DRAWIO_CONFIG) {
                this.drawioConfig = typeof value === 'string' ? JSON.parse(value) : value;
            }
        }
    }

    public getDrawioConfig(): DrawioConfig | null {
        return this.drawioConfig;
    }

    public async saveDrawioConfig(config: DrawioConfig) {
        this.drawioConfig = config;
        localStorage.setItem(DRAWIO_CONFIG, JSON.stringify(config));
        await this.saveData(DRAWIO_CONFIG, JSON.stringify(config));
    }

    public openSetting() {
        const dialog = new Dialog({
            title: `${this.i18n.setting}`,
            content: `<div class="b3-dialog__content" style="height: 100%;"></div>`,
            width: "80vw",
            height: "80vh",
        });
        new DrawioSettings({
            target: dialog.element.querySelector(".b3-dialog__content"),
            props: {
                plugin: this,
            },
        });
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

    public updateTabTitle(frameElement: HTMLIFrameElement, title: string): void {
        this.tabManager.updateTabTitle(frameElement, title);
    }

    public showOpenDialog(showCreate: boolean, callback?: ShowDialogCallback): Dialog {
        return this.assetPicker.showOpenDialog(showCreate, callback);
    }

    public showDrawioDialog(title: string, data: Record<string, any>): Dialog {
        return this.tabManager.showDrawioDialog(title, data);
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
        // Deep: creation now goes through AssetStore save (DrawioAsset owns suffix)
        this.assetStore.save(value, this.drawioConfig?.defaultSavePath).then((data) => {
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

    onOpenTab(data: CustomEvent<{ url: string }>): void {
        this.tabManager.onOpenTab(data);
    }

    openNewCustomTab(): void {
        this.tabManager.openNewCustomTab();
    }

    openCustomTab(title?: string, icon?: string, data?: unknown): void {
        this.tabManager.openCustomTab(title, icon, data);
    }

    openCustomTabByPath(path: string): void {
        this.tabManager.openCustomTabByPath(path);
    }

    

    private openMenuImage({ detail }) {
        const selectedElement = detail.element;
        const imageElement = selectedElement.querySelector("img") as HTMLImageElement;
        const imageURL = imageElement.dataset.src;
        if (imageURL && imageURL.startsWith(drawioAssetsPath)) {
            window.siyuan.menus.menu.addItem({
            id: "edit-drawio",
            icon: 'iconEdit',
            label: `${this.i18n.editDrawio}`,
            index: 1,
            click: () => {
                    this.openCustomTabByPath(imageURL);
                }
            })
        }
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


    async renderAssetList(element: Element, k: string, position: IPosition): Promise<void> {
        return this.assetPicker.renderAssetList(element, k, position);
    }
}
