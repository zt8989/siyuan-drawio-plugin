export function setup() {
    Editor.themes.push("simple");
    Editor.themes.push("sketch");
    // Editor.themes.push("atlas");

    var A = EditorUi.prototype.switchCssForTheme;
    EditorUi.prototype.switchCssForTheme = function(a) {
        "simple" == a || "sketch" == a ? null == this.sketchStyleElt && (this.sketchStyleElt = document.createElement("style"),
        this.sketchStyleElt.setAttribute("type", "text/css"),
        this.sketchStyleElt.innerHTML = Editor.createMinimalCss(),
        document.getElementsByTagName("head")[0].appendChild(this.sketchStyleElt)) : A.apply(this, arguments)
    }
    ;
    editorUiCreateWrapperForTheme = EditorUi.prototype.createWrapperForTheme;
    EditorUi.prototype.createWrapperForTheme = function(a) {
        "simple" == a || "sketch" == a ? (null == this.sketchWrapperElt && (this.sketchWrapperElt = document.createElement("div"),
        this.sketchWrapperElt.style.cssText = "position:absolute;top:0px;left:0px;right:0px;bottom:0px;overflow:hidden;"),
        "sketch" == a && (this.sketchWrapperElt.className = "geSketch"),
        this.diagramContainer.parentNode.appendChild(this.sketchWrapperElt),
        this.sketchWrapperElt.appendChild(this.diagramContainer)) : editorUiCreateWrapperForTheme.apply(this, arguments)
    }
    ;
    var B = EditorUi.prototype.createMainMenuForTheme;
    EditorUi.prototype.createMainMenuForTheme = function(a) {
        if ("simple" == a || "sketch" == a) {
            if (null == this.sketchMainMenuElt) {
                this.sketchMainMenuElt = document.createElement("div");
                this.sketchMainMenuElt.style.cssText = "position:absolute;padding:9px 12px;overflow:hidden;white-space:nowrap;user-select:none;box-sizing:border-box;";
                var c = this.createMenu("simple" == a ? "view" : "diagram", "simple" == a ? Editor.thinViewImage : Editor.menuImage);
                this.sketchMainMenuElt.appendChild(c);
                "simple" == a ? (this.sketchMainMenuElt.className = "geToolbarContainer geSimpleMainMenu",
                this.sketchMainMenuElt.style.display = "flex",
                this.sketchMainMenuElt.style.height = "52px",
                this.sketchMainMenuElt.style.justifyContent = "start",
                this.sketchMainMenuElt.style.alignItems = "center",
                this.sketchMainMenuElt.style.top = "0px",
                this.sketchMainMenuElt.style.left = "0px",
                this.sketchMainMenuElt.style.right = "0px",
                this.sketchMainMenuElt.style.gap = "10px",
                c.style.flexShrink = "0",
                c.style.opacity = "0.7") : (this.sketchMainMenuElt.appendChild(this.createMenuItem("delete", Editor.trashImage)),
                this.sketchMainMenuElt.appendChild(this.createMenuItem("undo", Editor.undoImage)),
                this.sketchMainMenuElt.appendChild(this.createMenuItem("redo", Editor.redoImage)),
                this.sketchMainMenuElt.className = "geToolbarContainer",
                this.sketchMainMenuElt.style.borderRadius = "4px",
                this.sketchMainMenuElt.style.height = "44px",
                this.sketchMainMenuElt.style.left = "10px",
                this.sketchMainMenuElt.style.top = "10px",
                this.sketchMainMenuElt.style.zIndex = "1");
                this.sketchWrapperElt.appendChild(this.sketchMainMenuElt)
            }
        } else
            B.apply(this, arguments)
    }
    ;
    var C = EditorUi.prototype.createFooterMenuForTheme;
    EditorUi.prototype.createFooterMenuForTheme = function(a) {
        if ("simple" == a || "sketch" == a) {
            if (null == this.sketchFooterMenuElt) {
                this.sketchFooterMenuElt = document.createElement("div");
                this.sketchFooterMenuElt.className = "geToolbarContainer";
                var c = this.sketchFooterMenuElt;
                if ("simple" != a) {
                    var e = this.createPageMenuTab(!1, "simple" != a);
                    e.className = "geToolbarButton geAdaptiveAsset";
                    e.style.cssText = "display:inline-block;cursor:pointer;overflow:hidden;padding:4px 16px 4px 4px;white-space:nowrap;max-width:160px;text-overflow:ellipsis;background-position:right 0px top 8px;background-repeat:no-repeat;background-size:13px;background-image:url(" + mxWindow.prototype.minimizeImage + ");";
                    c.appendChild(e);
                    var b = mxUtils.bind(this, function() {
                        e.innerText = "";
                        if (null != this.currentPage) {
                            mxUtils.write(e, this.currentPage.getName());
                            var p = null != this.pages ? this.pages.length : 1
                              , m = this.getPageIndex(this.currentPage);
                            m = null != m ? m + 1 : 1;
                            var q = this.currentPage.getId();
                            e.setAttribute("title", this.currentPage.getName() + " (" + m + "/" + p + ")" + (null != q ? " [" + q + "]" : ""))
                        }
                    });
                    this.editor.addListener("pagesPatched", b);
                    this.editor.addListener("pageSelected", b);
                    this.editor.addListener("pageRenamed", b);
                    this.editor.addListener("fileLoaded", b);
                    b();
                    var t = mxUtils.bind(this, function() {
                        e.style.display = this.isPageMenuVisible() ? "inline-block" : "none"
                    });
                    this.addListener("editInlineStart", mxUtils.bind(this, function() {
                        t();
                        b()
                    }));
                    this.addListener("fileDescriptorChanged", t);
                    this.addListener("pagesVisibleChanged", t);
                    this.editor.addListener("pagesPatched", t);
                    t();
                    c.appendChild(this.createMenuItem("zoomOut", Editor.minusImage))
                }
                var d = this.createMenu("viewZoom", null, "geToolbarButton");
                d.setAttribute("title", mxResources.get("zoom"));
                d.innerHTML = "100%";
                d.style.cssText = "display:inline-flex;align-items:center;position:relative;padding:4px;box-shadow:none;width:40px;justify-content:center;cursor:pointer;";
                "simple" == a ? (d.style.borderStyle = "solid",
                d.style.borderWidth = "1px",
                d.style.borderRadius = "4px",
                d.style.fontSize = "11px",
                d.style.fontWeight = "500",
                d.style.paddingTop = "4px",
                d.style.paddingRight = "14px",
                d.style.backgroundImage = "url(" + Editor.thinExpandImage + ")",
                d.style.backgroundPosition = "right 0px center",
                d.style.backgroundRepeat = "no-repeat",
                d.style.backgroundSize = "18px",
                d.style.opacity = "0.7",
                d.style.height = "12px") : (d.style.backgroundImage = "url(" + mxWindow.prototype.minimizeImage + ")",
                d.style.backgroundPosition = "right 0px top 8px",
                d.style.backgroundRepeat = "no-repeat",
                d.style.backgroundSize = "13px",
                d.style.paddingRight = "16px",
                d.style.marginRight = "-4px");
                c.appendChild(d);
                if ("simple" == a) {
                    var h = this.createMenu("pages", Editor.thinNoteImage);
                    h.style.backgroundSize = "24px";
                    h.style.display = "inline-block";
                    h.style.width = "24px";
                    h.style.height = "30px";
                    h.style.opacity = "0.7";
                    c.appendChild(h);
                    var f = this.createMenuItem("undo", Editor.thinUndoImage);
                    f.style.marginLeft = "auto";
                    f.style.flexShrink = "0";
                    f.style.opacity = "0.7";
                    c.appendChild(f);
                    f = this.createMenuItem("redo", Editor.thinRedoImage);
                    f.style.marginLeft = "0px";
                    f.style.flexShrink = "0";
                    f.style.opacity = "0.7";
                    c.appendChild(f);
                    f = mxUtils.bind(this, function() {
                        var p = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
                        h.style.display = 480 > p ? "none" : "";
                        d.style.display = 750 > p ? "none" : "inline-flex"
                    });
                    mxEvent.addListener(window, "resize", f);
                    f()
                }
                mxUtils.bind(this, function(p) {
                    mxEvent.addListener(p, "click", mxUtils.bind(this, function(q) {
                        mxEvent.isAltDown(q) ? (this.hideCurrentMenu(),
                        this.actions.get("customZoom").funct(),
                        mxEvent.consume(q)) : mxEvent.isShiftDown(q) && (this.hideCurrentMenu(),
                        this.actions.get("smartFit").funct(),
                        mxEvent.consume(q))
                    }));
                    var m = mxUtils.bind(this, function(q, u, k) {
                        p.innerText = "";
                        mxUtils.write(p, Math.round(100 * this.editor.graph.view.scale * (null != k ? k : 1)) + "%")
                    });
                    this.editor.graph.view.addListener(mxEvent.EVENT_SCALE, m);
                    this.editor.addListener("resetGraphView", m);
                    this.editor.addListener("pageSelected", m);
                    this.editor.graph.addListener("zoomPreview", mxUtils.bind(this, function(q, u) {
                        m(q, u, u.getProperty("factor"))
                    }))
                })(d);
                "simple" != a && c.appendChild(this.createMenuItem("zoomIn", Editor.plusImage));
                if ("1" == urlParams.embedInline) {
                    var n = this.createMenuItem("fullscreen", Editor.fullscreenImage);
                    c.appendChild(n);
                    f = mxUtils.bind(this, function() {
                        n.style.backgroundImage = "url(" + (Editor.inlineFullscreen ? Editor.fullscreenExitImage : Editor.fullscreenImage) + ")";
                        this.inlineSizeChanged();
                        this.editor.graph.refresh();
                        this.fitWindows()
                    });
                    this.addListener("editInlineStart", mxUtils.bind(this, function() {
                        n.style.backgroundImage = "url(" + (Editor.inlineFullscreen ? Editor.fullscreenExitImage : Editor.fullscreenImage) + ")"
                    }));
                    this.addListener("inlineFullscreenChanged", f);
                    c.appendChild(this.createMenuItem("exit", Editor.closeImage))
                }
                "simple" == a ? (this.sketchFooterMenuElt.style.cssText = "position:relative;white-space:nowrap;gap:6px;user-select:none;display:flex;flex-shrink:0;flex-grow:0.5;align-items:center;",
                this.sketchMainMenuElt.appendChild(this.sketchFooterMenuElt)) : (this.sketchFooterMenuElt.style.cssText = "position:absolute;right:12px;bottom:12px;height:44px;border-radius:4px;padding:9px 12px;overflow:hidden;z-index:1;white-space:nowrap;display:flex;text-align:right;user-select:none;box-sizing:border-box;",
                this.sketchWrapperElt.appendChild(this.sketchFooterMenuElt))
            }
        } else
            C.apply(this, arguments)
    }
    ;
    var D = EditorUi.prototype.createPickerMenuForTheme;
    EditorUi.prototype.createPickerMenuForTheme = function(a) {
        if ("simple" == a || "sketch" == a) {
            if (null == this.sketchPickerMenuElt) {
                var c = this.editor.graph;
                this.sketchPickerMenuElt = document.createElement("div");
                this.sketchPickerMenuElt.className = "geToolbarContainer";
                var e = this.sketchPickerMenuElt;
                mxUtils.setPrefixedStyle(e.style, "transition", "transform .3s ease-out");
                var b = document.createElement("a");
                b.style.padding = "0px";
                b.style.boxShadow = "none";
                b.className = "geMenuItem geAdaptiveAsset";
                b.style.display = "simple" == a ? "inline-block" : "block";
                b.style.width = "100%";
                b.style.height = "14px";
                b.style.margin = "4px 0 2px 0";
                b.style.backgroundImage = "url(" + Editor.expandMoreImage + ")";
                b.style.backgroundPosition = "center center";
                b.style.backgroundRepeat = "no-repeat";
                b.style.backgroundSize = "22px";
                mxUtils.setOpacity(b, 40);
                b.setAttribute("title", mxResources.get("collapseExpand"));
                var t = b.style.margin
                  , d = this.createMenuItem("insertFreehand", "simple" == a ? Editor.thinGestureImage : Editor.freehandImage, !0);
                d.style.paddingLeft = "simple" == a ? "0px" : "12px";
                d.style.backgroundSize = "24px";
                d.style.width = "26px";
                d.style.height = "30px";
                d.style.opacity = "0.7";
                var h = this.createMenu("insert", "simple" == a ? Editor.thinAddCircleImage : Editor.addBoxImage);
                h.style.backgroundSize = "24px";
                h.style.display = "simple" == a ? "inline-block" : "block";
                h.style.flexShrink = "0";
                h.style.width = "30px";
                h.style.height = "30px";
                h.style.padding = "simple" == a ? "0px" : "4px 4px 0px 4px";
                h.style.opacity = "0.7";
                var f = this.createMenu("table", Editor.thinTableImage);
                f.style.backgroundSize = "24px";
                f.style.padding = "simple" == a ? "0px" : "4px 4px 0px 4px";
                f.style.display = "inline-block";
                f.style.width = "30px";
                f.style.height = "30px";
                f.style.opacity = "0.7";
                var n = h.cloneNode(!0);
                n.style.backgroundImage = "url(" + ("simple" == a ? Editor.thinShapesImage : Editor.shapesImage) + ")";
                n.style.backgroundSize = "24px";
                n.setAttribute("title", mxResources.get("shapes"));
                mxEvent.addListener(n, "click", mxUtils.bind(this, function(k) {
                    if (this.isShapePickerVisible())
                        this.hideShapePicker();
                    else {
                        var l = mxUtils.getOffset(n);
                        Editor.inlineFullscreen || null == this.embedViewport ? "simple" == a ? (l.x -= this.diagramContainer.offsetLeft + 30,
                        l.y += n.offsetHeight - 19) : (l.x += n.offsetWidth + 28,
                        l.y += 20) : (l.x = 0,
                        l.y = n.offsetTop);
                        this.showShapePicker(Math.max(this.diagramContainer.scrollLeft + Math.max(24, l.x)), this.diagramContainer.scrollTop + l.y, null, null, null, null, mxUtils.bind(this, function(g) {
                            return c.getCenterInsertPoint(c.getBoundingBoxFromGeometry(g, !0))
                        }), "simple" == a, !1)
                    }
                    mxEvent.consume(k)
                }));
                h.style.backgroundSize = "24px";
                "simple" == a ? h.style.flexShrink = "0" : h.style.marginBottom = "4px";
                var p = !1
                  , m = mxUtils.bind(this, function(k) {
                    if (k || null != document.body && document.body.contains(e)) {
                        k = function(r, w, x, z, E, y) {
                            null != w && r.setAttribute("title", w);
                            r.style.cursor = "pointer";
                            r.style.margin = "simple" == a ? "0px" : "8px 0px 8px 2px";
                            r.style.display = "simple" == a ? "inline-block" : "block";
                            e.appendChild(r);
                            "simple" == a ? r.style.opacity = "0.7" : null != z && (w = E,
                            w = null != w ? w : 30,
                            y = null != y ? y : 26,
                            r.style.position = "relative",
                            r.style.overflow = "visible",
                            x = document.createElement("div"),
                            x.style.position = "absolute",
                            x.style.fontSize = "8px",
                            x.style.left = w + "px",
                            x.style.top = y + "px",
                            mxUtils.write(x, z),
                            r.appendChild(x));
                            c.isEnabled() || r.classList.add("mxDisabled");
                            return r
                        }
                        ;
                        c.isEnabled() ? (d.classList.remove("mxDisabled"),
                        h.classList.remove("mxDisabled"),
                        f.classList.remove("mxDisabled"),
                        n.classList.remove("mxDisabled")) : (d.classList.add("mxDisabled"),
                        h.classList.add("mxDisabled"),
                        f.classList.add("mxDisabled"),
                        n.classList.add("mxDisabled"));
                        e.innerText = "";
                        if (!p) {
                            var l = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
                            "simple" == a && (this.sidebar.graph.cellRenderer.minSvgStrokeWidth = .9);
                            var g = "simple" == a ? "0px" : "4px 0px 6px 2px";
                            if ("simple" != a || 660 <= l) {
                                var v = this.sidebar.createVertexTemplate(c.appendFontSize("text;strokeColor=none;fillColor=none;html=1;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;", c.vertexFontSize), 60, 30, "Text", mxResources.get("text") + " (A)", !0, !1, null, "simple" != a, null, 38, 38, "simple" == a ? Editor.thinTextImage : null, !0);
                                "simple" == a && (v.className = "geToolbarButton",
                                v.style.opacity = "0.7");
                                k(v, mxResources.get("text") + " (A)", null, "A", 32).style.margin = "simple" == a ? "0 -8px 0 0" : "0 0 0 -2px"
                            }
                            v = this.sidebar.createVertexTemplate("rounded=0;whiteSpace=wrap;html=1;", 160, 80, "", mxResources.get("rectangle") + " (D)", !0, !1, null, "simple" != a, null, 28, 28, "simple" == a ? Editor.thinRectangleImage : null);
                            "simple" == a ? (600 <= l && (v.className = "geToolbarButton",
                            v.style.opacity = "0.7",
                            k(v, mxResources.get("rectangle") + " (D)", null, "D").style.margin = "0 -4px 0 0"),
                            390 <= l && this.sketchPickerMenuElt.appendChild(n),
                            440 <= l && k(d, mxResources.get("freehand") + " (X)", null, "X"),
                            500 <= l && this.sketchPickerMenuElt.appendChild(f)) : (k(this.sidebar.createVertexTemplate("shape=note;whiteSpace=wrap;html=1;backgroundOutline=1;fontColor=#000000;darkOpacity=0.05;fillColor=#FFF9B2;strokeColor=none;fillStyle=solid;direction=west;gradientDirection=north;gradientColor=#FFF2A1;shadow=1;size=20;pointerEvents=1;", 140, 160, "", mxResources.get("note") + " (S)", !0, !1, null, !0, null, 28, 28), mxResources.get("note") + " (S)", null, "S").style.margin = g,
                            k(v, mxResources.get("rectangle") + " (D)", null, "D").style.margin = g,
                            k(this.sidebar.createVertexTemplate("ellipse;whiteSpace=wrap;html=1;", 160, 100, "", mxResources.get("ellipse") + " (F)", !0, !1, null, !0, null, 28, 28), mxResources.get("ellipse") + " (F)", null, "F").style.margin = g,
                            g = new mxCell("",new mxGeometry(0,0,this.editor.graph.defaultEdgeLength + 20,0),"edgeStyle=none;orthogonalLoop=1;jettySize=auto;html=1;"),
                            g.geometry.setTerminalPoint(new mxPoint(0,0), !0),
                            g.geometry.setTerminalPoint(new mxPoint(g.geometry.width,0), !1),
                            g.geometry.points = [],
                            g.geometry.relative = !0,
                            g.edge = !0,
                            k(this.sidebar.createEdgeTemplateFromCells([g], g.geometry.width, g.geometry.height, mxResources.get("line") + " (C)", !0, null, "simple" != a, !1, null, 28, 28), mxResources.get("line") + " (C)", null, "C").margin = "1px 0px 1px 2px",
                            g = g.clone(),
                            g.style = "edgeStyle=none;orthogonalLoop=1;jettySize=auto;html=1;shape=flexArrow;rounded=1;startSize=8;endSize=8;",
                            g.geometry.width = this.editor.graph.defaultEdgeLength + 20,
                            g.geometry.setTerminalPoint(new mxPoint(0,20), !0),
                            g.geometry.setTerminalPoint(new mxPoint(g.geometry.width,20), !1),
                            k(this.sidebar.createEdgeTemplateFromCells([g], g.geometry.width, 40, mxResources.get("arrow"), !0, null, !0, !1, null, 28, 28), mxResources.get("arrow")).style.margin = "1px 0px 1px 2px",
                            k(d, mxResources.get("freehand") + " (X)", null, "X"),
                            this.sketchPickerMenuElt.appendChild(n));
                            ("simple" != a || 320 < l) && this.sketchPickerMenuElt.appendChild(h)
                        }
                        "simple" != a && "1" != urlParams.embedInline && e.appendChild(b);
                        this.sidebar.graph.cellRenderer.minSvgStrokeWidth = this.sidebar.minThumbStrokeWidth
                    }
                });
                mxEvent.addListener(b, "click", mxUtils.bind(this, function() {
                    p ? (mxUtils.setPrefixedStyle(e.style, "transform", "translate(0, -50%)"),
                    e.style.padding = "0px 4px 4px",
                    e.style.width = "48px",
                    e.style.top = "50%",
                    e.style.bottom = "",
                    e.style.height = "",
                    b.style.backgroundImage = "url(" + Editor.expandMoreImage + ")",
                    b.style.width = "100%",
                    b.style.height = "14px",
                    b.style.margin = t,
                    p = !1,
                    m()) : (e.innerText = "",
                    e.appendChild(b),
                    mxUtils.setPrefixedStyle(e.style, "transform", "translate(0, 0)"),
                    e.style.width = "auto",
                    e.style.bottom = "12px",
                    e.style.padding = "0px",
                    e.style.top = "",
                    b.style.backgroundImage = "url(" + Editor.expandLessImage + ")",
                    b.style.width = "24px",
                    b.style.height = "24px",
                    b.style.margin = "0px",
                    p = !0)
                }));
                var q = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth
                  , u = null;
                mxEvent.addListener(window, "resize", function() {
                    var k = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
                    k != q && (q = k,
                    null != u && window.clearTimeout(u),
                    u = window.setTimeout(function() {
                        u = null;
                        m()
                    }, 200))
                });
                this.editor.addListener("fileLoaded", m);
                this.addListener("sketchModeChanged", m);
                this.addListener("currentThemeChanged", m);
                this.addListener("lockedChanged", m);
                this.addListener("darkModeChanged", mxUtils.bind(this, function() {
                    Editor.enableCssDarkMode || m()
                }));
                m(!0);
                "simple" == a ? (this.sketchPickerMenuElt.style.cssText = "position:relative;white-space:nowrap;user-select:none;display:flex;align-items:center;justify-content:flex-end;flex-grow:1;gap:6px;flex-shrink:0;",
                this.sketchMainMenuElt.appendChild(this.sketchPickerMenuElt)) : (this.sketchPickerMenuElt.style.cssText = "position:absolute;left:10px;border-radius:4px;padding:0px 4px 4px;white-space:nowrap;max-height:100%;z-index:1;width:48px;box-sizing:border-box;transform:translate(0, -50%);top:50%;user-select:none;",
                this.sketchWrapperElt.appendChild(this.sketchPickerMenuElt));
                mxClient.IS_POINTER && (this.sketchPickerMenuElt.style.touchAction = "none")
            }
        } else
            D.apply(this, arguments)
    }
    ;
    var F = EditorUi.prototype.createMenubarForTheme;
    EditorUi.prototype.createMenubarForTheme = function(a) {
        if ("simple" == a || "sketch" == a) {
            if (null == this.sketchMenubarElt) {
                this.sketchMenubarElt = document.createElement("div");
                this.sketchMenubarElt.className = "geToolbarContainer";
                if ("simple" == a) {
                    this.sketchMenubarElt.style.cssText = "position:relative;flex-grow:0.5;overflow:visible;" + ("1" != urlParams.embed ? "flex-shrink:0;" : "min-width:0;") + "display:flex;white-space:nowrap;user-select:none;justify-content:flex-end;align-items:center;flex-wrap:nowrap;gap:6px;";
                    null == this.commentElt && (this.commentElt = this.createMenuItem("comments", Editor.thinCommentImage, !0),
                    this.commentElt.style.paddingLeft = "0px",
                    this.commentElt.style.backgroundSize = "24px",
                    this.commentElt.style.width = "26px",
                    this.commentElt.style.height = "30px",
                    this.commentElt.style.opacity = "0.7");
                    if (null == this.shareElt && "1" != urlParams.embed && "draw.io" == this.getServiceName())
                        if (this.shareElt = this.createMenu("share", Editor.thinUserAddImage),
                        this.shareElt.style.backgroundSize = "24px",
                        this.shareElt.style.display = "inline-block",
                        this.shareElt.style.flexShrink = "0",
                        this.shareElt.style.width = "24px",
                        this.shareElt.style.height = "30px",
                        this.shareElt.style.opacity = "0.7",
                        this.isStandaloneApp())
                            this.shareElt.style.backgroundImage = "url(" + Editor.thinShareImage + ")";
                        else {
                            var c = mxUtils.bind(this, function() {
                                var b = mxResources.get("share")
                                  , t = Editor.thinUserAddImage
                                  , d = this.getNetworkStatus();
                                null != d && (b = b + " (" + d + ")",
                                t = Editor.thinUserFlashImage);
                                this.shareElt.style.backgroundImage = "url(" + t + ")";
                                this.shareElt.setAttribute("title", b)
                            });
                            this.addListener("realtimeStateChanged", c);
                            this.editor.addListener("statusChanged", c);
                            mxEvent.addListener(window, "offline", c);
                            mxEvent.addListener(window, "online", c);
                            c()
                        }
                    null == this.mainMenuElt && (this.mainMenuElt = this.createMenu("diagram", Editor.thinMenuImage),
                    this.mainMenuElt.style.backgroundSize = "24px",
                    this.mainMenuElt.style.display = "inline-block",
                    this.mainMenuElt.style.flexShrink = "0",
                    this.mainMenuElt.style.width = "24px",
                    this.mainMenuElt.style.height = "30px",
                    this.mainMenuElt.style.opacity = "0.7");
                    if (null == this.formatElt) {
                        this.formatElt = this.createMenuItem("format", Editor.thinDesignImage, !0);
                        this.formatElt.style.backgroundSize = "24px";
                        this.formatElt.style.marginLeft = "1" != urlParams.embed ? "auto" : "0";
                        this.formatElt.style.flexShrink = "0";
                        this.formatElt.style.width = "20px";
                        this.formatElt.style.opacity = "0.7";
                        var e = this.formatElt.className + " geToggleItem";
                        this.formatElt.className = e + (0 == this.formatWidth ? "" : " geActiveItem");
                        this.addListener("formatWidthChanged", function() {
                            this.formatElt.className = e + (0 == this.formatWidth ? "" : " geActiveItem")
                        })
                    }
                } else
                    this.sketchMenubarElt.style.cssText = "position:absolute;right:12px;top:10px;height:44px;border-radius:4px;overflow:hidden;user-select:none;max-width:calc(100% - 170px);box-sizing:border-box;justify-content:flex-end;z-index:1;padding:7px 12px;display:flex;white-space:nowrap;user-select:none;justify-content:flex-end;align-items:center;flex-wrap:nowrap;gap:6px;",
                    this.sketchWrapperElt.appendChild(this.sketchMenubarElt);
                "1" != urlParams.embedInline && (c = mxUtils.bind(this, function() {
                    if ("sketch" == Editor.currentTheme) {
                        var b = 58 > this.sketchPickerMenuElt.offsetTop - this.sketchPickerMenuElt.offsetHeight / 2;
                        this.sketchMainMenuElt.style.left = b ? "70px" : "10px";
                        this.sketchMenubarElt.style.maxWidth = b ? "calc(100% - 230px)" : "calc(100% - 170px)"
                    } else
                        "simple" == Editor.currentTheme && (b = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth,
                        null != this.commentElt && (this.commentElt.style.display = 560 < b && this.commentsSupported() ? "" : "none"),
                        null != this.shareElt && (this.shareElt.style.display = 360 < b ? "" : "none"))
                }),
                c(),
                mxEvent.addListener(window, "resize", c),
                this.editor.addListener("fileLoaded", c));
                "1" != urlParams.embed && "atlassian" != this.getServiceName() && this.installStatusMinimizer(this.sketchMenubarElt)
            }
            "simple" == a && (null != this.buttonContainer && (this.buttonContainer.style.padding = "0px",
            this.sketchMenubarElt.appendChild(this.buttonContainer),
            null != this.formatElt && "1" == urlParams.embed && (this.formatElt.style.marginLeft = "")),
            null != this.commentElt && this.sketchMenubarElt.appendChild(this.commentElt),
            null != this.shareElt && this.sketchMenubarElt.appendChild(this.shareElt),
            this.sketchMenubarElt.appendChild(this.mainMenuElt),
            this.sketchMenubarElt.appendChild(this.formatElt));
            null != this.statusContainer && (this.statusContainer.style.flexGrow = "1",
            this.statusContainer.style.flexShrink = "1",
            this.statusContainer.style.marginTop = "0px",
            "simple" != a ? this.sketchMenubarElt.appendChild(this.statusContainer) : (this.statusContainer.style.justifyContent = "center",
            this.statusContainer.style.width = "22%"));
            "simple" != a && null != this.userElement && (this.userElement.style.flexShrink = "0",
            this.userElement.style.top = "",
            this.sketchMenubarElt.appendChild(this.userElement));
            c = this.menubar.langIcon;
            null != c && (c.style.position = "",
            c.style.height = "21px",
            c.style.width = "21px",
            c.style.flexShrink = "0",
            c.style.opacity = "0.7",
            this.sketchMenubarElt.appendChild(c));
            "simple" == a ? (this.sketchMainMenuElt.appendChild(this.statusContainer),
            this.sketchMainMenuElt.appendChild(this.sketchMenubarElt)) : null != this.buttonContainer && (this.buttonContainer.style.padding = "0px",
            this.sketchMenubarElt.appendChild(this.buttonContainer))
        } else
            F.apply(this, arguments)
    }
}
