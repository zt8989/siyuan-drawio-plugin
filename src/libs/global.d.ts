import { fetchPost, fetchSyncPost, showMessage } from "siyuan";
import DrawioPlugin from "..";

declare global {
    interface Window {
        fetchPost: typeof fetchPost;
        fetchSyncPost: typeof fetchSyncPost;
        showMessage: typeof showMessage;
        drawioPlugin: DrawioPlugin;
    }
}