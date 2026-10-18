/**
 * ExportCapabilities — one capability probe shared by the export patches (issues #75, #76).
 *
 * The plugin host answers `getCapabilities` with `{pdfExport, fileExport, print}`; the PDF patch,
 * the local-save patch and the print patch need the same answer, so the probe lives here
 * instead of in each of them. A timeout is *not* cached: a permanent "no" would silently send
 * every later export back to the broken upstream path (conversion service / dropped download).
 */

const PROBE_TIMEOUT_MS = 3000;

export function createExportCapabilities(electron) {
    let cached = null;
    let pending = null;

    function probeOnce() {
        return new Promise((resolve) => {
            let settled = false;

            const finish = (capabilities, cache) => {
                if (settled) return;
                settled = true;
                if (cache) cached = capabilities;
                resolve(capabilities);
            };

            try {
                electron.sendMessage('getCapabilities', null, 'caps-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), (caps) => {
                    finish({
                        pdfExport: !!(caps && caps.pdfExport),
                        fileExport: !!(caps && caps.fileExport),
                        print: !!(caps && caps.print),
                    }, true);
                });
            } catch (e) {
                finish({ pdfExport: false, fileExport: false, print: false }, true);
                return;
            }

            setTimeout(() => finish({ pdfExport: false, fileExport: false, print: false }, false), PROBE_TIMEOUT_MS);
        });
    }

    return {
        /** Resolves the host capabilities, reusing the cached answer when there is one. */
        probe() {
            if (cached) return Promise.resolve(cached);

            if (!pending) {
                pending = probeOnce().then((capabilities) => {
                    if (!cached) pending = null; // transient failure: allow a retry
                    return capabilities;
                });
            }

            return pending;
        },

        /** Synchronous snapshot for callers that must decide before awaiting (null until probed). */
        cached() {
            return cached;
        },
    };
}