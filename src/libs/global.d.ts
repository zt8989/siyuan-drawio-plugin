import { fetchPost, fetchSyncPost } from "siyuan";

declare global {
    interface Window {
        fetchPost: typeof fetchPost;
        fetchSyncPost: typeof fetchSyncPost;
    }
}