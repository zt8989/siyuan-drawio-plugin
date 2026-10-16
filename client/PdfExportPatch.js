/**
 * PdfExportPatch — reroutes every PDF export entry of the draw.io editor from the public
 * conversion service to the plugin host, which renders and prints the PDF on this machine
 * (issue #75).
 *
 * Upstream has three ways into a PDF, all of which end in a request to `EXPORT_URL`
 * (convert.diagrams.net): the print/preview dialog (`导出为 → PDF...`), the export dialog
 * (`导出为 → 高级...`) and the shared `saveRequest` destination picker. SiYuan's Electron
 * window handler turns the new window that the service path opens into
 * `shell.openExternal`, so the user only ever saw the converter's page and nothing was
 * downloaded. This patch keeps upstream's parameter building (`downloadRequestBuilder`,
 * the export-dialog arguments) and redirects only the destination through the existing
 * bridge: capability probe → `exportPdf` request → callback.
 *
 * Without a host that can export locally (mobile, browser) every original implementation
 * runs unchanged, so no platform gets worse than before.
 */

// The native save dialog is part of this round trip: a user reading it for a minute must not
// be reported as a timeout.
const EXPORT_TIMEOUT_MS = 300000;

function newRequestId(prefix) {
    return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function messageOf(error) {
    return String((error && error.message) || error);
}

function parseExtras(extras) {
    if (extras && typeof extras === 'object') return extras;
    if (typeof extras !== 'string' || extras.length === 0) return undefined;
    try {
        return JSON.parse(extras);
    } catch (e) {
        return undefined;
    }
}

export function installPdfExportPatch(electron, capabilities) {
    // Diagnostic surface for end-to-end runs and bug reports: which route is active here.
    const diagnosis = { installed: false, reason: "", bundleVersion: process.env.VERSION };
    window.__pdfExportPatch = diagnosis;

    // Nothing to patch without the bridge or the drawio editor globals.
    if (!electron) {
        diagnosis.reason = "no-bridge";
        return;
    }
    if (typeof ExportDialog === "undefined") {
        diagnosis.reason = "no-export-dialog";
        return;
    }
    if (typeof EditorUi === "undefined") {
        diagnosis.reason = "no-editor-ui";
        return;
    }

    let exporting = false;

    /** Cached host capability (shared with the local-save patch, see ExportCapabilities.js). */
    function pdfCapability() {
        const cached = capabilities.cached();
        return cached ? !!cached.pdfExport : null;
    }

    function probe() {
        return capabilities.probe().then((caps) => !!caps.pdfExport);
    }

    function currentTitle(editorUi, fallback) {
        const file = editorUi.getCurrentFile();
        return (file && file.getTitle && file.getTitle()) || fallback || editorUi.defaultFilename;
    }

    /** Sends the request to the host and reports failures in the editor. */
    function startExport(editorUi, request) {
        if (exporting) return;

        exporting = true;
        // mxSpinner.spin() returns the spinner element, not the spinner itself.
        const spinner = editorUi.spinner;
        if (spinner) spinner.spin(document.body, mxResources.get('exporting'));
        let settled = false;

        const finish = (result) => {
            if (settled) return;
            settled = true;
            exporting = false;
            if (spinner) spinner.stop();
            clearTimeout(timer);

            if (result && result.status === 'error') {
                editorUi.handleError({ message: result.message || 'PDF 导出失败' });
            }
            // 'saved' is reported by the plugin host (toast with the path); 'canceled' stays silent.
        };

        const timer = setTimeout(() => finish({ status: 'error', message: 'PDF 导出超时：宿主没有响应' }), EXPORT_TIMEOUT_MS);

        try {
            electron.sendMessage('exportPdf', request, newRequestId('pdf'), finish);
        } catch (e) {
            finish({ status: 'error', message: messageOf(e) });
        }
    }

    /** Print-dialog / menu path: parameters come from upstream's own request builder. */
    function requestFromDownloadParams(editorUi, params) {
        return {
            format: 'pdf',
            xml: params.xml,
            title: currentTitle(editorUi, params.filename),
            filename: params.filename,
            allPages: params.allPages,
            from: params.from,
            to: params.to,
            scale: params.scale,
            border: params.border,
            bg: params.bg,
            pageMargin: params.pageMargin,
            crop: params.crop,
            fit: params.fit,
            w: params.w,
            h: params.h,
            sheetsAcross: params.sheetsAcross,
            sheetsDown: params.sheetsDown,
            shadows: params.shadows,
            icons: params.icons,
            extras: parseExtras(params.extras),
        };
    }

    /** Export-dialog path: same parameters the draw.io desktop build sends to its main process. */
    function requestFromDialog(editorUi, name, bg, scale, border, dpi, grid) {
        const graph = editorUi.editor.graph;
        const bounds = graph.getGraphBounds();
        const extras = { globalVars: graph.getExportVariables() };

        if (grid) {
            extras.grid = { size: graph.gridSize, steps: graph.view.gridSteps, color: graph.view.gridColor };
        }

        if (Graph.translateDiagram) {
            extras.diagramLanguage = Graph.diagramLanguage;
        }

        return {
            format: 'pdf',
            xml: editorUi.getFileData(true, null, null, null, null, true),
            title: currentTitle(editorUi, name),
            filename: name,
            allPages: '1',
            scale: scale,
            border: border,
            bg: bg == null ? mxConstants.NONE : bg,
            dpi: dpi,
            w: Math.floor(bounds.width * scale / graph.view.scale),
            h: Math.floor(bounds.height * scale / graph.view.scale),
            extras: extras,
        };
    }

    /**
     * Stands in for the mxXmlRequest upstream would post to the conversion service.
     * `saveRequest` only ever calls one of these two methods depending on the target mode;
     * device mode (forced by the plugin) calls simulate().
     */
    function localPdfRequest(editorUi, params) {
        const start = () => startExport(editorUi, requestFromDownloadParams(editorUi, params));

        return {
            simulate: start,
            send: () => {
                throw new Error('本机 PDF 导出不支持该保存方式');
            },
            getStatus: () => 200,
            getText: () => '',
        };
    }

    const origExportFile = ExportDialog.exportFile;
    const origCreateDownloadRequest = EditorUi.prototype.createDownloadRequest;
    const origSaveRequest = EditorUi.prototype.saveRequest;

    ExportDialog.exportFile = function (editorUi, name, format, bg, s, b, dpi, grid) {
        const args = arguments;

        if (format !== 'pdf') {
            return origExportFile.apply(ExportDialog, args);
        }

        probe().then((canExport) => {
            if (!canExport) {
                origExportFile.apply(ExportDialog, args);
                return;
            }

            try {
                editorUi.hideDialog();
                startExport(editorUi, requestFromDialog(editorUi, name, bg, s, b, dpi, grid));
            } catch (e) {
                editorUi.handleError({ message: messageOf(e) });
            }
        });
    };

    EditorUi.prototype.createDownloadRequest = function (filename, format) {
        const args = arguments;

        // Only the host's local renderer replaces the service request; everywhere else
        // (mobile, browser, capability not yet known) upstream runs unchanged.
        if (format !== 'pdf' || pdfCapability() !== true) {
            return origCreateDownloadRequest.apply(this, args);
        }

        // Upstream's builder owns the export parameters (pages, scale, extras, grid, …);
        // only the transport changes.
        return localPdfRequest(this, this.downloadRequestBuilder.apply(this, args));
    };

    EditorUi.prototype.saveRequest = function (filename, format) {
        // Device mode is forced by the plugin, so the destination picker upstream shows here
        // would be redundant: the host asks for the destination with the native dialog.
        if (format !== 'pdf' || pdfCapability() !== true || typeof arguments[2] !== 'function') {
            return origSaveRequest.apply(this, arguments);
        }

        const xhr = arguments[2](filename, '0');
        if (xhr != null && xhr.simulate != null) {
            xhr.simulate(document, '_blank');
        }
    };

    // Warm the capability cache so the first export skips the redundant destination picker.
    probe();

    diagnosis.installed = true;
}