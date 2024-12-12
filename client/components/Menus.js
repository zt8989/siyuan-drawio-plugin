function loadFile(app, url) {
    app.loadFile("U" + encodeURIComponent(url), true)
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
            this.addSubmenu('exportAs', menu, parent);
            menu.addSeparator(parent);
            this.addSubmenu('embed', menu, parent);
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
            
            this.addMenuItems(menu, ['-', 'pageSetup', 'print', '-', 'close', '-', 'exit'], parent);
        })));

        editorUi.actions.get("fullscreen").visible = true
    };
}