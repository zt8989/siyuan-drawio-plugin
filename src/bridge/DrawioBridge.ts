import {
    NEW_TYPE,
    OPEN_TYPE,
    UPDATE_TITLE,
    COPY_LINK,
    OPEN_TAB_BY_PATH,
    CALLBAK_TYPE,
    SHOW_MESSAGE,
    SET_ITEM,
} from "@/constants";

/**
 * DrawioBridge — deep module owning the Siyuan host ↔ draw.io guest contract.
 * External seam: typed BridgeMessage (what callers and tests use).
 * Internal seams: window message transport, urlParams, storage — private to adapters.
 * Depth: small interface (getDrawioLang + message validation) hides BCP-47 fix, urlParams,
 *        and stringly-typed postMessage contract. Two adapters at seam → real seam.
 */

// Centralized BCP-47 mapping: SiYuan 3.7+ uses zh-CN, older uses zh_CN. Draw.io expects "zh".
// Fix in one place (locality): previously duplicated in client/PreConfig.js and inferred in e2e.
export function getDrawioLang(lang: string | null | undefined): string | null | undefined {
    if (lang == null) return lang as string | null | undefined;
    const sep = lang.search(/[_-]/);
    if (sep >= 0) lang = lang.substring(0, sep);
    return lang.toLowerCase();
}

// Old buggy version for test comparison (kept here to document the fix, not exported for use)
// function getLangOld(lang: string | null): string | null {
//     if (lang != null) {
//         const dash = lang.indexOf("_");
//         if (dash >= 0) lang = lang.substring(0, dash);
//         lang = lang.toLowerCase();
//     }
//     return lang;
// }

export const BRIDGE_TYPES = {
    NEW: NEW_TYPE,
    OPEN: OPEN_TYPE,
    UPDATE_TITLE,
    COPY_LINK,
    OPEN_TAB_BY_PATH,
    CALLBACK: CALLBAK_TYPE,
    SHOW_MESSAGE,
    SET_ITEM,
} as const;

export type BridgeMessageType = (typeof BRIDGE_TYPES)[keyof typeof BRIDGE_TYPES];

export type BridgeMessage =
    | { type: typeof NEW_TYPE; payload?: unknown; callbackId?: string }
    | { type: typeof OPEN_TYPE; payload?: unknown; callbackId?: string }
    | { type: typeof UPDATE_TITLE; payload: string; callbackId?: string }
    | { type: typeof COPY_LINK; payload: string; callbackId?: string }
    | { type: typeof OPEN_TAB_BY_PATH; payload: string; callbackId?: string }
    | { type: typeof CALLBAK_TYPE; payload: unknown; callbackId: string }
    | { type: typeof SHOW_MESSAGE; payload: string; callbackId?: string }
    | { type: typeof SET_ITEM; payload: { key: string; value: unknown }; callbackId?: string }
    | { type: string; payload?: unknown; callbackId?: string }; // fallback for unknown, for validation

const VALID_TYPES = new Set<string>(Object.values(BRIDGE_TYPES));

export function isValidBridgeMessage(data: unknown): data is BridgeMessage {
    if (!data || typeof data !== "object") return false;
    const msg = data as { type?: unknown };
    return typeof msg.type === "string" && VALID_TYPES.has(msg.type);
}

export function createBridgeMessage(type: BridgeMessageType, payload?: unknown, callbackId?: string): BridgeMessage {
    return { type, payload, callbackId } as BridgeMessage;
}

/**
 * Build DRAWIO urlParams lang entry. Hides window.siyuan access behind param injection for testability.
 * Usage: urlParams['lang'] = buildLangParam(parent?.siyuan?.config?.lang)
 */
export function buildLangParam(siyuanLang: string | null | undefined): string | null | undefined {
    return getDrawioLang(siyuanLang);
}
