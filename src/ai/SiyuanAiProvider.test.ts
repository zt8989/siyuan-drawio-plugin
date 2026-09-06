import { describe, it, expect } from "vitest";
import { FakeSiyuanAiProvider } from "./SiyuanAiProvider";

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
        expect((cfg?.aiConfigs as any).gpt.endpoint).toBe("https://api.deepseek.com");
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
