/**
 * FileExportPatch — routes every local export the editor renders itself through the plugin
 * host, which asks for a destination with the system save dialog and writes the file
 * (issue #76).
 *
 * `EditorUi.prototype.saveLocalFile` is the single choke point for all of them: the image
 * export dialog (`exportImage → saveCanvas → saveData`), SVG, XML, HTML, JSON. Upstream ends
 * in `doSaveLocalFile`, which clicks an `<a download>`; SiYuan's Electron has no
 * `will-download` handler, so that download is dropped and the user gets no file at all
 * (probed: nothing on disk, no dialog, no error). This patch keeps upstream's rendering and
 * parameters and only changes the destination.
 *
 * Without a host that can save locally (mobile, browser) the original implementation runs
 * unchanged, so no platform gets worse than before.
 */

const SAVE_TIMEOUT_MS = 300000;

function newRequestId(prefix) {
    return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function messageOf(error) {
    return String((error && error.message) || error);
}

/** Text exports arrive as plain text; the host writes base64, so encode as UTF-8 here. */
function toBase64(data, base64Encoded) {
    if (base64Encoded) return String(data);

    const bytes = new TextEncoder().encode(String(data));
    let binary = '';

    // Chunked so a large SVG/XML export cannot blow the argument limit.
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }

    return btoa(binary);
}

export function installFileExportPatch(electron, capabilities) {
    // Diagnostic surface for end-to-end runs and bug reports: which route is active here.
    const diagnosis = { installed: false, reason: '', bundleVersion: process.env.VERSION };
    window.__fileExportPatch = diagnosis;

    if (!electron) {
        diagnosis.reason = 'no-bridge';
        return;
    }
    if (typeof EditorUi === 'undefined') {
        diagnosis.reason = 'no-editor-ui';
        return;
    }

    let saving = false;

    function saveViaHost(editorUi, data, filename, mimeType, base64Encoded) {
        if (saving) return;
        saving = true;

        const spinner = editorUi.spinner;
        if (spinner) spinner.spin(document.body, mxResources.get('exporting'));

        let settled = false;

        const finish = (result) => {
            if (settled) return;
            settled = true;
            saving = false;
            if (spinner) spinner.stop();
            clearTimeout(timer);

            if (result && result.status === 'error') {
                editorUi.handleError({ message: result.message || '导出失败' });
            }
            // 'saved' is reported by the plugin host (toast with the path); 'canceled' stays silent.
        };

        const timer = setTimeout(
            () => finish({ status: 'error', message: '导出超时：宿主没有响应' }),
            SAVE_TIMEOUT_MS,
        );

        try {
            electron.sendMessage(
                'exportFile',
                { filename: filename, mimeType: mimeType, data: toBase64(data, base64Encoded) },
                newRequestId('file'),
                finish,
            );
        } catch (e) {
            finish({ status: 'error', message: messageOf(e) });
        }
    }

    const origSaveLocalFile = EditorUi.prototype.saveLocalFile;

    EditorUi.prototype.saveLocalFile = function (data, filename, mimeType, base64Encoded) {
        const args = arguments;
        const self = this;

        capabilities.probe().then((caps) => {
            if (!caps.fileExport) {
                origSaveLocalFile.apply(self, args);
                return;
            }

            try {
                saveViaHost(self, data, filename, mimeType, base64Encoded);
            } catch (e) {
                self.handleError({ message: messageOf(e) });
            }
        });
    };

    // Warm the shared capability cache so the first export skips the old upstream path.
    capabilities.probe();

    diagnosis.installed = true;
}