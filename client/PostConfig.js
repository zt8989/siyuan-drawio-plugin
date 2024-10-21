/**
 * Copyright (c) 2006-2024, JGraph Ltd
 * Copyright (c) 2006-2024, draw.io AG
 */
// null'ing of global vars need to be after init.js
window.VSD_CONVERT_URL = null;
window.EMF_CONVERT_URL = null;
window.ICONSEARCH_PATH = null;

async function uploadFileToSiyuan(file, assetsDirPath) {
    const formData = new FormData();
    formData.append("assetsDirPath", assetsDirPath);
    formData.append("file[]", file);

    const response = await fetch("/api/asset/upload", {
        method: "POST",
        body: formData
    });

    return response
}

async function saveFileToSiyuan(file, fileName) {
    const assetsDirPath = "/assets/drawio/";
    const response = await uploadFileToSiyuan(file, assetsDirPath);
    
    if (response.ok) {
        const data = await response.json();
        if (data.code === 0 && data.data && data.data.succMap) {
            const newFilePath = data.data.succMap[fileName];
            const newTitle = newFilePath.split('/').pop();
            return { success: true, newTitle };
        }
    }
    
    return { success: false };
}

(async function()
{

    App.prototype.showSaveFilePicker = function(success, error, opts) {
        success(null, { name: opts.suggestedName })
    }

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
	// Overrides default mode
	App.mode = App.MODE_DEVICE;

	var menusInit = Menus.prototype.init;
	Menus.prototype.init = function()
	{
		menusInit.apply(this, arguments);

		var editorUi = this.editorUi;

		editorUi.actions.put('useOffline', new Action(mxResources.get('useOffline') + '...', function()
		{
			editorUi.openLink('https://www.draw.io/')
		}));
		
		this.put('openRecent', new Menu(function(menu, parent)
		{
			var recent = editorUi.getRecent();

			if (recent != null)
			{
				for (var i = 0; i < recent.length; i++)
				{
					(function(entry)
					{
						menu.addItem(entry.title, null, function()
						{
							function doOpenRecent()
							{
								//Simulate opening a file via args
								editorUi.loadArgs({args: [entry.id]});
							};
							
							var file = editorUi.getCurrentFile();
							
							if (file != null && file.isModified())
							{
								editorUi.confirm(mxResources.get('allChangesLost'), null, doOpenRecent,
									mxResources.get('cancel'), mxResources.get('discardChanges'));
							}
							else
							{
								doOpenRecent();
							}
						}, parent);
					})(recent[i]);
				}

				menu.addSeparator(parent);
			}

			menu.addItem(mxResources.get('reset'), null, function()
			{
				editorUi.resetRecent();
			}, parent);
		}));
		
		// Replaces file menu to replace openFrom menu with open and rename downloadAs to export
		this.put('file', new Menu(mxUtils.bind(this, function(menu, parent)
		{
			this.addMenuItems(menu, ['new', 'open'], parent);
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
})();