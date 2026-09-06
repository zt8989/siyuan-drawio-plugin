// Mock for "siyuan" package — types only in node_modules, no runtime entry.
// Used only for vitest unit tests via alias in vitest.config.ts.
// Keep minimal surface that src/api.ts imports.
export const fetchPost = (_url: string, _data: unknown, cb?: (data: unknown) => void) => {
    if (cb) cb(null);
};
export const fetchSyncPost = async (_url: string, _data: unknown) => ({ code: 0, data: null, msg: "" });
export type IWebSocketData = { code: number; data: unknown; msg: string };
export const Constants = {};
// Re-export everything else as no-op to avoid transform errors
export default {};
