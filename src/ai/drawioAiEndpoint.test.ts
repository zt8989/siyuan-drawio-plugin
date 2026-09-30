import { describe, it, expect } from "vitest";
import { toFullChatCompletionsUrl, DEFAULT_GPT_URL } from "./drawioAiEndpoint";

/**
 * The contract this module owns is "given whatever SiYuan stored, hand draw.io a
 * URL it can POST to". Every case below was checked against the previous
 * copy-pasted implementation across 28 real provider shapes: 22 were byte-identical,
 * and the 6 that changed are all bug fixes (query/fragment mangling, bare hosts
 * without a scheme, misreading a query as a completed endpoint). The unchanged
 * cases are asserted too, so a future rewrite cannot silently drift.
 */

describe("toFullChatCompletionsUrl — fallbacks", () => {
    it("returns the OpenAI default for empty/absent input", () => {
        expect(toFullChatCompletionsUrl(undefined)).toBe(DEFAULT_GPT_URL);
        expect(toFullChatCompletionsUrl(null)).toBe(DEFAULT_GPT_URL);
        expect(toFullChatCompletionsUrl("")).toBe(DEFAULT_GPT_URL);
        expect(toFullChatCompletionsUrl("   ")).toBe(DEFAULT_GPT_URL);
    });

    it("never throws on unparseable input", () => {
        expect(() => toFullChatCompletionsUrl("http://[not a url")).not.toThrow();
        expect(toFullChatCompletionsUrl("http://[not a url")).toBe(DEFAULT_GPT_URL);
    });
});

describe("toFullChatCompletionsUrl — base URLs get the operation path appended", () => {
    it("appends /v1/chat/completions to a bare host (the live SiYuan 3.8 shape)", () => {
        expect(toFullChatCompletionsUrl("https://api.deepseek.com")).toBe(
            "https://api.deepseek.com/v1/chat/completions",
        );
    });

    it("appends only /chat/completions when the base already ends with /v1", () => {
        expect(toFullChatCompletionsUrl("https://api.deepseek.com/v1")).toBe(
            "https://api.deepseek.com/v1/chat/completions",
        );
        expect(toFullChatCompletionsUrl("https://openrouter.ai/api/v1")).toBe(
            "https://openrouter.ai/api/v1/chat/completions",
        );
        expect(toFullChatCompletionsUrl("https://dashscope.aliyuncs.com/compatible-mode/v1")).toBe(
            "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
        );
    });

    it("trims lingering trailing slashes first", () => {
        for (const input of [
            "https://api.deepseek.com/",
            "https://api.deepseek.com/v1/",
            "https://api.deepseek.com/v1//",
        ]) {
            expect(toFullChatCompletionsUrl(input)).toBe("https://api.deepseek.com/v1/chat/completions");
        }
    });

    it("keeps every OpenAI-compatible provider working", () => {
        const cases: Array<[string, string]> = [
            ["https://api.openai.com", "https://api.openai.com/v1/chat/completions"],
            ["https://api.moonshot.cn/v1", "https://api.moonshot.cn/v1/chat/completions"],
            ["https://api.siliconflow.cn/v1", "https://api.siliconflow.cn/v1/chat/completions"],
            ["http://localhost:11434", "http://localhost:11434/v1/chat/completions"],
            ["http://127.0.0.1:8080/v1", "http://127.0.0.1:8080/v1/chat/completions"],
        ];
        for (const [input, expected] of cases) expect(toFullChatCompletionsUrl(input)).toBe(expected);
    });
});

describe("toFullChatCompletionsUrl — completed endpoints pass through untouched", () => {
    it("leaves OpenAI / Gemini / Anthropic operation URLs alone", () => {
        for (const url of [
            "https://api.openai.com/v1/chat/completions",
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
            "https://api.anthropic.com/v1/messages",
        ]) {
            expect(toFullChatCompletionsUrl(url)).toBe(url);
        }
    });

    it("preserves an Azure deployment URL and its api-version query", () => {
        const azure =
            "https://my-res.openai.azure.com/openai/deployments/gpt-4/chat/completions?api-version=2024-02-15-preview";
        expect(toFullChatCompletionsUrl(azure)).toBe(azure);
    });
});

describe("toFullChatCompletionsUrl — regressions fixed (were mangled by string concat)", () => {
    it("keeps the query string after the appended path", () => {
        expect(toFullChatCompletionsUrl("https://api.deepseek.com?foo=1")).toBe(
            "https://api.deepseek.com/v1/chat/completions?foo=1",
        );
    });

    it("keeps the fragment after the appended path", () => {
        expect(toFullChatCompletionsUrl("https://api.deepseek.com/v1#frag")).toBe(
            "https://api.deepseek.com/v1/chat/completions#frag",
        );
    });

    it("does not treat a marker that only appears in the query as a completed endpoint", () => {
        expect(toFullChatCompletionsUrl("https://proxy.example.com/v1?target=chat/completions")).toBe(
            "https://proxy.example.com/v1/chat/completions?target=chat/completions",
        );
    });

    it("adds a scheme to a bare host instead of returning a relative URL", () => {
        expect(toFullChatCompletionsUrl("api.deepseek.com")).toBe("https://api.deepseek.com/v1/chat/completions");
    });

    it("uses http for bare loopback hosts", () => {
        expect(toFullChatCompletionsUrl("localhost:11434")).toBe("http://localhost:11434/v1/chat/completions");
    });

    it("trims surrounding whitespace", () => {
        expect(toFullChatCompletionsUrl("  https://api.deepseek.com  ")).toBe(
            "https://api.deepseek.com/v1/chat/completions",
        );
    });
});
