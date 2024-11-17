/**
 * 
 * @param {import("@/index").default} drawioPlugin 
 * @returns 
 */
export function postConfig(drawioPlugin) {
    return function setup(global, electron) {
        setupEditorUi(global, electron)
        setupEditor(global, electron)
    }
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

    EditorUi.prototype.isStandaloneApp = function()
    {
        return true
    };
    //#endregion
}

function setupEditor(global, electron){
    //#region Editor
    const { Editor, EditorUi, mxUtils, location } = global
    // Editor.themes.push("simple");
    // Editor.themes.push("sketch");
    Editor.themes.push("atlas");
    Editor.prototype.editAsNew = function(xml, title) {
        const href = decodeURIComponent(location.hash).slice(2)
        electron.sendMessage("openTabByPath", href)
    }
    //#endregion
}