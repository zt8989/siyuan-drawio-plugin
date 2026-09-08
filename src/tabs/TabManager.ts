import { Dialog, openTab } from "siyuan";
import qs from "query-string";
import { getTitleFromPath, createUrlFromTitle } from "@/link";
import { ICON_STANDARD, TAB_TYPE } from "@/constants";

export interface TabManagerDeps {
    app: unknown;
    name: string;
    isMobile: boolean;
    getConfigLoaded: () => boolean;
    getOpenedTab: () => Record<string, Array<{ tab: { id: string; model: unknown; addModel: (m: unknown) => void; updateTitle: (t: string) => void } }>>;
    i18n: { title?: string };
}

/**
 * TabManager — deep module owning tab/iframe lifecycle.
 * Small interface (openNew/openByPath/updateTitle/getIframeHtml) hides openTab vs Dialog choice,
 * qs.stringify, and data-id lookup. Plugin composes it with AssetStore/Bridge.
 */
export class TabManager {
    constructor(private deps: TabManagerDeps) {}

    getIframeHtml(data: Record<string, unknown> = {}): string {
        const urlObj = qs.stringify(data as Record<string, string>);
        // Layout-critical sizing is inline (not only in index.scss): SiYuan
        // hot-reloads this plugin (dropping its <style>) whenever a file
        // under the plugin's storage/petal dir changes — i.e. on every
        // draw.io autosave. Without inline size the iframe lapses to the
        // 300x150 default for ~300ms, and draw.io's installResizeHandler
        // permanently clamps oversized windows (e.g. the AI chat) to 0,0.
        return `<iframe class="siyuan-drawio-plugin__custom-tab" style="width:100%;height:100%;border:none;display:block;" src="/plugins/siyuan-drawio-plugin/webapp/?${urlObj.toString()}"></iframe>`;
    }

    showDrawioDialog(title: string, data: Record<string, unknown>): Dialog {
        return new Dialog({
            title: title || "drawio",
            content: this.getIframeHtml({ ...data, ui: "min" }),
            width: "100vw",
            height: "100vh",
        });
    }

    openCustomTab(title?: string, icon?: string, data?: unknown): void {
        if (this.deps.isMobile) {
            this.showDrawioDialog(title || "", (data as Record<string, unknown>) || {});
        } else {
            openTab({
                app: this.deps.app as Parameters<typeof openTab>[0]["app"],
                custom: {
                    icon: icon || ICON_STANDARD,
                    title: title || "drawio",
                    data: data as Record<string, unknown>,
                    id: this.deps.name + TAB_TYPE,
                },
            });
        }
    }

    openNewCustomTab(): void {
        this.openCustomTab(undefined, undefined, { nounce: Date.now() } as unknown as Record<string, unknown>);
    }

    openCustomTabByPath(path: string): void {
        this.openCustomTab(getTitleFromPath(path), undefined, { url: path });
    }

    updateTabTitle(frameElement: HTMLIFrameElement, title: string): void {
        const dataId = frameElement?.parentElement?.getAttribute("data-id");
        if (!dataId) return;
        const tabs = this.deps.getOpenedTab()[TAB_TYPE];
        if (!tabs) return;
        const tab = tabs.map((t) => t.tab).filter((t) => t.id === dataId);
        if (tab.length > 0) {
            const model = tab[0].model as { data: unknown };
            (model as unknown as { data: unknown }).data = { url: createUrlFromTitle(title) };
            (tab[0] as unknown as { addModel: (m: unknown) => void }).addModel(model);
            (tab[0] as unknown as { updateTitle: (t: string) => void }).updateTitle(title);
        }
    }

    onOpenTab(data: CustomEvent<{ url: string }>): void {
        if (!data.detail.url) return;
        const urlObj = new URL(data.detail.url);
        this.openCustomTab(
            urlObj.searchParams.get("title") || undefined,
            urlObj.searchParams.get("icon") || undefined,
            urlObj.searchParams.get("data") ? JSON.parse(urlObj.searchParams.get("data") as string) : {},
        );
    }
}
