import { fetchSyncPost } from "siyuan";

/**
 * SiyuanAiProvider — deep module owning SiYuan AI provider -> draw.io AI config translation.
 * External seam: getAiConfigForDrawio() returns null when no provider configured (Clipboard fallback).
 * Internal seam: /api/setting/getAI fetch, window.siyuan fallback.
 */

export interface SiyuanAiConfig {
    Provider?: string;
    OpenAI?: {
        APIKey: string;
        APIModel: string;
        APIBaseURL?: string;
        APITimeout?: number;
        APIMaxTokens?: number;
        APITemperature?: number;
        APIMaxContexts?: number;
    };
    // SiYuan 3.8+ new shape
    providers?: Array<{
        id: string;
        displayName?: string;
        enabled: boolean;
        apiKey: string;
        baseURL: string;
        protocol?: string;
        models: Array<{ id: string; name: string; enabled: boolean }>;
    }>;
}

export interface DrawioAiInjection {
    gptApiKey?: string | null;
    gptUrl?: string | null;
    gptModel?: string | null;
    // new draw.io 31.x uses aiGlobals/aiConfigs/aiModels + enableAi
    enableAi: boolean;
    aiGlobals: Record<string, unknown>;
    aiConfigs: Record<string, unknown>;
    aiModels: Array<{ name: string; model: string; config: string }>;
}

const DEFAULT_GPT_URL = "https://api.openai.com/v1/chat/completions";

function toFullChatCompletionsUrl(baseUrl: string): string {
    if (!baseUrl) return DEFAULT_GPT_URL;
    const trimmed = baseUrl.replace(/\/+$/, "");
    if (trimmed.includes("chat/completions") || trimmed.includes("generateContent") || trimmed.includes("v1/messages")) return trimmed;
    if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`;
    // SiYuan 3.8 stores bare host like https://api.deepseek.com -> need /v1/chat/completions
    return `${trimmed}/v1/chat/completions`;
}

export class SiyuanAiProvider {
    async fetchSiyuanAiConfig(): Promise<SiyuanAiConfig | null> {
        try {
            const res = await fetchSyncPost("/api/setting/getAI", {});
            // siyuan returns { code, data: { Provider, OpenAI } } when via fetchSyncPost? 
            // fetchSyncPost resolves to IWebSocketData with data field
            // When mocked, res may already be the data object
            if (res && typeof res === "object" && "data" in res) {
                const data = (res as { data: unknown }).data as SiyuanAiConfig;
                if (data && typeof data.Provider === "string") return data;
            }
            if (res && typeof res === "object" && "Provider" in res) {
                return res as SiyuanAiConfig;
            }
            return null;
        } catch {
            // fallback to window.siyuan.config.ai if available (for tests / offline)
            try {
                const win = window as unknown as { siyuan?: { config?: { ai?: SiyuanAiConfig } } };
                if (win.siyuan?.config?.ai) return win.siyuan.config.ai;
            } catch {}
            return null;
        }
    }

    private extractFromConfig(cfg: SiyuanAiConfig | null): { apiKey: string; model: string; baseUrl: string } | null {
        if (!cfg) return null;
        // legacy single-provider shape (pre-3.8)
        if (cfg.OpenAI?.APIKey) {
            return { apiKey: cfg.OpenAI.APIKey, model: cfg.OpenAI.APIModel || "gpt-4o-mini", baseUrl: cfg.OpenAI.APIBaseURL || DEFAULT_GPT_URL };
        }
        // new 3.8+ providers array
        if (Array.isArray(cfg.providers)) {
            const p = cfg.providers.find((x) => x.enabled && x.apiKey) || cfg.providers.find((x) => x.apiKey);
            if (p?.apiKey) {
                const m = p.models?.find((x) => x.enabled) || p.models?.[0];
                return { apiKey: p.apiKey, model: m?.name || "gpt-4o-mini", baseUrl: p.baseURL || DEFAULT_GPT_URL };
            }
        }
        // fallback: read from window.siyuan.config.ai when fetched via window fallback already contains providers
        return null;
    }

    async getAiConfigForDrawio(): Promise<DrawioAiInjection | null> {
        let cfg = await this.fetchSiyuanAiConfig();
        // also try window fallback for 3.8 shape if fetch returned null (e.g. /api/setting/getAI not available)
        if (!cfg) {
            try {
                const win = window as unknown as { siyuan?: { config?: { ai?: SiyuanAiConfig } } };
                if (win.siyuan?.config?.ai) cfg = win.siyuan.config.ai as SiyuanAiConfig;
            } catch {}
        }
        const extracted = this.extractFromConfig(cfg);
        if (!extracted) return null;
        const { apiKey, model, baseUrl } = extracted;

        const fullUrl = toFullChatCompletionsUrl(baseUrl);
        // Map to new draw.io 31.x aiConfigs shape (gpt) — aiGlobals.create/update 复用上游 Editor.aiGlobals 默认值，不在此硬编码
        return {
            gptApiKey: apiKey,
            gptUrl: fullUrl,
            gptModel: model,
            enableAi: true,
            aiGlobals: {
                gptApiKey: apiKey,
            },
            aiConfigs: {
                gpt: {
                    apiKey: "gptApiKey",
                    endpoint: fullUrl,
                    requestHeaders: {
                        Authorization: "Bearer {apiKey}",
                    },
                    request: {
                        model: "{model}",
                        messages: [
                            { role: "system", content: "{action}" },
                            { role: "user", content: "{prompt}" },
                        ],
                    },
                    responsePath: "$.choices[0].message.content",
                },
            },
            aiModels: [
                { name: model, model, config: "gpt" },
            ],
        };
    }
}

export class FakeSiyuanAiProvider extends SiyuanAiProvider {
    constructor(private fakeConfig: SiyuanAiConfig | null) {
        super();
    }
    override async fetchSiyuanAiConfig(): Promise<SiyuanAiConfig | null> {
        return this.fakeConfig;
    }
}
