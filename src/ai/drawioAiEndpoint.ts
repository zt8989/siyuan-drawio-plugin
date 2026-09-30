/**
 * drawioAiEndpoint — single source of truth for turning a SiYuan provider base URL
 * into the URL draw.io actually POSTs to.
 *
 * Why this module exists: the same logic used to be copy-pasted in three places
 * (client/PreConfig.js, client/AiGeneratePatch.js and src/ai/SiyuanAiProvider.ts),
 * so a fix in one silently missed the other two.
 *
 * Contract:
 * - always returns an absolute, POSTable chat-completions URL;
 * - never throws — unusable input falls back to the OpenAI default;
 * - an endpoint that already names its operation (OpenAI `chat/completions`,
 *   Gemini `generateContent`, Anthropic `v1/messages`) is passed through as-is;
 * - query strings and fragments survive; only the path is rewritten.
 *
 * Scope: draw.io's `aiConfigs.gpt` entry is OpenAI-shaped end to end (request body
 * plus `responsePath: $.choices[0].message.content`), so this only ever targets an
 * OpenAI-compatible endpoint. Providers speaking another protocol must already
 * carry their complete operation URL — see {@link COMPLETE_ENDPOINT_MARKERS}.
 */

export const DEFAULT_GPT_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Path fragments that identify an already-complete endpoint. Matched against the
 * path only — never the query — so `?target=chat/completions` cannot masquerade
 * as a finished URL.
 */
const COMPLETE_ENDPOINT_MARKERS = ["chat/completions", "generateContent", "v1/messages"];

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/** Bare hosts that are almost always plain HTTP (Ollama, LM Studio, local gateways). */
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i;

/**
 * Normalize a SiYuan provider base URL into the endpoint draw.io should call.
 *
 * ```
 * https://api.deepseek.com                  -> https://api.deepseek.com/v1/chat/completions
 * https://openrouter.ai/api/v1              -> https://openrouter.ai/api/v1/chat/completions
 * https://api.anthropic.com/v1/messages     -> unchanged
 * api.deepseek.com                          -> https://api.deepseek.com/v1/chat/completions
 * ```
 */
export function toFullChatCompletionsUrl(baseUrl?: string | null): string {
    if (baseUrl == null) return DEFAULT_GPT_URL;

    let raw = String(baseUrl).trim();
    if (raw === "") return DEFAULT_GPT_URL;

    // SiYuan's provider form stores a bare host now and then; without a scheme the
    // result would be a relative URL that draw.io cannot fetch at all.
    if (!HAS_SCHEME.test(raw)) raw = `${LOOPBACK_HOST.test(raw) ? "http" : "https"}://${raw}`;

    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return DEFAULT_GPT_URL;
    }

    const path = url.pathname.replace(/\/+$/, "");
    url.pathname = COMPLETE_ENDPOINT_MARKERS.some((marker) => path.includes(marker))
        ? path
        : path.endsWith("/v1")
          ? `${path}/chat/completions`
          : `${path}/v1/chat/completions`;

    return url.toString();
}
