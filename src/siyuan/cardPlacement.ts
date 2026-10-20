/**
 * cardPlacement — 思源笔记卡片在 draw.io 画布上的落点。
 *
 * 交互是“跟随鼠标 → 点击落位”，所以这里只做两件事：
 * 1. 屏幕点 → 页面坐标。mxGraph 的 `view.getTranslate()` 是页面原点在内容坐标系
 *    里的位置，不含滚动，滚动量必须单独加回来，否则滚动后落点会整体偏移。
 * 2. 按点击位置居中放置。用户点到哪就放到哪：这里不做页面夹取，
 *    否则点在页面边缘/页面外时卡片会跳到页面角上，和鼠标位置对不上。
 *
 * 纯函数，mxGraph 细节由调用方（client/SiyuanComponents.js）转换后传入。
 */

export interface PlacementViewport {
    scale: number;
    /** 页面原点在内容坐标系里的位置（mxGraph 的 view.getTranslate）。 */
    translate: { x: number; y: number };
    /** 容器滚动量。 */
    scroll: { left: number; top: number };
}

export interface PlacementSize {
    width: number;
    height: number;
}

export interface Placement {
    x: number;
    y: number;
}

/** 容器内的屏幕坐标（相对容器左上角）→ 页面坐标。 */
export function screenToGraph(point: { x: number; y: number }, viewport: PlacementViewport): { x: number; y: number } {
    return {
        x: (point.x + viewport.scroll.left - viewport.translate.x) / viewport.scale,
        y: (point.y + viewport.scroll.top - viewport.translate.y) / viewport.scale,
    };
}

/** 以点击点为中心算出卡片左上角；点在哪就放哪，不夹页面边界。 */
export function placementFromPoint(
    point: { x: number; y: number },
    viewport: PlacementViewport,
    size: PlacementSize,
): Placement {
    const center = screenToGraph(point, viewport);
    return {
        x: Math.round(center.x - size.width / 2),
        y: Math.round(center.y - size.height / 2),
    };
}
