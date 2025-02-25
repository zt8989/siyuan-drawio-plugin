export const blankDrawio = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>'
export const drawioPath = "/assets/drawio/";
export const xml = 'text/xml';

export const diagramFileTypes = [
    {description: 'diagramXmlDesc', extension: 'drawio', mimeType: xml},
    {description: 'diagramPngDesc', extension: 'png', mimeType: 'image/png'},
    {description: 'diagramSvgDesc', extension: 'svg', mimeType: 'image/svg'},
    {description: 'diagramHtmlDesc', extension: 'html', mimeType: 'text/html'}];


export abstract class Constants {
        // assets
    public static readonly SIYUAN_ASSETS_IMAGE: string[] = [".apng", ".ico", ".cur", ".jpg", ".jpe", ".jpeg", ".jfif", ".pjp", ".pjpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".avif"];
    public static readonly SIYUAN_ASSETS_AUDIO: string[] = [".mp3", ".wav", ".ogg", ".m4a", ".aac"];
    public static readonly SIYUAN_ASSETS_VIDEO: string[] = [".mov", ".weba", ".mkv", ".mp4", ".webm"];
    public static readonly SIYUAN_ASSETS_EXTS: string[] = [".pdf"].concat(Constants.SIYUAN_ASSETS_IMAGE).concat(Constants.SIYUAN_ASSETS_AUDIO).concat(Constants.SIYUAN_ASSETS_VIDEO);
    public static readonly SIYUAN_ASSETS_SEARCH: string[] = [".txt", ".md", ".markdown", ".docx", ".xlsx", ".pptx", ".pdf", ".json", ".log", ".sql", ".html", ".xml", ".java", ".h", ".c",
        ".cpp", ".go", ".rs", ".swift", ".kt", ".py", ".php", ".js", ".css", ".ts", ".sh", ".bat", ".cmd", ".ini", ".yaml",
        ".rst", ".adoc", ".textile", ".opml", ".org", ".wiki", ".epub"];
    public static readonly ZWSP: string = "\u200b";

}


export const PREFIX = "drawio_";
export const TAB_TYPE = PREFIX + "tab";
export const OPEN_TYPE = PREFIX + "open";
export const UPDATE_TITLE = PREFIX + "update_title";
export const NEW_TYPE = PREFIX + "newfile"
export const CALLBAK_TYPE = PREFIX + "callback"
export const SHOW_MESSAGE = PREFIX + "showMessage"
export const COPY_LINK = PREFIX + "copyLink"
export const OPEN_TAB_BY_PATH = PREFIX + "openTabByPath"
export const SET_ITEM = PREFIX + "setItem"
export const DRAWIO_CONFIG = '.drawio-config'
export const ICON_STANDARD = "icon-drawio-standard"
export const DOCK_TYPE = PREFIX + "dock"
