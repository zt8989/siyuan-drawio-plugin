const typePrefix = "drawio_"
import { getFileText, upload } from "@/api";

const assetsDirPath = "assets/drawio/";
/**
 * 
 * @param {import("@/index").default} drawioPlugin 
 * @returns 
 */
export function postConfig(drawioPlugin) {
    /**
     * @param {Drawio} global
     */
    return function setup(global) {
        const callbacks = {}
        //#region public method
        global.addEventListener('message', function(event) {
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
                global.parent.postMessage({
                    type: typePrefix + type,
                    payload,
                    callbackId
                })
            }
        }

        //#endregion
        setupApp(global);
        setupLocalFile(global);
        setupMenus(global, electron);
        setupEditorUi(global, electron)
        setupEditor(global, electron)
    }
}  

async function getFileContent(data) {
    if(data.path) {
        if(data.path.startsWith("/assets")) {
            data.path =  "/data" + data.path
        } else if (data.path.startsWith("assets")) {
            data.path =  "/data/" + data.path
        }
    }

    return getFileText(data.path)
}

async function saveFileToSiyuan(content, title, fileType) {
    const blob = new Blob([content], { type: fileType.mimeType });
    const file = new File([blob], title, { type: fileType.mimeType });

    const data = await upload(assetsDirPath, [file]);
    const newFilePath = data.succMap[title];
    const newTitle = newFilePath.split('/').pop();
    return { success: true, newTitle };
}

function loadFile(app, url) {
    app.loadFile("U" + encodeURIComponent(url), true)
}

/**
 * @param {Drawio} global
 */
function setupApp(global) {
    const { App } = global
    // #region App 
    // Overrides default mode
    App.mode = App.MODE_DEVICE;

    App.prototype.showSaveFilePicker = function (success, error, opts) {
        success(null, { name: opts.suggestedName });
    };

    App.prototype.fetchAndShowNotification = function () { };

    var loadTemplate = App.prototype.loadTemplate;
    App.prototype.loadTemplate = function (url, onload, onerror) {
        if (url.startsWith("assets/")) {
            getFileContent({ path: url }).then((text) => {
                onload(text);
                this.setMode(App.MODE_DEVICE);
            }, onerror);
        } else {
            loadTemplate.apply(this, arguments);
        }
    };
    // #endregion
}

/**
 * @param {Drawio} global
 */
function setupLocalFile(global) {
    const { LocalFile, mxUtils } = global
    // #region LocalFile 
    LocalFile.prototype.saveFile = function (title, revision, success, error, useCurrentData) {
        if (title != this.title) {
            this.fileHandle = null;
            this.desc = null;
            this.editable = null;
        }

        this.title = title;

        // Updates data after changing file name
        if (!useCurrentData) {
            this.updateFileData();
        }

        var binary = this.ui.useCanvasForExport && /(\.png)$/i.test(this.getTitle());
        this.setShadowModified(false);
        var savedData = this.getData();

        var done = mxUtils.bind(this, function () {
            this.setModified(this.getShadowModified());
            this.contentChanged();

            if (success != null) {
                success();
            }
        });

        var doSave = mxUtils.bind(this, function (data) {
            // if (this.fileHandle != null)
            // {
            // Sets shadow modified state during save
            if (!this.savingFile) {
                this.savingFileTime = new Date();
                this.savingFile = true;

                var errorWrapper = mxUtils.bind(this, function (e) {
                    this.savingFile = false;

                    if (error != null) {
                        // Wraps error object to offer save status option
                        error({ error: e });
                    }
                });

                // Saves a copy as a draft while saving
                this.saveDraft(savedData);

                const extension = title.split('.').pop().toLowerCase();

                const fileType = this.ui.editor.diagramFileTypes.find(type => type.extension === extension);
                if (!fileType) {
                    throw new Error(`Unsupported file extension: ${extension}`);
                }
                let content = (binary) ? this.ui.base64ToBlob(data, 'image/png') : data;
                saveFileToSiyuan(content, title, fileType).then(result => {
                    var desc = null;
                    this.title = result.newTitle;
                    var lastDesc = this.desc;
                    this.savingFile = false;
                    this.desc = desc;
                    this.fileSaved(savedData, lastDesc, done, errorWrapper);

                    // Deletes draft after saving
                    this.removeDraft();
                }).catch(errorWrapper);
            }
        });

        if (binary) {
            var p = this.ui.getPngFileProperties(this.ui.fileNode);

            this.ui.getEmbeddedPng(mxUtils.bind(this, function (imageData) {
                doSave(imageData);
            }), error, (this.ui.getCurrentFile() != this) ?
                savedData : null, p.scale, p.border);
        }

        else {
            doSave(savedData);
        }
    };

    // 不需要公共URL
    // LocalFile.prototype.getPublicUrl = function(fn)
    // {
    //     fn(assetsDirPath + this.title);
    // };
    //#endregion
}

/**
 * @param {Drawio} global
 */
function setupMenus(global, electron) {
    const { Action, mxUtils, Menus, Menu, mxResources } = global
    //#region Menus
    var menusInit = Menus.prototype.init;
    Menus.prototype.init = function () {
        menusInit.apply(this, arguments);

        var editorUi = this.editorUi;

        // 不需要复制链接，建议直接使用`/`命令
        // editorUi.actions.put("copyLink", new Action(parent.drawioPlugin.i18n.copyAsSiYuanLink, function() {
        //     var file = editorUi.getCurrentFile();
        //     electron.sendMessage("copyLink", file.getTitle())
        // }),)
        editorUi.actions.put("open", new Action(mxResources.get('open'), function () {
            electron.sendMessage("open", null, "open" + (new Date).getTime(), (url) => {
                loadFile(editorUi, url);
            });
        }));

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
        this.put('file', new Menu(mxUtils.bind(this, function (menu, parent) {
            this.addMenuItems(menu, ['new', 'open' /*, 'copyLink'*/], parent);
            this.addSubmenu('openRecent', menu, parent);
            this.addMenuItems(menu, ['-', 'synchronize', '-', 'save', 'saveAs', '-', 'import'], parent);
            this.addSubmenu('exportAs', menu, parent);
            menu.addSeparator(parent);
            this.addSubmenu('embed', menu, parent);
            menu.addSeparator(parent);
            this.addMenuItems(menu, ['newLibrary', 'openLibrary'], parent);

            var file = editorUi.getCurrentFile();

            if (file != null && editorUi.fileNode != null) {
                var filename = (file.getTitle() != null) ?
                    file.getTitle() : editorUi.defaultFilename;

                if (!/(\.html)$/i.test(filename) &&
                    !/(\.svg)$/i.test(filename)) {
                    this.addMenuItems(menu, ['-', 'properties']);
                }
            }

            this.addMenuItems(menu, ['-', 'pageSetup', 'print', '-', 'close', '-', 'exit'], parent);
        })));
    };
    //#endregion

}

function setupEditorUi(global, electron) {
    const { Editor, EditorUi, mxUtils } = global
    //#region EditorUi
    // Initializes the user interface
    var editorUiInit = EditorUi.prototype.init;
    EditorUi.prototype.init = async function()
    {
        editorUiInit.apply(this, arguments);
        EditorUi.enablePlantUml = true

        var editorUi = this;
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

    EditorUi.prototype.isStandaloneApp = function()
    {
        return true
    };
    //#endregion
}

/**
 * @param {Drawio} global
 */
function setupEditor(global, electron){
    //#region Editor
    const { Editor, location } = global
    // Editor.themes.push("simple");
    // Editor.themes.push("sketch");
    Editor.themes.push("atlas");
    Editor.prototype.editAsNew = function() {
        const href = decodeURIComponent(location.hash).slice(2)
        electron.sendMessage("openTabByPath", href)
    }
    //#endregion
}