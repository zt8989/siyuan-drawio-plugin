(async function() {
    /**
     * Copyright (c) 2006-2024, JGraph Ltd
     * Copyright (c) 2006-2024, draw.io AG
     */
    // null'ing of global vars need to be after init.js
    window.VSD_CONVERT_URL = null;
    window.EMF_CONVERT_URL = null;
    window.ICONSEARCH_PATH = null;
    const typePrefix = "drawio_"
    const assetsDirPath = "/assets/drawio/";

    if(window.parent.siyuan) {
        const callbacks = {}
        //#region public method
        window.addEventListener('message', function(event) {
            switch (event.data.type) {
                case typePrefix + "callback":
                    var message = event.data;
                    var messageId = message.callbackId;
                    var messageArgs = message.payload;
                    if(messageId && callbacks[messageId]) {
                        callbacks[messageId].apply(null, messageArgs)
                        delete callbacks[messageId]
                    }
                    return
            }
            
        });

        const electron = {
            sendMessage(type, payload, callbackId, callback) {
                if(callbackId) {
                    callbacks[callbackId] = callback
                }
                window.parent.postMessage({
                    type: typePrefix + type,
                    payload,
                    callbackId
                })
            }
        }

        async function uploadFileToSiyuan(file, assetsDirPath) {
            const formData = new FormData();
            formData.append("assetsDirPath", assetsDirPath);
            formData.append("file[]", file);
    
            return await fetch("/api/asset/upload", {
                method: "POST",
                body: formData
            }).then(res => res.json());
        }
    
        async function getFileContent(data) {
            if(data.path) {
                if(data.path.startsWith("/assets")) {
                    data.path =  "/data" + data.path
                } else if (data.path.startsWith("assets")) {
                    data.path =  "/data/" + data.path
                }
            }
            const response = await fetch("/api/file/getFile", {
                body: JSON.stringify(data),
                method: "POST"
            })
            if (response.status === 200) {
                return response.text()
            } else {
                const json = await response.json()
                throw new Error(json.msg)
            }
        }
    
        async function saveFileToSiyuan(file, fileName) {
            
            const data = await uploadFileToSiyuan(file, assetsDirPath);
            if (data.code === 0 && data.data && data.data.succMap) {
                const newFilePath = data.data.succMap[fileName];
                const newTitle = newFilePath.split('/').pop();
                return { success: true, newTitle };
            }
            
            return { success: false };
        }

        function loadFile(app, url) {
            app.loadFile("U" + encodeURIComponent(url), true)
        }
        //#endregion
    
        // #region App 
        // Overrides default mode
        App.mode = App.MODE_DEVICE;

        App.prototype.showSaveFilePicker = function(success, error, opts) {
            success(null, { name: opts.suggestedName })
        }
    
        App.prototype.fetchAndShowNotification = function(){}
    
        App.prototype.loadFile = function(id, sameWindow, file, success, force)
        {
            sameWindow = true;
            
            this.hideDialog();
            
            var fn2 = mxUtils.bind(this, function()
            {
                if (id == null || id.length == 0)
                {
                    this.editor.setStatus('');
                    this.fileLoaded(null);
                }
                else if (this.spinner.spin(document.body, mxResources.get('loading')))
                {
                    // Handles files from localStorage
                    if (file != null)
                    {
                        // File already loaded
                        this.spinner.stop();
                        this.fileLoaded(file);
    
                        if (success != null)
                        {
                            success();
                        }
                    }
                    else if (id.charAt(0) == 'U')
                    {
                        var url = decodeURIComponent(id.substring(1));
                        
                        var doFallback = mxUtils.bind(this, function()
                        {
                            // Fallback for non-public Google Drive files
                            if (url.substring(0, 31) == 'https://drive.google.com/uc?id=' &&
                                (this.drive != null || typeof window.DriveClient === 'function'))
                            {
                                this.hideDialog();
                                
                                var fallback = mxUtils.bind(this, function()
                                {
                                    this.spinner.stop();
                                    
                                    if (this.drive != null)
                                    {
                                        var tempId = url.substring(31, url.lastIndexOf('&ex'));
                                        
                                        this.loadFile('G' + tempId, sameWindow, null, mxUtils.bind(this, function()
                                        {
                                            var currentFile = this.getCurrentFile();
                                            
                                            if (currentFile != null && this.editor.chromeless && !this.editor.editable)
                                            {
                                                currentFile.getHash = function()
                                                {
                                                    return 'G' + tempId;
                                                };
                                                
                                                window.location.hash = '#' + currentFile.getHash();
                                            }
                                            
                                            if (success != null)
                                            {
                                                success();
                                            }
                                        }));
                                        
                                        return true;
                                    }
                                    else
                                    {
                                        return false;
                                    }
                                });
                                
                                if (!fallback() && this.spinner.spin(document.body, mxResources.get('loading')))
                                {
                                    this.addListener('clientLoaded', fallback);
                                }
                                
                                return true;
                            }
                            else
                            {
                                return false;
                            }
                        });
                        
                        getFileContent({ path: url }).then(mxUtils.bind(this, function(text)
                        {
                            this.spinner.stop();
                            
                            if (text != null && text.length > 0)
                            {
                                var filename = this.defaultFilename;
                                
                                // Tries to find name from URL with valid extensions
                                if (urlParams['title'] == null && urlParams['notitle'] != '1')
                                {
                                    var tmp = url;
                                    var dot = url.lastIndexOf('.');
                                    var slash = tmp.lastIndexOf('/');
                                    
                                    if (dot > slash && slash > 0)
                                    {
                                        tmp = tmp.substring(slash + 1, dot);
                                        var ext = url.substring(dot);
                                        
                                        if (!this.useCanvasForExport && ext == '.png')
                                        {
                                            ext = '.drawio';
                                        }
    
                                        if (ext === '.svg' || ext === '.xml' ||
                                            ext === '.html' || ext === '.png'  ||
                                            ext === '.drawio')
                                        {
                                            filename = tmp + ext;
                                        }
                                    }
                                }
                                
                                var tempFile = new LocalFile(this, text, (urlParams['title'] != null) ?
                                    decodeURIComponent(urlParams['title']) : filename, false);
                                tempFile.getHash = function()
                                {
                                    return id;
                                };
                                
                                if (this.fileLoaded(tempFile, true))
                                {
                                    if (success != null)
                                    {
                                        success();
                                    }
                                }
                                else if (!doFallback())
                                {
                                    this.handleError({message: mxResources.get('fileNotFound')},
                                        mxResources.get('errorLoadingFile'));
                                }
                            }
                            else if (!doFallback())
                            {
                                this.handleError({message: mxResources.get('fileNotFound')},
                                    mxResources.get('errorLoadingFile'));
                            }
                        }), mxUtils.bind(this, function(e)
                        {
                            console.log(e)
                            if (!doFallback())
                            {
                                this.spinner.stop();
                                this.handleError({message: mxResources.get('fileNotFound')},
                                    mxResources.get('errorLoadingFile'));
                            }
                        }), (urlParams['template-filename'] != null) ?
                            decodeURIComponent(urlParams['template-filename']) : null);
                    }
                }
            });
            
            var currentFile = this.getCurrentFile();
            
            var fn = mxUtils.bind(this, function()
            {
                if (force || currentFile == null || !currentFile.isModified())
                {
                    fn2();
                }
                else
                {
                    this.confirm(mxResources.get('allChangesLost'), mxUtils.bind(this, function()
                    {
                        if (currentFile != null)
                        {
                            window.location.hash = currentFile.getHash();
                        }
                    }), fn2, mxResources.get('cancel'), mxResources.get('discardChanges'));
                }
            });
            
            if (id == null || id.length == 0)
            {
                fn();
            }
            else if (currentFile != null && !sameWindow)
            {
                this.showDialog(new PopupDialog(this, this.getUrl() + '#' + id,
                    null, fn).container, 320, 160, true, true);
            }
            else
            {
                fn();
            }
        };
        // #endregion
    
        // #region LocalFile 
        LocalFile.prototype.saveFile = function(title, revision, success, error, useCurrentData, unloading, overwrite) {
            if (title != this.title)
                {
                    this.fileHandle = null;
                    this.desc = null;
                    this.editable = null;
                }
                
                this.title = title;
            
                // Updates data after changing file name
                if (!useCurrentData)
                {
                    this.updateFileData();
                }
                
                var binary = this.ui.useCanvasForExport && /(\.png)$/i.test(this.getTitle());
                this.setShadowModified(false);
                var savedData = this.getData();
                
                var done = mxUtils.bind(this, function()
                {
                    this.setModified(this.getShadowModified());
                    this.contentChanged();
            
                    if (success != null)
                    {
                        success();
                    }
                });
                
                var doSave = mxUtils.bind(this, function(data)
                {
                    var errorWrapper = mxUtils.bind(this, function(e)
                    {
                        this.savingFile = false;
                        
                        if (error != null)
                        {
                            // Wraps error object to offer save status option
                            error({error: e});
                        }
                    });
    
                    const extension = title.split('.').pop().toLowerCase();
        
                    const fileType = this.ui.editor.diagramFileTypes.find(type => type.extension === extension);
                    if (!fileType) {
                        throw new Error(`Unsupported file extension: ${extension}`);
                    }
                    let content = (binary) ? this.ui.base64ToBlob(data, 'image/png') : data
                    const blob = new Blob([content], { type: fileType.mimeType });
                    const file = new File([blob], title, { type: fileType.mimeType });
                    saveFileToSiyuan(file, title).then(result => {
                        if (result.success) {
                            this.title = result.newTitle;
                            done();
                        } else {
                            errorWrapper(new Error('Failed to save file to SiYuan'));
                        }
                    }).catch(errorWrapper)
                });
                
                if (binary)
                {
                    var p = this.ui.getPngFileProperties(this.ui.fileNode);
            
                    this.ui.getEmbeddedPng(mxUtils.bind(this, function(imageData)
                    {
                        doSave(imageData);
                    }), error, (this.ui.getCurrentFile() != this) ?
                        savedData : null, p.scale, p.border);
                }
                else
                {
                    doSave(savedData);
                }
        }

        LocalFile.prototype.getPublicUrl = function(fn)
        {
            fn(assetsDirPath + this.title);
        };
        //#endregion
  
    
        //#region Menus
        var menusInit = Menus.prototype.init;
        Menus.prototype.init = function()
        {
            menusInit.apply(this, arguments);
    
            var editorUi = this.editorUi;
    
            editorUi.actions.put('useOffline', new Action(mxResources.get('useOffline') + '...', function()
            {
                editorUi.openLink('https://www.draw.io/')
            }));
    
            editorUi.actions.put("copyLink", new Action(parent.drawioPlugin.i18n.copyAsSiYuanLink, function() {
                var file = editorUi.getCurrentFile();
                var urlParams = new URLSearchParams({
                    icon: "iconDrawio",
                    title: file.getTitle(),
                    data: JSON.stringify({ url: 'assets/drawio/' + file.getTitle() })
                })
                var link = `[${file.getTitle()}](siyuan://plugins/siyuan-drawio-plugin?${urlParams.toString()})`
                parent.navigator.clipboard.writeText(link).then(() => {
                    parent.showMessage(parent.drawioPlugin.i18n.linkCopiedToClipboard)
                }).catch(err => {
                    console.error('Failed to copy link: ', err);
                    parent.showMessage(err, 6000, "error")
                });
            }),)

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
                this.addMenuItems(menu, ['-', 'synchronize', '-', 'save', 'saveAs', '-', 'import'], parent);
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
        };
        //#endregion
    
        //#region Editor
        Editor.prototype.editAsNew = function(xml, title) {
            const href = decodeURIComponent(location.hash).slice(2)
            parent.drawioPlugin.openCustomTabByPath(href)
        }
        //#endregion

        //#region EditorUi
        // Initializes the user interface
        var editorUiInit = EditorUi.prototype.init;
        EditorUi.prototype.init = async function()
        {
            editorUiInit.apply(this, arguments);

            var editorUi = this;
            var graph = this.editor.graph;
                // Replaces new action
		    var oldNew = this.actions.get('new').funct;
		
            this.actions.addAction('new...', mxUtils.bind(this, function()
            {
                if (this.getCurrentFile() == null)
                {
                    oldNew();
                }
                else
                {
                    electron.sendMessage('newfile', {width: 1600});
                }
            }), null, null, Editor.ctrlKey + '+N');

            this.actions.get('open').shortcut = Editor.ctrlKey + '+O';
		
            // Adds shortcut keys for file operations
            editorUi.keyHandler.bindAction(78, true, 'new'); // Ctrl+N
            editorUi.keyHandler.bindAction(79, true, 'open'); // Ctrl+O
        }
        //#endregion
    }

})();