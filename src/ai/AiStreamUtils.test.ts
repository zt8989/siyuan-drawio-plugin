import { describe, it, expect } from "vitest";
import {
    FIRST_BYTE_TIMEOUT_MS,
    OVERALL_TIMEOUT_MS,
    THINKING_PREVIEW_MAX_LEN,
    isStreamableAiUrl,
    withStreamFlag,
    splitSseEvents,
    extractDelta,
    extractClassicContent,
    stripMarkdownFences,
    unwrapDiagramEnvelope,
    formatThinkingPreview,
    buildChatCompletionsJson,
    extractErrorMessage,
} from "./AiStreamUtils";

describe("isStreamableAiUrl", () => {
    it("accepts OpenAI-compatible chat/completions endpoints", () => {
        expect(isStreamableAiUrl("https://api.openai.com/v1/chat/completions")).toBe(true);
        expect(isStreamableAiUrl("https://api.deepseek.com/v1/chat/completions")).toBe(true);
        expect(isStreamableAiUrl("https://custom-host:8080/v1/chat/completions")).toBe(true);
    });

    it("rejects non-SSE protocols (gemini / claude) and empty urls", () => {
        expect(isStreamableAiUrl("https://generativelanguage.googleapis.com/v1beta/models/x:generateContent")).toBe(false);
        expect(isStreamableAiUrl("https://api.anthropic.com/v1/messages")).toBe(false);
        expect(isStreamableAiUrl("")).toBe(false);
    });
});

describe("withStreamFlag", () => {
    it("adds stream:true while preserving the original payload", () => {
        const out = withStreamFlag(JSON.stringify({ model: "m", messages: [{ role: "user", content: "hi" }] }));
        expect(out).not.toBeNull();
        const parsed = JSON.parse(out as string);
        expect(parsed.stream).toBe(true);
        expect(parsed.model).toBe("m");
        expect(parsed.messages).toHaveLength(1);
    });

    it("returns null for non-JSON bodies", () => {
        expect(withStreamFlag("not-json")).toBeNull();
        expect(withStreamFlag("")).toBeNull();
    });

    it("returns null for JSON arrays (shape must stay an object)", () => {
        expect(withStreamFlag("[1,2]")).toBeNull();
    });
});

describe("splitSseEvents", () => {
    it("splits complete events on blank lines and keeps the tail", () => {
        const { events, rest } = splitSseEvents('data: {"a":1}\n\ndata: {"b":2}\n\npartial');
        expect(events).toHaveLength(2);
        expect(events[0]).toContain('{"a":1}');
        expect(rest).toBe("partial");
    });

    it("handles CRLF framing", () => {
        const { events, rest } = splitSseEvents('data: [DONE]\r\n\r\n');
        expect(events).toHaveLength(1);
        expect(rest).toBe("");
    });
});

describe("extractDelta", () => {
    it("extracts content deltas", () => {
        const d = extractDelta('data: {"choices":[{"delta":{"content":"hello"}}]}');
        expect(d.content).toBe("hello");
        expect(d.reasoning).toBe("");
        expect(d.done).toBe(false);
    });

    it("extracts DeepSeek reasoning_content deltas", () => {
        const d = extractDelta('data: {"choices":[{"delta":{"reasoning_content":"让我想想鲸鱼"}}]}');
        expect(d.reasoning).toBe("让我想想鲸鱼");
        expect(d.content).toBe("");
    });

    it("extracts reasoning / thinking variants", () => {
        expect(extractDelta('data: {"choices":[{"delta":{"reasoning":"abc"}}]}').reasoning).toBe("abc");
        expect(extractDelta('data: {"choices":[{"delta":{"thinking":{"text":"xyz"}}}]}').reasoning).toBe("xyz");
    });

    it("marks [DONE] and ignores comments / invalid json", () => {
        expect(extractDelta("data: [DONE]").done).toBe(true);
        const empty = extractDelta(": ping");
        expect(empty.done).toBe(false);
        expect(empty.content).toBe("");
        const bad = extractDelta("data: {oops");
        expect(bad.content).toBe("");
        expect(bad.done).toBe(false);
    });
});

describe("extractClassicContent", () => {
    it("reads full JSON bodies from servers that ignore stream:true", () => {
        const body = JSON.stringify({ choices: [{ message: { content: "```mermaid\ngraph TD\n```" } }] });
        expect(extractClassicContent(body)).toBe("graph TD");
        expect(extractClassicContent("data: something")).toBeNull();
        expect(extractClassicContent("")).toBeNull();
    });
});

describe("unwrapDiagramEnvelope", () => {
    const model = '<mxGraphModel dx="800"><root><mxCell id="0"/></root></mxGraphModel>';
    it("unwraps mxfile/diagram envelope to the bare model", () => {
        const wrapped = `<mxfile host="app.diagrams.net"><diagram id="w" name="W">${model}</diagram></mxfile>`;
        expect(unwrapDiagramEnvelope(wrapped)).toBe(model);
    });
    it("leaves bare models, mermaid and plain text untouched", () => {
        expect(unwrapDiagramEnvelope(model)).toBe(model);
        expect(unwrapDiagramEnvelope("```mermaid\ngraph TD\n```")).toBe("```mermaid\ngraph TD\n```");
        expect(unwrapDiagramEnvelope("plain answer")).toBe("plain answer");
        expect(unwrapDiagramEnvelope("<mxfile><diagram></diagram></mxfile>")).toBe("<mxfile><diagram></diagram></mxfile>");
    });
});

describe("stripMarkdownFences", () => {
    it("removes mermaid / plain fences like the existing XHR patch", () => {
        expect(stripMarkdownFences("```mermaid\ngraph TD\n```")).toBe("graph TD");
        expect(stripMarkdownFences("```\n<mxGraphModel/>\n```")).toBe("<mxGraphModel/>");
        expect(stripMarkdownFences("plain text")).toBe("plain text");
    });
});

describe("formatThinkingPreview", () => {
    it("returns empty for empty reasoning", () => {
        expect(formatThinkingPreview("")).toBe("");
        expect(formatThinkingPreview("   \n  ")).toBe("");
    });

    it("shows the latest non-empty line so newlines refresh the preview", () => {
        expect(formatThinkingPreview("第一行\n第二行鲸鱼")).toBe("第二行鲸鱼");
        expect(formatThinkingPreview("第一行\n第二行\n")).toBe("第二行");
    });

    it("collapses whitespace and truncates overlong content", () => {
        const long = "a".repeat(THINKING_PREVIEW_MAX_LEN + 50);
        const preview = formatThinkingPreview(long);
        expect(preview.length).toBeLessThanOrEqual(THINKING_PREVIEW_MAX_LEN);
        expect(formatThinkingPreview("a   b\nc\td")).toBe("c d");
    });
});

describe("buildChatCompletionsJson", () => {
    it("matches the gpt responsePath shape with fences stripped", () => {
        const body = buildChatCompletionsJson("```mermaid\ngraph TD\n```", "思考过程");
        const parsed = JSON.parse(body);
        expect(parsed.choices[0].message.content).toBe("graph TD");
        expect(parsed.choices[0].message.reasoning_content).toBe("思考过程");
    });
});

describe("extractErrorMessage", () => {
    it("prefers the provider error message", () => {
        expect(extractErrorMessage(400, JSON.stringify({ error: { message: "bad key" } }))).toBe("bad key");
    });

    it("falls back to status text", () => {
        expect(extractErrorMessage(504, "")).toContain("504");
    });
});

describe("timeout policy", () => {
    it("keeps first-byte budget aligned with the legacy 90s timeout", () => {
        expect(FIRST_BYTE_TIMEOUT_MS).toBe(90000);
        expect(OVERALL_TIMEOUT_MS).toBeGreaterThan(FIRST_BYTE_TIMEOUT_MS);
    });
});
