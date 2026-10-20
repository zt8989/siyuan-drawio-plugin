import { describe, it, expect } from "vitest";
import { placementFromPoint, screenToGraph } from "./cardPlacement";

const size = { width: 300, height: 220 };
const viewport = {
    scale: 1,
    translate: { x: 561, y: 601 },
    scroll: { left: 700, top: 900 },
};

describe("screenToGraph — 屏幕点换算必须带上滚动量", () => {
    it("滚动后的点换算为页面坐标", () => {
        // 相对容器的点 (292, 212) + 滚动 (700,900) - 原点 (561,601)
        expect(screenToGraph({ x: 292, y: 212 }, viewport)).toEqual({ x: 431, y: 511 });
    });

    it("缩放不为 1 时按比例换算", () => {
        expect(screenToGraph({ x: 400, y: 300 }, {
            scale: 2,
            translate: { x: 0, y: 0 },
            scroll: { left: 0, top: 0 },
        })).toEqual({ x: 200, y: 150 });
    });
});

describe("placementFromPoint — 点在哪就放哪", () => {
    it("卡片以点击点为中心", () => {
        const spot = placementFromPoint({ x: 292, y: 212 }, viewport, size);
        expect(spot).toEqual({ x: 281, y: 401 });
    });

    it("点击靠近页面左上角时不再夹到 (0,0)", () => {
        const spot = placementFromPoint({ x: 10, y: 10 }, {
            scale: 1,
            translate: { x: 561, y: 601 },
            scroll: { left: 700, top: 900 },
        }, size);
        expect(spot).toEqual({ x: -1, y: 199 });
    });

    it("点击在页面外也按点击位置放置，不跳到页面角上", () => {
        const spot = placementFromPoint({ x: 1200, y: 1400 }, {
            scale: 1,
            translate: { x: 0, y: 0 },
            scroll: { left: 0, top: 0 },
        }, size);
        expect(spot).toEqual({ x: 1050, y: 1290 });
    });

    it("点击在页面左上方（负坐标）同样保持位置", () => {
        const spot = placementFromPoint({ x: 100, y: 100 }, {
            scale: 1,
            translate: { x: 561, y: 601 },
            scroll: { left: 0, top: 0 },
        }, size);
        expect(spot).toEqual({ x: -611, y: -611 });
    });
});
