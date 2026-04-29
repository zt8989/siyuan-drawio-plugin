import { resolve, dirname } from "path"
import { defineConfig, loadEnv } from "vite"
import { viteStaticCopy } from "vite-plugin-static-copy"
import livereload from "rollup-plugin-livereload"
import fg from 'fast-glob';
import { svelte } from '@sveltejs/vite-plugin-svelte'
import packageJson from './package.json'
import { readFileSync, writeFileSync, unlinkSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
export const version = packageJson.version

import vitePluginYamlI18n from './yaml-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const env = process.env;
const isSrcmap = env.VITE_SOURCEMAP === 'inline';
const isDev = env.NODE_ENV === 'development';

const outputDir = isDev ? "dev" : "dist"

console.log("isDev=>", isDev);
console.log("isSrcmap=>", isSrcmap);
console.log("outputDir=>", outputDir);
console.log(resolve(__dirname, outputDir, "PostConfig.js"))

function postProcessClientFiles(dir: string) {
    const webappJsDir = path.join(dir, 'webapp', 'js');
    const webappDir = path.join(dir, 'webapp');

    if (!existsSync(webappJsDir)) mkdirSync(webappJsDir, { recursive: true });
    if (!existsSync(webappDir)) mkdirSync(webappDir, { recursive: true });

    // Wrap PostConfig/PreConfig with IIFE, keep originals for future rebuilds
    ['PostConfig.js', 'PreConfig.js'].forEach(file => {
        const src = path.join(dir, file);
        if (!existsSync(src)) return;
        const content = readFileSync(src, 'utf8');
        const wrapped = `(function() {\n${content}\n})();`;
        writeFileSync(path.join(webappJsDir, file), wrapped);
        console.log(`[auto-copy] Wrapped: ${src} -> ${webappJsDir}/${file}`);
    });

    // Copy embed files
    ['embed.html', 'embed2.js'].forEach(file => {
        const src = path.join("client", file);
        if (!existsSync(src)) { console.log(`[auto-copy] Missing: ${src}`); return; }
        copyFileSync(src, path.join(webappDir, file));
        console.log(`[auto-copy] Copied: ${src} -> ${webappDir}/${file}`);
    });
}

export default defineConfig({
    resolve: {
        alias: {
            "@": resolve(__dirname, "src"),
        }
    },

    plugins: [
        svelte(),

        vitePluginYamlI18n({
            inDir: 'public/i18n',
            outDir: `${outputDir}/i18n`
        }),

        viteStaticCopy({
            targets: [
                { src: "./README*.md", dest: "./" },
                { src: "./plugin.json", dest: "./" },
                { src: "./preview.png", dest: "./" },
                { src: "./icon.png", dest: "./" },
            ],
        }),

        {
            name: 'auto-copy-client',
            closeBundle() {
                if (isDev) {
                    postProcessClientFiles(outputDir);
                }
            },
        },
    ],

    define: {
        "process.env.DEV_MODE": JSON.stringify(isDev),
        "process.env.NODE_ENV": JSON.stringify(env.NODE_ENV),
        "process.env.VERSION": JSON.stringify(version)
    },

    build: {
        outDir: outputDir,
        emptyOutDir: false,
        minify: !isDev,
        sourcemap: isSrcmap ? 'inline' : false,

        lib: {
            entry: {
                index: resolve(__dirname, "src/index.ts"),
                PostConfig: resolve(__dirname, "client/PostConfig.js"),
                PreConfig: resolve(__dirname, "client/PreConfig.js"),
            },
            fileName: (fromat, entryName) => `${entryName}.js`,
            formats: ["cjs"],
        },
        rollupOptions: {
            plugins: [
                ...(isDev ? [
                    livereload(outputDir),
                    {
                        name: 'watch-external',
                        async buildStart() {
                            const files = await fg([
                                'public/i18n/**',
                                './README*.md',
                                './plugin.json',
                                './client/*.js',
                                './client/*.html',
                            ]);
                            for (let file of files) {
                                this.addWatchFile(file);
                            }
                        }
                    }
                ] : [
                ])
            ],

            external: ["siyuan", "process"],

            output: {
                entryFileNames: "[name].js",
                assetFileNames: (assetInfo) => {
                    if (assetInfo.name === "style.css") {
                        return "index.css"
                    }
                    return assetInfo.name
                },
            },
        },
    }
})
