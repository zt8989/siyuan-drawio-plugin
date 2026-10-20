import { insertSiyuanEmbed, insertSiyuanReference, refreshSiyuanEmbeds } from "../SiyuanComponents"

function loadFile(app, url) {
    app.loadFile("U" + encodeURIComponent(url), true)
}

// 菜单文案来自插件 i18n（public/i18n/*.json），缺失时退回中文默认值
function pluginText(key, fallback) {
    try {
        const i18n = window.parent && window.parent.drawioPlugin && window.parent.drawioPlugin.i18n
        return (i18n && i18n[key]) || fallback
    } catch (e) {
        return fallback
    }
}

export function setup(electron){
    var menusInit = Menus.prototype.init;
    Menus.prototype.init = function()
    {
        menusInit.apply(this, arguments);

        var editorUi = this.editorUi;

        // editorUi.actions.put('useOffline', new Action(mxResources.get('useOffline') + '...', function()
        // {
        //     editorUi.openLink('https://www.draw.io/')
        // }));

        // 不需要复制链接，建议直接使用`/`命令
        // editorUi.actions.put("copyLink", new Action(parent.drawioPlugin.i18n.copyAsSiYuanLink, function() {
        //     var file = editorUi.getCurrentFile();
        //     electron.sendMessage("copyLink", file.getTitle())
        // }),)

        // 思源笔记组件：嵌入 / 引用 / 刷新（宿主负责选笔记、读正文与跳转）
        editorUi.actions.put("insertSiyuanEmbed", new Action(pluginText("siyuanEmbed", "嵌入思源笔记…"), function() {
            insertSiyuanEmbed(editorUi, electron)
        }))
        editorUi.actions.put("insertSiyuanReference", new Action(pluginText("siyuanReference", "引用思源笔记…"), function() {
            insertSiyuanReference(editorUi, electron)
        }))
        editorUi.actions.put("refreshSiyuanEmbeds", new Action(pluginText("siyuanRefreshEmbeds", "刷新嵌入内容"), function() {
            refreshSiyuanEmbeds(editorUi, electron)
        }))

        this.put('siyuanComponents', new Menu(mxUtils.bind(this, function(menu, parent)
        {
            this.addMenuItems(menu, ['insertSiyuanEmbed', 'insertSiyuanReference', '-', 'refreshSiyuanEmbeds'], parent);
        })));

        editorUi.actions.put("open",  new Action(mxResources.get('open'), function() {
            electron.sendMessage("open", null, "open" + (new Date).getTime(), (url, name) => {
                loadFile(editorUi, url)
            })
        }),)
        
        // this.put('openRecent', new Menu(function(menu, parent)
        // {
        //     var recent = editorUi.getRecent();

        //     if (recent != null)
        //     {
        //         for (var i = 0; i < recent.length; i++)
        //         {
        //             (function(entry)
        //             {
        //                 menu.addItem(entry.title, null, function()
        //                 {
        //                     function doOpenRecent()
        //                     {
        //                         //Simulate opening a file via args
        //                         editorUi.loadArgs({args: [entry.id]});
        //                     };
                            
        //                     var file = editorUi.getCurrentFile();
                            
        //                     if (file != null && file.isModified())
        //                     {
        //                         editorUi.confirm(mxResources.get('allChangesLost'), null, doOpenRecent,
        //                             mxResources.get('cancel'), mxResources.get('discardChanges'));
        //                     }
        //                     else
        //                     {
        //                         doOpenRecent();
        //                     }
        //                 }, parent);
        //             })(recent[i]);
        //         }

        //         menu.addSeparator(parent);
        //     }

        //     menu.addItem(mxResources.get('reset'), null, function()
        //     {
        //         editorUi.resetRecent();
        //     }, parent);
        // }));
        
        // Replaces file menu to replace openFrom menu with open and rename downloadAs to export
        this.put('file', new Menu(mxUtils.bind(this, function(menu, parent)
        {
            this.addMenuItems(menu, ['new', 'open', 'copyLink'], parent);
            this.addSubmenu('openRecent', menu, parent);
            this.addMenuItems(menu, ['-', /*'synchronize', '-'*/, 'save', 'saveAs', '-', 'import'], parent);
            this.addSubmenu('siyuanComponents', menu, parent, pluginText("siyuanGroup", "思源笔记"));
            this.addSubmenu('exportAs', menu, parent);
            menu.addSeparator(parent);
            this.addSubmenu('embed', menu, parent);
            // 演示模式与嵌入同级: upstream registers the presentationMode
            // action but only surfaces it behind hosted-service gates
            // (!isElectronApp && isOwnGDriveDomain && serviceName ==
            // 'draw.io'), so it is unreachable in this self-hosted build.
            // The overlay itself is fully client-side (chromeless EditorUi
            // in a backdrop div), so expose it here.
            this.addMenuItems(menu, ['presentationMode'], parent);
            menu.addSeparator(parent);
            this.addMenuItems(menu, ['newLibrary', 'openLibrary'], parent);

            var file = editorUi.getCurrentFile();
            
            if (file != null && editorUi.fileNode != null)
            {
                var filename = (file.getTitle() != null) ?
                    file.getTitle() : editorUi.defaultFilename;
                
                if (!/(\.html)$/i.test(filename) &&
                    !/(\.svg)$/i.test(filename))
                {
                    this.addMenuItems(menu, ['-', 'properties']);
                }
            }
            
            this.addMenuItems(menu, ['-', 'pageSetup', 'print', '-', 'close', '-', 'appVersion', 'exit'], parent);
        })));

        editorUi.actions.get("fullscreen").visible = true
        editorUi.actions.put('appVersion', new Action('v' + process.env.VERSION, function(arg1, evt)
		{
			// do nothing
		}));
    };
}