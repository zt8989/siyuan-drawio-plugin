import { defineConfig } from "vitest/config";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
    resolve: {
        alias: {
            "@": resolve(__dirname, "src"),
            "siyuan": resolve(__dirname, "src/mocks/siyuan.ts"),
        },
    },
    test: {
        include: ["src/**/*.test.ts"],
        environment: "node",
        globals: false,
        reporters: ["verbose"],
    },
});
