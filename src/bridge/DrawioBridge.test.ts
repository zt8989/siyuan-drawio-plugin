import { describe, it, expect } from "vitest";
import { getDrawioLang, buildLangParam, isValidBridgeMessage, BRIDGE_TYPES } from "./DrawioBridge";

describe("DrawioBridge — getDrawioLang single source of truth (locality, fixes BCP-47 bug)", () => {
    it("maps zh-CN and zh_CN to zh (not zh-cn)", () => {
        expect(getDrawioLang("zh-CN")).toBe("zh");
        expect(getDrawioLang("zh_CN")).toBe("zh");
        expect(getDrawioLang("zh-CN")).not.toBe("zh-cn");
    });

    it("maps en-US, en_US to en", () => {
        expect(getDrawioLang("en-US")).toBe("en");
        expect(getDrawioLang("en_US")).toBe("en");
    });

    it("lowercases and handles null/undefined", () => {
        expect(getDrawioLang("EN-us")).toBe("en");
        expect(getDrawioLang(null)).toBeNull();
        expect(getDrawioLang(undefined)).toBeUndefined();
        expect(getDrawioLang("ja-JP")).toBe("ja");
    });

    it("documents old bug: old logic with indexOf('_') would give zh-cn for zh-CN", () => {
        function getLangOld(lang: string | null) {
            if (lang != null) {
                const dash = lang.indexOf("_");
                if (dash >= 0) lang = lang.substring(0, dash);
                lang = lang.toLowerCase();
            }
            return lang;
        }
        expect(getLangOld("zh-CN")).toBe("zh-cn"); // buggy
        expect(getDrawioLang("zh-CN")).toBe("zh"); // fixed
    });

    it("buildLangParam delegates to getDrawioLang (hide window.siyuan access for testability)", () => {
        expect(buildLangParam("zh-CN")).toBe("zh");
        expect(buildLangParam(null)).toBeNull();
    });
});

describe("DrawioBridge — typed message validation (interface is test surface)", () => {
    it("validates BridgeMessage types", () => {
        expect(isValidBridgeMessage({ type: BRIDGE_TYPES.NEW })).toBe(true);
        expect(isValidBridgeMessage({ type: BRIDGE_TYPES.OPEN })).toBe(true);
        expect(isValidBridgeMessage({ type: BRIDGE_TYPES.CALLBACK })).toBe(true);
        expect(isValidBridgeMessage({ type: "drawio_unknown" })).toBe(false);
        expect(isValidBridgeMessage({ payload: "no type" })).toBe(false);
        expect(isValidBridgeMessage(null)).toBe(false);
    });

    it("guest lang param via bridge without CDP (no iframe needed)", () => {
        // Simulate guest PreConfig logic: urlParams['lang'] = getDrawioLang(siyuanLang)
        const siyuanLang = "zh-CN";
        const lang = getDrawioLang(siyuanLang);
        expect(lang).toBe("zh");
        // e2e iframe check will read this value
    });
});
