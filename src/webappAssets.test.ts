import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Regression guard for issue #66 — "其他 → 数学排版 后整个绘图界面无法使用".
 *
 * drawio loads MathJax from `${window.DRAW_MATH_URL}/startup.js` (see Editor.initMath in
 * webapp/js/app.min.js) and takes its font directory from `${DRAW_MATH_URL}/fonts`.
 * When that path 404s, drawio still sees a truthy `window.MathJax` (it is only the config
 * object), so the math menu item is registered — but `MathJax.typeset` never becomes a
 * function. `Editor.MathJaxRender` then only enqueues, `Editor.onMathJaxDone` never fires,
 * and the graph container is left with `visibility: hidden` forever: the canvas is dead.
 *
 * `client/PreConfig.js` pinned the MathJax v3 path `math/es5`, which drawio removed in
 * 29.0.2 (MathJax v4 moved to `math4/es5`). These tests fail loudly if the configured path
 * stops existing in the drawio submodule again.
 */

const repoRoot = process.cwd();
const webappSrcDir = path.join(repoRoot, "drawio", "src", "main", "webapp");
const preConfigPath = path.join(repoRoot, "client", "PreConfig.js");
const preConfig = fs.readFileSync(preConfigPath, "utf8");

/** `window.DRAWIO_BASE_URL = '...'` literal. */
function readDrawioBaseUrl(): string {
    const match = /window\.DRAWIO_BASE_URL\s*=\s*["']([^"']+)["']/.exec(preConfig);
    if (!match) throw new Error("client/PreConfig.js no longer sets window.DRAWIO_BASE_URL");
    return match[1];
}

/**
 * Resolve the effective value of `window.DRAW_MATH_URL` the same way the browser would,
 * supporting both a bare literal and `window.DRAWIO_BASE_URL + '<suffix>'`.
 */
function resolveMathUrl(baseUrl: string): string {
    const match = /window\.DRAW_MATH_URL\s*=\s*([^;]+);/.exec(preConfig);
    if (!match) throw new Error("client/PreConfig.js no longer sets window.DRAW_MATH_URL");
    const expression = match[1].trim();
    const literals = [...expression.matchAll(/["']([^"']*)["']/g)].map((m) => m[1]).join("");
    return expression.includes("DRAWIO_BASE_URL") ? baseUrl + literals : literals;
}

/** Turn a `/plugins/<plugin>/webapp/<rest>` URL back into a path inside the webapp source. */
function toWebappPath(url: string, baseUrl: string): string {
    expect(url.startsWith(baseUrl), `DRAW_MATH_URL must be absolute and rooted at ${baseUrl}, got "${url}"`).toBe(true);
    return path.join(webappSrcDir, url.slice(baseUrl.length));
}

describe("drawio webapp asset paths referenced by client/PreConfig.js", () => {
    const baseUrl = readDrawioBaseUrl();
    const mathUrl = resolveMathUrl(baseUrl);

    it("points DRAW_MATH_URL at the MathJax directory that drawio actually ships", () => {
        const mathDir = toWebappPath(mathUrl, baseUrl);

        expect(
            fs.existsSync(mathDir),
            `DRAW_MATH_URL resolves to "${mathUrl}" -> ${mathDir}, which does not exist in the drawio submodule. ` +
                `MathJax v3's "math/es5" was removed in drawio 29.0.2; MathJax v4 lives in "math4/es5".`,
        ).toBe(true);

        expect(fs.existsSync(path.join(mathDir, "startup.js")), `${mathDir} is missing startup.js`).toBe(true);
        expect(fs.existsSync(path.join(mathDir, "fonts")), `${mathDir} is missing the MathJax fonts directory`).toBe(true);
    });

    it("no longer references the removed MathJax v3 path", () => {
        expect(preConfig).not.toMatch(/DRAW_MATH_URL\s*=\s*["']math\//);
    });

    it("keeps DRAW_MATH_URL consistent with the directory copied into the plugin bundle", () => {
        const copyScript = fs.readFileSync(path.join(repoRoot, "scripts", "copy_webapp_build.js"), "utf8");
        const copiedItems = [...copyScript.matchAll(/^\s*"([^"]+\/)"[,]?$/gm)].map((m) => m[1]);

        // The first path segment of the MathJax dir (e.g. "math4") must be copied.
        const relativeMathUrl = mathUrl.startsWith(baseUrl) ? mathUrl.slice(baseUrl.length) : mathUrl;
        const mathTopLevel = relativeMathUrl.split("/")[0] + "/";
        expect(
            copiedItems,
            `${mathTopLevel} must be listed in scripts/copy_webapp_build.js copyItems, otherwise ${mathUrl} 404s in the built plugin`,
        ).toContain(mathTopLevel);
    });
});
/**
 * Regression guard for issue #75 — the local PDF export page.
 *
 * The hidden export window loads `client/pdf-export.html`, which is not an upstream drawio page:
 * it exists so the page can inject the `window.electron` bridge *before* upstream `export.js`
 * runs. Two ways it can silently break in a release: a referenced upstream asset is not shipped,
 * or the page itself is not copied into the built webapp. Both are asserted here.
 */
describe("local PDF export page (issue #75)", () => {
    const exportPagePath = path.join(repoRoot, "client", "pdf-export.html");
    const exportBridge = "pdfExportPageBridge.js";
    const exportPage = fs.readFileSync(exportPagePath, "utf8");
    const referencedAssets = [...exportPage.matchAll(/(?:src|href)="([^"]+)"/g)]
        .map((m) => m[1])
        .filter((p) => !/^(https?:)?\/\//.test(p));

    it("loads the bridge before the upstream export script that needs window.electron", () => {
        const bridgeAt = exportPage.indexOf(exportBridge);
        const exportJsAt = exportPage.indexOf("js/export.js");

        expect(bridgeAt, "pdf-export.html must load its bridge").toBeGreaterThan(-1);
        expect(exportJsAt, "pdf-export.html must load the upstream export.js").toBeGreaterThan(-1);
        expect(bridgeAt).toBeLessThan(exportJsAt);
    });

    it("keeps the upstream print CSS that paginates the PDF", () => {
        expect(exportPage).toMatch(/@media\s+print/);
        expect(exportPage).toMatch(/page-break-after:\s*always/);
    });

    it("references only assets the drawio webapp actually ships", () => {
        expect(referencedAssets.length).toBeGreaterThan(3);

        for (const asset of referencedAssets) {
            const isBridge = asset === exportBridge;
            const target = isBridge ? path.join(repoRoot, "client", asset) : path.join(webappSrcDir, asset);
            expect(fs.existsSync(target), `${asset} referenced by pdf-export.html is missing (${target})`).toBe(true);
        }
    });

    it("copies the export page and its bridge into the built webapp (dev and dist)", () => {
        const clientConfig = fs.readFileSync(path.join(repoRoot, "vite.client.config.ts"), "utf8");
        const bundleScript = fs.readFileSync(path.join(repoRoot, "scripts", "copy_and_bundle_build.js"), "utf8");

        for (const channel of [
            { name: "vite.client.config.ts", text: clientConfig },
            { name: "scripts/copy_and_bundle_build.js", text: bundleScript },
        ]) {
            for (const file of ["pdf-export.html", exportBridge]) {
                expect(channel.text, `${file} must be copied by ${channel.name}`).toContain(file);
            }
        }
    });
});
