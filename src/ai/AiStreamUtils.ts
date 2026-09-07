/**
 * AiStreamUtils — pure helpers for draw.io AI chat streaming (no DOM).
 *
 * Upstream draw.io ChatWindow posts a full `chat/completions` request via
 * mxXmlRequest and renders only when the complete response arrives, so long
 * chain-of-thought answers (e.g. "画一个 DeepSeek 的鲸鱼") hit the 90s
 * generateTimeout. The client patch (`client/AiStreamPatch.js`) upgrades
 * those requests to SSE (`stream: true`), accumulates deltas with the
 * helpers below, and synthesizes a normal-shaped JSON response so the
 * upstream responsePath (`$.choices[0].message.content`) keeps working.
 */

export const FIRST_BYTE_TIMEOUT_MS = 90000;
export const OVERALL_TIMEOUT_MS = 600000;
export const THINKING_PREVIEW_MAX_LEN = 100;

export interface StreamDelta {
    content: string;
    reasoning: string;
    done: boolean;
}

export interface SseSplit {
    events: string[];
    rest: string;
}

interface ChatDelta {
    content?: unknown;
    reasoning_content?: unknown;
    reasoning?: unknown;
    thinking?: unknown;
}

interface ChatChunk {
    choices?: Array<{ delta?: ChatDelta; message?: { content?: unknown } }>;
}

interface ProviderErrorBody {
    error?: { message?: unknown };
}

const EMPTY_DELTA: StreamDelta = { content: "", reasoning: "", done: false };

/** Only OpenAI-compatible `chat/completions` endpoints speak SSE deltas we parse. */
export function isStreamableAiUrl(url: string): boolean {
    return typeof url === "string" && url.includes("chat/completions");
}

/** Returns the body with `stream: true` added, or null when not a JSON object body. */
export function withStreamFlag(bodyText: string): string | null {
    try {
        const parsed: unknown = JSON.parse(bodyText);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
        return JSON.stringify({ ...(parsed as Record<string, unknown>), stream: true });
    } catch {
        return null;
    }
}

/** Splits buffered SSE text into complete events; the incomplete tail is returned as rest. */
export function splitSseEvents(buffer: string): SseSplit {
    const normalized = buffer.replace(/\r\n/g, "\n");
    const parts = normalized.split("\n\n");
    const rest = parts.pop() ?? "";
    return { events: parts.filter((p) => p.trim() !== ""), rest };
}

/** Parses one SSE event block into content / reasoning deltas. Never throws. */
export function extractDelta(eventBlock: string): StreamDelta {
    const lines = eventBlock.split("\n");
    let content = "";
    let reasoning = "";
    let done = false;
    for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice("data:".length).trim();
        if (payload === "[DONE]") {
            done = true;
            continue;
        }
        let json: unknown;
        try {
            json = JSON.parse(payload);
        } catch {
            continue;
        }
        const delta = (json as ChatChunk)?.choices?.[0]?.delta;
        if (delta === null || typeof delta !== "object") continue;
        if (typeof delta.content === "string") content += delta.content;
        reasoning += readReasoningField(delta);
    }
    if (content === "" && reasoning === "" && !done) return { ...EMPTY_DELTA };
    return { content, reasoning, done };
}

function readReasoningField(delta: ChatDelta): string {
    const direct = delta["reasoning_content"] ?? delta["reasoning"] ?? delta["thinking"];
    if (typeof direct === "string") return direct;
    if (direct !== null && typeof direct === "object") {
        const obj = direct as Record<string, unknown>;
        for (const key of ["text", "content", "value"]) {
            if (typeof obj[key] === "string") return obj[key] as string;
        }
    }
    return "";
}

/** Reads a full non-stream JSON body (servers that ignore `stream: true`). Null when not classic shaped. */
export function extractClassicContent(text: string): string | null {
    try {
        const parsed = JSON.parse(text) as ChatChunk;
        const content = parsed?.choices?.[0]?.message?.content;
        if (typeof content === "string" && content !== "") return stripMarkdownFences(content);
        return null;
    } catch {
        return null;
    }
}

/** Mirrors the existing fence-strip patch: removes ```mermaid / ``` wrappers. */
export function stripMarkdownFences(text: string): string {
    if (typeof text !== "string" || !text.includes("```")) return text;
    return text.replace(/```mermaid\s*/g, "").replace(/```\s*/g, "").trim();
}

/**
 * Preview for the grey "思考中 ..." row: the latest non-empty line with
 * whitespace collapsed, truncated to THINKING_PREVIEW_MAX_LEN. Newlines in
 * the stream therefore refresh the preview; overlong lines are cut.
 */
export function formatThinkingPreview(reasoning: string): string {
    if (typeof reasoning !== "string") return "";
    const lines = reasoning.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l !== "");
    if (lines.length === 0) return "";
    const current = lines[lines.length - 1];
    return current.length > THINKING_PREVIEW_MAX_LEN ? current.slice(0, THINKING_PREVIEW_MAX_LEN) : current;
}

/**
 * Unwraps an mxfile/diagram envelope to the bare <mxGraphModel> upstream
 * splits on. Without this, Editor.extractGraphModelFromText keeps the
 * envelope as textBefore/textAfter and the chat renders raw
 * `<mxfile>...<diagram>` / `</diagram></mxfile>` around the diagram.
 * Returns the input untouched when no complete model is present
 * (mermaid, plain text, truncated streams).
 */
export function unwrapDiagramEnvelope(text: string): string {
    if (typeof text !== "string" || text.indexOf("<mxGraphModel") < 0) return text;
    const match = text.match(/<mxGraphModel[\s\S]*?<\/mxGraphModel>/);
    return match ? match[0] : text;
}

/** Final JSON shaped like a non-stream response so upstream responsePath keeps working. */
export function buildChatCompletionsJson(content: string, reasoning: string): string {
    return JSON.stringify({
        choices: [{ message: { content: unwrapDiagramEnvelope(stripMarkdownFences(content)), reasoning_content: reasoning } }],
    });
}

/** Prefers the provider error message, falls back to the HTTP status. */
export function extractErrorMessage(status: number, bodyText: string): string {
    try {
        const parsed = JSON.parse(bodyText) as ProviderErrorBody;
        const message = parsed?.error?.message;
        if (typeof message === "string" && message !== "") return message;
    } catch {
        // fall through to status text
    }
    return `Error: ${status}`;
}
