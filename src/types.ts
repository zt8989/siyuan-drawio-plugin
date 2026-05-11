import { Dialog } from "siyuan";

export interface ShowDialogCallback {
    (url: string, dialog: Dialog, isNew: boolean, value: string): void
}

export type Asset = {
    path: string;
    hName: string;
    updated: number;
    ext: string;
};

export interface DrawioConfig {
    language: string;
    configVersion: number | null;
    customFonts: string[];
    libraries: string;
    customLibraries: string[];
    defaultSavePath: string; // 新增：默认保存路径
}