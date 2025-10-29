export function setup() {
    Editor.enableNativeCipboard = true

    EditorUi.prototype.isStandaloneApp = function()
	{
		return true
	};
}