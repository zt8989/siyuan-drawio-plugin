/**
 * SiyuanComponents — 画布上的两个「思源笔记」组件：嵌入卡片与引用卡片。
 *
 * 嵌入（embed）：把笔记/标题章节正文（纯文本）放进一张可刷新的卡片形状。
 * 引用（reference）：一张链接卡片。
 * 两者都带 siyuan://blocks/<id> 链接：选中后 draw.io 在卡片下方显示根链接
 * （块 ID + 编辑/删除），点链接跳回思源。
 *
 * 与宿主的分工：这里不直接调 /api/*，也不生成 HTML 菜单；
 * 选笔记、读正文、跳转都经由 electron 桥回宿主（见 src/index.ts）。
 *
 * 消息名与 src/constants.ts 的 PICK_SIYUAN_NOTE / GET_SIYUAN_NOTES /
 * OPEN_SIYUAN_BLOCK / SHOW_MESSAGE 保持一致；client 侧按需内联，
 * 避免把 src/constants 的整张常量表拖进客户端 bundle。
 */

import { placementFromPoint } from "@/siyuan/cardPlacement";

// Electron.js 会给消息类型补上 "drawio_" 前缀，这里只写裸名。
const PICK_SIYUAN_NOTE = "pickSiyuanNote";
const GET_SIYUAN_NOTES = "getSiyuanNotes";
const OPEN_SIYUAN_BLOCK = "openSiyuanBlock";
const SHOW_MESSAGE = "showMessage";

const BLOCK_LINK_PREFIX = "siyuan://blocks/";
/** 卡片上最多显示的正文长度；完整内容在上限（3000）处由宿主截断。 */
const CARD_TEXT_LIMIT = 1000;

const EMBED_STYLE = "rounded=1;whiteSpace=wrap;html=1;align=left;verticalAlign=top;spacing=8;" +
    "fillColor=#ffffff;strokeColor=#4a7bd0;overflow=hidden;";
const REFERENCE_STYLE = "rounded=1;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;spacing=8;" +
    "fillColor=#eef3fb;strokeColor=#4a7bd0;fontSize=12;";

function pluginText(key, fallback) {
    try {
        const i18n = window.parent && window.parent.drawioPlugin && window.parent.drawioPlugin.i18n;
        const value = i18n && i18n[key];
        return value || fallback;
    } catch (e) {
        return fallback;
    }
}

function request(electron, type, payload, callback) {
    const callbackId = type + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    electron.sendMessage(type, payload, callbackId, callback);
}

function notify(electron, message, type) {
    if (!message) {
        return;
    }
    electron.sendMessage(SHOW_MESSAGE, { message, type: type || "info" });
}

function escapeLabel(text) {
    return String(text == null ? "" : text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function cardText(note) {
    let text = String(note.text || "");
    if (text.length > CARD_TEXT_LIMIT) {
        text = text.slice(0, CARD_TEXT_LIMIT).replace(/\s+\S*$/, "") + "…";
    }
    return escapeLabel(text).replace(/\n/g, "<br>");
}

function embedLabel(note) {
    const title = escapeLabel(note.title || note.hpath || note.id);
    // 宿主用 Lute 把 Markdown 渲染成 HTML；没有 HTML 时退回纯文本
    const html = String(note.html || "");
    const body = html ? '<div class="siyuan-note-card">' + html + "</div>" : cardText(note);
    return "<b>" + title + "</b><br>" + body + (note.truncated ? "<br>…" : "");
}

const CARD_STYLE_ID = "siyuan-note-card-style";
const CARD_STYLE = [
    ".siyuan-note-card{line-height:1.45;}",
    ".siyuan-note-card p{margin:0 0 4px;}",
    ".siyuan-note-card h1{font-size:15px;margin:0 0 4px;}",
    ".siyuan-note-card h2{font-size:14px;margin:2px 0 3px;}",
    ".siyuan-note-card h3,.siyuan-note-card h4,.siyuan-note-card h5,.siyuan-note-card h6{font-size:13px;margin:2px 0;}",
    ".siyuan-note-card ul,.siyuan-note-card ol{margin:2px 0 4px;padding-left:18px;}",
    ".siyuan-note-card li{margin:0;}",
    ".siyuan-note-card pre{margin:3px 0;padding:4px 6px;border-radius:3px;background:rgba(127,127,127,.14);white-space:pre-wrap;word-break:break-all;}",
    ".siyuan-note-card code{font-family:monospace;font-size:11px;}",
    ".siyuan-note-card blockquote{margin:3px 0;padding-left:8px;border-left:2px solid rgba(127,127,127,.45);opacity:.9;}",
    ".siyuan-note-card table{border-collapse:collapse;margin:3px 0;}",
    ".siyuan-note-card th,.siyuan-note-card td{border:1px solid rgba(127,127,127,.4);padding:1px 4px;font-size:11px;}",
    ".siyuan-note-card img{display:none;}",
    ".siyuan-note-card a{color:#4a7bd0;}",
].join("");

function installCardStyle() {
    if (document.getElementById(CARD_STYLE_ID)) {
        return;
    }
    const style = document.createElement("style");
    style.id = CARD_STYLE_ID;
    style.textContent = CARD_STYLE;
    document.head.appendChild(style);
}

function referenceLabel(note) {
    // 引用卡片只显示标题；路径留在 tooltip 里
    return "<b>" + escapeLabel(note.title || note.hpath || note.id) + "</b>";
}

function componentType(graph, cell) {
    return graph.getAttributeForCell(cell, "siyuanType");
}

function isSiyuanComponent(graph, cell) {
    const type = componentType(graph, cell);
    return type === "embed" || type === "reference";
}

function isEmbed(graph, cell) {
    return componentType(graph, cell) === "embed";
}

/** draw.io 的视图状态：换算屏幕点时用。 */
function viewportOf(graph) {
    const view = graph.view;
    const container = graph.container;
    return {
        scale: view.scale || 1,
        translate: view.getTranslate(),
        scroll: { left: container.scrollLeft, top: container.scrollTop },
    };
}

/** 把选中的笔记/标题写进卡片属性，并刷新标签（插入与编辑共用）。 */
function applyNoteToCard(graph, cell, mode, note) {
    const reference = mode === "reference";
    const model = graph.getModel();
    model.beginUpdate();
    try {
        graph.setAttributeForCell(cell, "siyuanType", reference ? "reference" : "embed");
        graph.setAttributeForCell(cell, "siyuanKind", note.kind === "heading" ? "heading" : "doc");
        graph.setAttributeForCell(cell, "siyuanId", note.id);
        graph.setAttributeForCell(cell, "siyuanTitle", note.title || "");
        graph.setAttributeForCell(cell, "siyuanPath", note.hpath || "");
        graph.setAttributeForCell(cell, "siyuanLevel", note.level ? String(note.level) : null);
        graph.setAttributeForCell(cell, "siyuanUpdated", note.updated || null);
        // 两类卡片都挂 link：选中后 draw.io 在卡片下方显示根链接
        // （块 ID + 编辑/删除），点链接经 handleCustomLink 跳回思源。
        graph.setAttributeForCell(cell, "link", BLOCK_LINK_PREFIX + note.id);
        graph.setAttributeForCell(cell, "tooltip", note.hpath || note.title || note.id);
        graph.cellLabelChanged(cell, reference ? referenceLabel(note) : embedLabel(note));
    } finally {
        model.endUpdate();
    }
}

function insertCard(editorUi, mode, note, spot) {
    const graph = editorUi.editor.graph;
    const reference = mode === "reference";
    const width = reference ? 260 : 300;
    const height = reference ? 52 : 220;
    const label = reference ? referenceLabel(note) : embedLabel(note);

    let cell = null;
    graph.getModel().beginUpdate();
    try {
        cell = graph.insertVertex(graph.getDefaultParent(), null, label,
            spot.x, spot.y, width, height, reference ? REFERENCE_STYLE : EMBED_STYLE);
    } finally {
        graph.getModel().endUpdate();
    }
    applyNoteToCard(graph, cell, mode, note);

    graph.setSelectionCell(cell);
    return cell;
}

/** 根链接提示里的「编辑」：重新选一篇笔记/标题，替换当前卡片的来源。 */
function editSiyuanComponent(editorUi, electron) {
    const graph = editorUi.editor.graph;
    const cell = graph.getSelectionCell();
    if (!cell) {
        return false;
    }
    const type = componentType(graph, cell);
    if (type !== "embed" && type !== "reference") {
        return false;
    }
    request(electron, PICK_SIYUAN_NOTE, { mode: type }, (note) => {
        if (!note) {
            return;
        }
        if (note.error) {
            notify(electron, pluginText("siyuanEmbedFailed", "读取思源笔记失败") + " " + note.error, "error");
            return;
        }
        // 弹窗期间卡片可能被删除
        if (!graph.getModel().getCell(cell.id)) {
            return;
        }
        applyNoteToCard(graph, cell, type, note);
        // 重建选中状态，让下方的根链接提示显示新的块 ID
        graph.clearSelection();
        graph.setSelectionCell(cell);
    });
    return true;
}

/* ------------------------------ 跟随鼠标放置 ------------------------------ */

let placementSession = null;

function ghostHtml(mode, note) {
    const title = escapeLabel(note.title || note.hpath || note.id);
    if (mode === "reference") {
        return '<div style="font-weight:600;">' + title + '</div>';
    }
    const text = String(note.text || "");
    const preview = text.slice(0, 220).replace(/\s+$/, "");
    return '<div style="font-weight:600;margin-bottom:4px;">' + title + '</div>' +
        '<div style="white-space:pre-wrap;color:#333;">' + escapeLabel(preview) + (text.length > 220 ? "…" : "") + '</div>';
}

function cancelPlacement() {
    if (placementSession) {
        placementSession.cleanup();
    }
}

/**
 * 进入放置模式：选择笔记后不直接落图，而是让半透明卡片跟随鼠标，
 * 在画布上点击才插入（Esc / 右键 / 点击画布外取消）。
 * 覆盖层挡住 draw.io 自己的鼠标处理，避免放置时误选中或画线。
 */
function startPlacement(editorUi, electron, mode, note) {
    cancelPlacement();
    const graph = editorUi.editor.graph;
    const container = graph.container;
    const reference = mode === "reference";
    const width = reference ? 260 : 300;
    const height = reference ? 52 : 220;
    const box = container.getBoundingClientRect();

    const overlay = document.createElement("div");
    overlay.setAttribute("data-siyuan-placement", "1");
    overlay.style.cssText = "position:fixed;z-index:9998;cursor:crosshair;background:transparent;" +
        "left:" + box.left + "px;top:" + box.top + "px;" +
        "width:" + box.width + "px;height:" + box.height + "px;";

    const ghost = document.createElement("div");
    ghost.setAttribute("data-siyuan-placement-ghost", "1");
    ghost.style.cssText = "position:fixed;z-index:9999;pointer-events:none;box-sizing:border-box;" +
        "width:" + width + "px;max-height:180px;overflow:hidden;padding:8px;" +
        "border:1px solid #4a7bd0;border-radius:6px;background:#fff;opacity:.92;" +
        "box-shadow:0 4px 16px rgba(0,0,0,.18);font-size:12px;line-height:1.4;color:#222;";
    ghost.innerHTML = ghostHtml(mode, note);
    // 预览与最终卡片同尺寸、同中心：鼠标在哪，卡片就落在哪
    ghost.style.left = (box.left + box.width / 2 - width / 2) + "px";
    ghost.style.top = (box.top + box.height / 2 - height / 2) + "px";

    document.body.appendChild(overlay);
    document.body.appendChild(ghost);

    const onMove = (evt) => {
        ghost.style.left = (evt.clientX - width / 2) + "px";
        ghost.style.top = (evt.clientY - height / 2) + "px";
    };

    const onPlace = (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        const rect = container.getBoundingClientRect();
        const spot = placementFromPoint(
            { x: evt.clientX - rect.left, y: evt.clientY - rect.top },
            viewportOf(graph),
            { width, height }
        );
        finish();
        insertCard(editorUi, mode, note, spot);
    };

    const onCancel = (evt) => {
        if (evt) {
            evt.preventDefault();
            evt.stopPropagation();
        }
        finish();
    };

    const onKeyDown = (evt) => {
        if (evt.key === "Escape") {
            onCancel(evt);
        }
    };

    const onDocumentMouseDown = (evt) => {
        if (!overlay.contains(evt.target)) {
            finish();
        }
    };

    function finish() {
        document.removeEventListener("keydown", onKeyDown, true);
        document.removeEventListener("mousedown", onDocumentMouseDown, true);
        overlay.removeEventListener("mousemove", onMove);
        overlay.removeEventListener("click", onPlace);
        overlay.removeEventListener("contextmenu", onCancel);
        overlay.remove();
        ghost.remove();
        placementSession = null;
    }

    overlay.addEventListener("mousemove", onMove);
    overlay.addEventListener("click", onPlace);
    overlay.addEventListener("contextmenu", onCancel);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("mousedown", onDocumentMouseDown, true);

    placementSession = { overlay, ghost, cleanup: finish };
    notify(electron, pluginText("siyuanPlaceHint", "点击画布放置，Esc 取消"));
}

/** 文件菜单 →「嵌入思源笔记」：选择笔记 → 读取正文 → 放一张嵌入卡片。 */
export function insertSiyuanEmbed(editorUi, electron) {
    request(electron, PICK_SIYUAN_NOTE, { mode: "embed" }, (note) => {
        if (!note) {
            return;
        }
        if (note.error) {
            notify(electron, pluginText("siyuanEmbedFailed", "读取思源笔记失败") + " " + note.error, "error");
            return;
        }
        startPlacement(editorUi, electron, "embed", note);
    });
}

/** 文件菜单 →「引用思源笔记」：选择笔记 → 放一张跳回思源的链接卡片。 */
export function insertSiyuanReference(editorUi, electron) {
    request(electron, PICK_SIYUAN_NOTE, { mode: "reference" }, (note) => {
        if (!note) {
            return;
        }
        if (note.error) {
            notify(electron, pluginText("siyuanEmbedFailed", "读取思源笔记失败") + " " + note.error, "error");
            return;
        }
        startPlacement(editorUi, electron, "reference", note);
    });
}

/** 文件菜单 →「刷新嵌入内容」：重新读取选中（或全部）嵌入卡片引用的笔记正文。 */
export function refreshSiyuanEmbeds(editorUi, electron) {
    const graph = editorUi.editor.graph;
    const selected = graph.getSelectionCells().filter((cell) => isEmbed(graph, cell));
    const cells = selected.length > 0
        ? selected
        : graph.getModel().getCells().filter((cell) => isEmbed(graph, cell));

    if (cells.length === 0) {
        notify(electron, pluginText("siyuanNoEmbed", "没有可刷新的嵌入内容"));
        return;
    }

    const ids = [];
    cells.forEach((cell) => {
        const id = graph.getAttributeForCell(cell, "siyuanId");
        if (id && ids.indexOf(id) < 0) {
            ids.push(id);
        }
    });

    request(electron, GET_SIYUAN_NOTES, { ids }, (notes) => {
        if (!Array.isArray(notes)) {
            return;
        }
        const byId = {};
        notes.forEach((note) => {
            if (note && note.id && typeof note.text === "string") {
                byId[note.id] = note;
            }
        });

        let refreshed = 0;
        const model = graph.getModel();
        model.beginUpdate();
        try {
            cells.forEach((cell) => {
                const id = graph.getAttributeForCell(cell, "siyuanId");
                const note = byId[id];
                if (!note) {
                    return;
                }
                graph.cellLabelChanged(cell, embedLabel(note));
                if (note.title) {
                    graph.setAttributeForCell(cell, "siyuanTitle", note.title);
                }
                if (note.hpath) {
                    graph.setAttributeForCell(cell, "siyuanPath", note.hpath);
                }
                if (note.kind) {
                    graph.setAttributeForCell(cell, "siyuanKind", note.kind);
                }
                if (note.level) {
                    graph.setAttributeForCell(cell, "siyuanLevel", String(note.level));
                }
                refreshed++;
            });
        } finally {
            model.endUpdate();
        }

        const template = pluginText("siyuanRefreshed", "已刷新 ${count} 个嵌入");
        notify(electron, template.replace("${count}", refreshed));
    });
}

/**
 * 根链接提示里的垃圾桶：思源组件要删除整张卡片，而不是只摘掉 link。
 * draw.io 原生行为是 `setLinkForCell(cell, null)`（提示随之消失、卡片还在），
 * 这里只替换提示里的那个图标，不影响普通图形的链接编辑。
 */
function installHintTrashOverride() {
    if (typeof mxVertexHandler === "undefined" || typeof Editor === "undefined") {
        return;
    }
    const originalUpdateLinkHint = mxVertexHandler.prototype.updateLinkHint;
    mxVertexHandler.prototype.updateLinkHint = function () {
        originalUpdateLinkHint.apply(this, arguments);
        try {
            const cell = this.state && this.state.cell;
            const graph = this.graph;
            if (!cell || !graph || !this.linkHint || !isSiyuanComponent(graph, cell)) {
                return;
            }
            const trash = [...this.linkHint.querySelectorAll("img")].find(function (img) {
                return img.getAttribute("src") === Editor.trashImage;
            });
            if (!trash || trash.getAttribute("data-siyuan-trash") === "1") {
                return;
            }
            const clone = trash.cloneNode(true);
            clone.setAttribute("data-siyuan-trash", "1");
            clone.setAttribute("title", pluginText("siyuanDeleteCard", "删除组件"));
            trash.parentNode.replaceChild(clone, trash);
            mxEvent.addListener(clone, "click", function (evt) {
                mxEvent.consume(evt);
                const model = graph.getModel();
                model.beginUpdate();
                try {
                    graph.removeCells([cell]);
                } finally {
                    model.endUpdate();
                }
            });
        } catch (e) {
            // 替换失败就保留 draw.io 原生行为
        }
    };
}

/** 顶部工具栏放一个思源笔记图标，点开是嵌入 / 引用 / 刷新三项。 */
function installSiyuanToolbar(electron) {
    if (typeof Toolbar === "undefined" || typeof Editor === "undefined" || typeof Menu === "undefined") {
        return;
    }
    const originalInit = Toolbar.prototype.init;
    Toolbar.prototype.init = function () {
        originalInit.apply(this, arguments);
        const editorUi = this.editorUi;
        const menu = new Menu(function (popupMenu, parent) {
            popupMenu.addItem(pluginText("siyuanEmbed", "嵌入思源笔记…"), null, function () {
                insertSiyuanEmbed(editorUi, electron);
            }, parent);
            popupMenu.addItem(pluginText("siyuanReference", "引用思源笔记…"), null, function () {
                insertSiyuanReference(editorUi, electron);
            }, parent);
            popupMenu.addItem(pluginText("siyuanRefreshEmbeds", "刷新嵌入内容"), null, function () {
                refreshSiyuanEmbeds(editorUi, electron);
            }, parent);
        });
        const elt = this.addMenu(menu, null, Editor.lightDarkNoteImage);
        elt.setAttribute("title", pluginText("siyuanGroup", "思源笔记"));
        elt.setAttribute("data-siyuan-toolbar", "1");
    };
}

/**
 * 让 `siyuan://blocks/<id>` 走宿主跳转，而不是被 draw.io 当外链 window.open
 * （Electron 里新窗口会被拦下）。单击卡片只选中，点根链接里的块 ID 才跳。
 */
export function installSiyuanComponents(electron) {
    if (!electron || typeof Graph === "undefined" || typeof EditorUi === "undefined") {
        return;
    }

    installCardStyle();
    installHintTrashOverride();

    const originalIsCustomLink = Graph.prototype.isCustomLink;
    Graph.prototype.isCustomLink = function (href) {
        if (typeof href === "string" && href.indexOf(BLOCK_LINK_PREFIX) === 0) {
            return true;
        }
        return originalIsCustomLink.apply(this, arguments);
    };

    const originalHandleCustomLink = EditorUi.prototype.handleCustomLink;
    EditorUi.prototype.handleCustomLink = function (href, cell) {
        if (typeof href === "string" && href.indexOf(BLOCK_LINK_PREFIX) === 0) {
            electron.sendMessage(OPEN_SIYUAN_BLOCK, { id: href.substring(BLOCK_LINK_PREFIX.length) });
            return;
        }
        return originalHandleCustomLink.apply(this, arguments);
    };

    const originalInit = EditorUi.prototype.init;
    EditorUi.prototype.init = function () {
        originalInit.apply(this, arguments);
        const editorUi = this;
        const graph = this.editor.graph;

        // 根链接提示里的「编辑」改为重新选笔记/标题，而不是编辑 URL
        const originalEditLink = graph.editLink;
        graph.editLink = function () {
            if (editSiyuanComponent(editorUi, electron)) {
                return;
            }
            return originalEditLink ? originalEditLink.apply(this, arguments) : undefined;
        };
        const editAction = this.actions && this.actions.get("editLink");
        if (editAction) {
            const originalAction = editAction.funct;
            editAction.funct = function () {
                if (editSiyuanComponent(editorUi, electron)) {
                    return;
                }
                return originalAction.apply(this, arguments);
            };
        }

        // 单击卡片只做选中：draw.io 在卡片下方显示根链接（块 ID + 编辑/删除），
        // 点块 ID 才跳转（handleCustomLink 已改道到宿主）。
    };

    installSiyuanToolbar(electron);
}
