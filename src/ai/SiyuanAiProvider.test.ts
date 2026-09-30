import { describe, it, expect } from "vitest";
import { FakeSiyuanAiProvider } from "./SiyuanAiProvider";

/** Build a SiYuan 3.8+ config with a single enabled provider and read back the injected endpoint. */
async function endpointFor(baseURL: string): Promise<string | undefined> {
    const p = new FakeSiyuanAiProvider({
        providers: [
            {
                id: "1",
                enabled: true,
                apiKey: "k",
                baseURL,
                models: [{ id: "m", name: "model", enabled: true }],
            },
        ],
    } as any);
    const cfg = await p.getAiConfigForDrawio();
    return (cfg?.aiConfigs as any)?.gpt?.endpoint;
}

describe("SiyuanAiProvider", () => {
    it("returns null when no provider configured (Clipboard fallback)", async () => {
        const p = new FakeSiyuanAiProvider(null);
        expect(await p.getAiConfigForDrawio()).toBeNull();
    });

    it("maps legacy OpenAI config to draw.io aiConfigs", async () => {
        const p = new FakeSiyuanAiProvider({
            Provider: "OpenAI",
            OpenAI: { APIKey: "sk-test", APIModel: "gpt-4o", APIBaseURL: "https://api.openai.com/v1/chat/completions" },
        } as any);
        const cfg = await p.getAiConfigForDrawio();
        expect(cfg?.enableAi).toBe(true);
        expect(cfg?.gptApiKey).toBe("sk-test");
        expect(cfg?.aiModels[0].model).toBe("gpt-4o");
        expect((cfg?.aiConfigs as any).gpt.endpoint).toBe("https://api.openai.com/v1/chat/completions");
    });

    it("maps new providers[] shape (SiYuan 3.8+) to draw.io", async () => {
        const p = new FakeSiyuanAiProvider({
            providers: [
                {
                    id: "20260906152649-v165lks",
                    displayName: "DeepSeek",
                    enabled: true,
                    apiKey: "deepseek-key",
                    baseURL: "https://api.deepseek.com",
                    protocol: "openai",
                    models: [{ id: "20260906152649-8q6zy5u", enabled: true, name: "deepseek-v4-flash" }],
                },
            ],
        } as any);
        const cfg = await p.getAiConfigForDrawio();
        expect(cfg?.gptApiKey).toBe("deepseek-key");
        expect(cfg?.aiModels[0].name).toBe("deepseek-v4-flash");
        // SiYuan 3.8 stores a bare host, but draw.io POSTs straight to `endpoint`
        // (its own default is Editor.gptUrl = "https://api.openai.com/v1/chat/completions"),
        // so the plugin must hand it a complete chat-completions URL.
        expect((cfg?.aiConfigs as any).gpt.endpoint).toBe("https://api.deepseek.com/v1/chat/completions");
        expect(cfg?.gptUrl).toBe((cfg?.aiConfigs as any).gpt.endpoint);
    });

    it("picks first enabled provider when multiple", async () => {
        const p = new FakeSiyuanAiProvider({
            providers: [
                { id: "1", enabled: false, apiKey: "old", baseURL: "https://old", models: [{ id: "m1", name: "old-model", enabled: true }] },
                { id: "2", enabled: true, apiKey: "new-key", baseURL: "https://new", models: [{ id: "m2", name: "new-model", enabled: true }] },
            ],
        } as any);
        const cfg = await p.getAiConfigForDrawio();
        expect(cfg?.gptApiKey).toBe("new-key");
        expect(cfg?.aiModels[0].model).toBe("new-model");
    });
});

/**
 * The full normalization contract now lives in `drawioAiEndpoint.test.ts`, which owns
 * that behaviour. This only asserts the seam: whatever SiYuan stored is handed to the
 * shared normalizer, so draw.io receives a POSTable URL.
 * Verified against a live app: SiYuan 3.8 stores "https://api.deepseek.com" and the
 * injected endpoint is "https://api.deepseek.com/v1/chat/completions".
 */
describe("SiyuanAiProvider — endpoint normalization seam", () => {
    it("normalizes a bare SiYuan 3.8 host through the shared normalizer", async () => {
        expect(await endpointFor("https://api.deepseek.com")).toBe("https://api.deepseek.com/v1/chat/completions");
    });

    it("passes an already-complete endpoint through unchanged", async () => {
        expect(await endpointFor("https://api.openai.com/v1/chat/completions")).toBe(
            "https://api.openai.com/v1/chat/completions",
        );
    });

    it("falls back to the OpenAI default when no baseURL is stored", async () => {
        expect(await endpointFor("")).toBe("https://api.openai.com/v1/chat/completions");
    });
});
