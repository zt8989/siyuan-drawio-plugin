import { setup as EditorSetup } from "./components/Editor"
import { setup as EditorUiSetup } from "./components/EditorUi"
import { setup as ThemeSetup } from "./components/Theme"
import { setup as MenuSetup } from "./components/Menus"
    /**
     * Copyright (c) 2006-2024, JGraph Ltd
     * Copyright (c) 2006-2024, draw.io AG
     */
    // null'ing of global vars need to be after init.js
    window.VSD_CONVERT_URL = null;
    window.EMF_CONVERT_URL = null;
    window.ICONSEARCH_PATH = null;
    const ASSETS_DIR_PATH = "assets/drawio/";

    if(window.parent.siyuan) {
        const electron = window.electron

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

        function getFullPathName() {
            return decodeURIComponent(location.hash.substring(2))
        }

        function getFullPath() {
            const fullPathName = getFullPathName()
            const lastSlashIndex = fullPathName.lastIndexOf('/');
            if(fullPathName) {
                return lastSlashIndex !== -1 ? fullPathName.substring(0, lastSlashIndex + 1) : '';
            } else {
                return ASSETS_DIR_PATH
            }
        }
    
        async function saveFileToSiyuan(content, title, fileType) {
            const blob = new Blob([content], { type: fileType.mimeType });
            const file = new File([blob], title, { type: fileType.mimeType });

            const data = await uploadFileToSiyuan(file, getFullPath());
            if (data.code === 0 && data.data && data.data.succMap) {
                const newFilePath = data.data.succMap[title];
                const newTitle = newFilePath.split('/').pop();
                return { success: true, newTitle };
            }
            
            return { success: false };
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
                electron.sendMessage("update_title", title)
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

        LocalFile.prototype.getPublicUrl = function(fn)
        {
            fn(getFullPathName());
        };
        //#endregion
  
    
        //#region Menus
        MenuSetup(electron)
        //#endregion
    
        //#region Editor
        Editor.prototype.editAsNew = function(xml, title) {
            const href = decodeURIComponent(location.hash).slice(2)
            electron.sendMessage("openTabByPath", href)
        }
        EditorSetup()
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
        EditorUiSetup()
        //#endregion

        //#region theme
        ThemeSetup()
        //#endregion
    }