import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['e2e/**/*.test.ts'],
        testTimeout: 30000,
        hookTimeout: 30000,
        environment: 'node',
        globals: false,
        reporters: ['verbose'],
        // run in sequence to avoid parallel CDP contention
        sequence: { concurrent: false },
        // Every e2e file drives the same running SiYuan editor over CDP. Vitest's default is to
        // run files in parallel workers, which makes them fight over the same menubar, dialogs
        // and tabs (probed: two files interleaved their 文件 → 导出为 clicks and both timed out).
        // One editor ⇒ one file at a time.
        fileParallelism: false,
    },
});
