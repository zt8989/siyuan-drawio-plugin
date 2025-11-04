export function setup() {
    Editor.enableNativeClipboard = true
	
	EditorUi.prototype.isStandaloneApp = function()
	{
		return true
	};
}