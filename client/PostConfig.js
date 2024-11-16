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
    const assetsDirPath = "assets/drawio/";

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
    
        async function saveFileToSiyuan(content, title, fileType) {
            const blob = new Blob([content], { type: fileType.mimeType });
            const file = new File([blob], title, { type: fileType.mimeType });

            const data = await uploadFileToSiyuan(file, assetsDirPath);
            if (data.code === 0 && data.data && data.data.succMap) {
                const newFilePath = data.data.succMap[title];
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
    
        var loadTemplate = App.prototype.loadTemplate 
        App.prototype.loadTemplate = function(url, onload, onerror, templateFilename, asLibrary)
        {
            if(url.startsWith("assets/")) {
                getFileContent({ path: url }).then((text) => {
                    onload(text)
                    this.setMode(App.MODE_DEVICE)
                }, onerror)
            } else {
                loadTemplate.apply(this, arguments);
            }
        }
        // #endregion
    
        // #region LocalFile 
        LocalFile.prototype.saveFile = function(title, revision, success, error, useCurrentData, unloading, overwrite)
        {
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
                // if (this.fileHandle != null)
                // {
                    // Sets shadow modified state during save
                    if (!this.savingFile)
                    {
                        this.savingFileTime = new Date();
                        this.savingFile = true;
                        
                        var errorWrapper = mxUtils.bind(this, function(e)
                        {
                            this.savingFile = false;
                            
                            if (error != null)
                            {
                                // Wraps error object to offer save status option
                                error({error: e});
                            }
                        });
                        
                        // Saves a copy as a draft while saving
                        this.saveDraft(savedData);
                        
                        const extension = title.split('.').pop().toLowerCase();
    
                        const fileType = this.ui.editor.diagramFileTypes.find(type => type.extension === extension);
                        if (!fileType) {
                            throw new Error(`Unsupported file extension: ${extension}`);
                        }
                        let content = (binary) ? this.ui.base64ToBlob(data, 'image/png') : data
                        saveFileToSiyuan(content, title, title, fileType).then(result => {
                            if (result.success) {
                                var desc = null
                                this.title = result.newTitle;
                                var lastDesc = this.desc;
                                this.savingFile = false;
                                this.desc = desc;
                                this.fileSaved(savedData, lastDesc, done, errorWrapper);
                                
                                // Deletes draft after saving
                                this.removeDraft();
                            } else {
                                errorWrapper(new Error('Failed to save file to SiYuan'));
                            }
                        }).catch(errorWrapper)
                }
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
        };

        // 不需要公共URL
        // LocalFile.prototype.getPublicUrl = function(fn)
        // {
        //     fn(assetsDirPath + this.title);
        // };
        //#endregion
  
    
        //#region Menus
        var menusInit = Menus.prototype.init;
        Menus.prototype.init = function()
        {
            menusInit.apply(this, arguments);
    
            var editorUi = this.editorUi;
    
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
                this.addMenuItems(menu, ['new', 'open'/*, 'copyLink'*/], parent);
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
            electron.sendMessage("openTabByPath", href)
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