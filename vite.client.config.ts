import { resolve, dirname } from "path"
import { defineConfig } from "vite"
import { fileURLToPath } from 'url';
import { copyFileSync, existsSync } from 'fs';
import path from 'path';
import fg from 'fast-glob';
import packageJson from './package.json'

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const env = process.env;
const isSrcmap = env.VITE_SOURCEMAP === 'inline';
const isDev = env.NODE_ENV === 'development';
const outputDir = isDev ? "dev" : "dist"
const webappJsDir = resolve(__dirname, outputDir, "webapp", "js")
const version = packageJson.version

console.log("[client] isDev=>", isDev, "isSrcmap=>", isSrcmap, "outputDir=>", outputDir)

// Client bundle directly as IIFE – Vite/Rollup generates correct sourcemap,
// no manual `(function(){...})()` wrapping that breaks mapping.
// IIFE does not support multiple entries in one build, so we build one entry at a time
// via CLIENT_ENTRY env (PreConfig / PostConfig). If not set, default to PreConfig.
const clientEntry = (env as Record<string, string | undefined>).CLIENT_ENTRY || "PreConfig";
const entryMap: Record<string, string> = {
    PreConfig: "client/PreConfig.js",
    PostConfig: "client/PostConfig.js",
};
const entryPath = entryMap[clientEntry] || entryMap.PreConfig;
const entryName = clientEntry;

export default defineConfig({
    resolve: {
        alias: {
            "@": resolve(__dirname, "src"),
        },
    },
    plugins: [
        {
            name: 'copy-client-embed',
            // Only copy embed files once (when building PreConfig) to avoid duplicate log
            closeBundle() {
                if (entryName !== "PreConfig") return;
                const webappDir = resolve(__dirname, outputDir, "webapp");
                ['embed.html', 'embed2.js'].forEach(file => {
                    const src = path.join("client", file);
                    if (!existsSync(src)) { console.log(`[client:${entryName}] Missing: ${src}`); return; }
                    copyFileSync(src, path.join(webappDir, file));
                    console.log(`[client:${entryName}] Copied: ${src} -> ${webappDir}/${file}`);
                });
            },
        },
        {
            name: 'watch-client-external',
            async buildStart() {
                if (!isDev) return;
                const files = await fg(['client/**/*.{js,html}']);
                for (const file of files) this.addWatchFile(file);
            },
        },
    ],
    define: {
        "process.env.DEV_MODE": JSON.stringify(isDev),
        "process.env.NODE_ENV": JSON.stringify(env.NODE_ENV),
        "process.env.VERSION": JSON.stringify(version)
    },
    build: {
        outDir: webappJsDir,
        emptyOutDir: false,
        minify: !isDev,
        sourcemap: isSrcmap ? 'inline' : false,
        lib: {
            entry: { [entryName]: resolve(__dirname, entryPath) },
            fileName: (_format, n) => `${n}.js`,
            formats: ["iife"],
            name: `_drawio_${entryName}`,
        },
        rollupOptions: {
            external: [],
            output: { extend: true },
        },
    },
})
