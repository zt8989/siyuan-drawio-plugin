import { Dialog } from "siyuan";

export interface ShowDialogCallback {
    (url: string, dialog: Dialog, isNew: boolean, value: string): void
}

export type Asset = {
    path: string;
    hName: string;
};