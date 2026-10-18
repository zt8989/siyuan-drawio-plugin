/**
 * PrintPatch — reroutes 文件 → 打印 (Ctrl+P) from upstream's print-preview window to the
 * plugin host, which renders the pages in its own export page and opens the system print
 * dialog (the same renderer the local PDF export uses, issue #75).
 *
 * Upstream prints by opening a new browser window (mxPrintPreview) and calling print() on it.
 * SiYuan's Electron window handler refuses new windows, so the preview window is never created
 * and the editor ends in "更新预览出错。" instead of a printer. The draw.io desktop build prints
 * from its main process for exactly this reason; in this plugin the host takes that role.
 *
 * Without a host that can render locally (mobile, browser) the original implementation runs
 * unchanged, so no platform gets worse than before.
 */

// The system print dialog is part of this round trip: a user choosing a printer must not be
// reported as a timeout.
const PRINT_TIMEOUT_MS = 300000;

function newRequestId(prefix) {
    return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function messageOf(error) {
    return String((error && error.message) || error);
}

export function installPrintPatch(electron, capabilities) {
    // Diagnostic surface for end-to-end runs and bug reports: which route is active here.
    const diagnosis = { installed: false, reason: "", bundleVersion: process.env.VERSION };
    window.__printPatch = diagnosis;

    // Nothing to patch without the bridge or the drawio editor globals.
    if (!electron) {
        diagnosis.reason = "no-bridge";
        return;
    }
    if (typeof EditorUi === "undefined") {
        diagnosis.reason = "no-editor-ui";
        return;
    }

    let printing = false;

    /** Cached host capability (shared with the export patches, see ExportCapabilities.js). */
    function printCapability() {
        const cached = capabilities.cached();
        return cached ? !!cached.print : null;
    }

    function probe() {
        return capabilities.probe().then((caps) => !!caps.print);
    }

    function currentTitle(editorUi) {
        const file = editorUi.getCurrentFile();
        return (file && file.getTitle && file.getTitle()) || editorUi.defaultFilename;
    }

    /**
     * Print-dialog arguments → the render vocabulary the host's export page understands.
     * Mirrors the draw.io desktop build's electronPrint() request, which is the reference
     * implementation of "print" for an Electron host.
     */
    function requestFromPrintArgs(editorUi, args, preview) {
        const graph = editorUi.editor.graph;
        const file = editorUi.getCurrentFile();

        if (file && file.updateFileData) {
            file.updateFileData();
        }

        const extras = { globalVars: graph.getExportVariables() };

        if (args.grid) {
            extras.grid = {
                size: graph.gridSize,
                steps: graph.view.gridSteps,
                color: graph.view.gridColor,
            };
        }

        if (Graph.translateDiagram) {
            extras.diagramLanguage = Graph.diagramLanguage;
        }

        // Hidden tags per page, the same way the export paths forward them.
        const hiddenTags = editorUi.getHiddenTagsMap && editorUi.getHiddenTagsMap();
        if (hiddenTags != null) {
            extras.hiddenTags = hiddenTags;
        }

        return {
            format: 'pdf',
            xml: editorUi.getFileData(true, null, null, null, !args.selection, false, null, null, null, false, true),
            title: currentTitle(editorUi),
            preview: preview === true,
            allPages: args.allPages,
            from: args.pagesFrom - 1,
            to: args.pagesTo - 1,
            scale: args.scale,
            // The dialog's "边框" is the page margin, as on the export path.
            pageMargin: args.border,
            crop: args.crop,
            fit: args.fit,
            sheetsAcross: args.sheetsAcross,
            sheetsDown: args.sheetsDown,
            shadows: args.shadows,
            icons: args.icons,
            extras: extras,
        };
    }

    /** Sends the request to the host and reports failures in the editor. */
    function startPrint(editorUi, request) {
        if (printing) return;

        printing = true;
        const spinner = editorUi.spinner;
        if (spinner) spinner.spin(document.body, mxResources.get('updatingPreview'));
        let settled = false;

        const finish = (result) => {
            if (settled) return;
            settled = true;
            printing = false;
            if (spinner) spinner.stop();
            clearTimeout(timer);

            if (result && result.status === 'error') {
                editorUi.handleError({ message: result.message || '打印失败' });
            }
            // 'printed' / 'previewed' need no message: the user just saw the printer dialog or
            // the preview window; 'canceled' stays silent.
        };

        const timer = setTimeout(() => finish({ status: 'error', message: '打印超时：宿主没有响应' }), PRINT_TIMEOUT_MS);

        try {
            electron.sendMessage('printDiagram', request, newRequestId('print'), finish);
        } catch (e) {
            finish({ status: 'error', message: messageOf(e) });
        }
    }

    // Only the print/preview route of the print dialog (fn == null) reaches this method; the
    // PDF export dialog has its own callback and is handled by PdfExportPatch.
    const origPrint = EditorUi.prototype.print;

    EditorUi.prototype.print = function (preview, args) {
        // Anywhere else (mobile, browser, capability not yet known) upstream runs unchanged.
        if (printCapability() !== true || !args) {
            return origPrint.apply(this, arguments);
        }

        try {
            startPrint(this, requestFromPrintArgs(this, args, preview === true));
        } catch (e) {
            this.handleError({ message: messageOf(e) });
        }

        return null;
    };

    // Warm the capability cache so the first print skips the upstream path.
    probe();

    diagnosis.installed = true;
}
