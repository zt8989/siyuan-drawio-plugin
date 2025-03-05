/**
 * Copyright (c) 2023 frostime. All rights reserved.
 * https://github.com/frostime/sy-plugin-template-vite
 * 
 * See API Document in [API.md](https://github.com/siyuan-note/siyuan/blob/master/API.md)
 * API 文档见 [API_zh_CN.md](https://github.com/siyuan-note/siyuan/blob/master/API_zh_CN.md)
 */

import { fetchPost, fetchSyncPost, IWebSocketData } from "siyuan";
import { checkInvalidPathChar } from "./utils";
import { blankDrawio, DRAWIO_EXTENSION, drawioAssetsPath, DATA_PATH, STORAGE_PATH } from "./constants";
import { saveContentAsFile } from "./file";
import { createUrlFromTitle } from "./link";
import { Asset } from "./types";


export async function request(url: string, data: any) {
    let response: IWebSocketData = await fetchSyncPost(url, data);
    let res = response.code === 0 ? response.data : null;
    return res;
}


// **************************************** Noteboook ****************************************


export async function lsNotebooks(): Promise<IReslsNotebooks> {
    let url = '/api/notebook/lsNotebooks';
    return request(url, '');
}


export async function openNotebook(notebook: NotebookId) {
    let url = '/api/notebook/openNotebook';
    return request(url, { notebook: notebook });
}


export async function closeNotebook(notebook: NotebookId) {
    let url = '/api/notebook/closeNotebook';
    return request(url, { notebook: notebook });
}


export async function renameNotebook(notebook: NotebookId, name: string) {
    let url = '/api/notebook/renameNotebook';
    return request(url, { notebook: notebook, name: name });
}


export async function createNotebook(name: string): Promise<Notebook> {
    let url = '/api/notebook/createNotebook';
    return request(url, { name: name });
}


export async function removeNotebook(notebook: NotebookId) {
    let url = '/api/notebook/removeNotebook';
    return request(url, { notebook: notebook });
}


export async function getNotebookConf(notebook: NotebookId): Promise<IResGetNotebookConf> {
    let data = { notebook: notebook };
    let url = '/api/notebook/getNotebookConf';
    return request(url, data);
}


export async function setNotebookConf(notebook: NotebookId, conf: NotebookConf): Promise<NotebookConf> {
    let data = { notebook: notebook, conf: conf };
    let url = '/api/notebook/setNotebookConf';
    return request(url, data);
}


// **************************************** File Tree ****************************************
export async function createDocWithMd(notebook: NotebookId, path: string, markdown: string): Promise<DocumentId> {
    let data = {
        notebook: notebook,
        path: path,
        markdown: markdown,
    };
    let url = '/api/filetree/createDocWithMd';
    return request(url, data);
}


export async function renameDoc(notebook: NotebookId, path: string, title: string): Promise<DocumentId> {
    let data = {
        doc: notebook,
        path: path,
        title: title
    };
    let url = '/api/filetree/renameDoc';
    return request(url, data);
}


export async function removeDoc(notebook: NotebookId, path: string) {
    let data = {
        notebook: notebook,
        path: path,
    };
    let url = '/api/filetree/removeDoc';
    return request(url, data);
}


export async function moveDocs(fromPaths: string[], toNotebook: NotebookId, toPath: string) {
    let data = {
        fromPaths: fromPaths,
        toNotebook: toNotebook,
        toPath: toPath
    };
    let url = '/api/filetree/moveDocs';
    return request(url, data);
}


export async function getHPathByPath(notebook: NotebookId, path: string): Promise<string> {
    let data = {
        notebook: notebook,
        path: path
    };
    let url = '/api/filetree/getHPathByPath';
    return request(url, data);
}


export async function getHPathByID(id: BlockId): Promise<string> {
    let data = {
        id: id
    };
    let url = '/api/filetree/getHPathByID';
    return request(url, data);
}


export async function getIDsByHPath(notebook: NotebookId, path: string): Promise<BlockId[]> {
    let data = {
        notebook: notebook,
        path: path
    };
    let url = '/api/filetree/getIDsByHPath';
    return request(url, data);
}

// **************************************** Asset Files ****************************************

export async function upload(assetsDirPath: string, files: any[]): Promise<IResUpload> {
    let form = new FormData();
    form.append('assetsDirPath', assetsDirPath);
    for (let file of files) {
        form.append('file[]', file);
    }
    let url = '/api/asset/upload';
    return request(url, form);
}

// **************************************** Block ****************************************
type DataType = "markdown" | "dom";
export async function insertBlock(
    dataType: DataType, data: string,
    nextID?: BlockId, previousID?: BlockId, parentID?: BlockId
): Promise<IResdoOperations[]> {
    let payload = {
        dataType: dataType,
        data: data,
        nextID: nextID,
        previousID: previousID,
        parentID: parentID
    }
    let url = '/api/block/insertBlock';
    return request(url, payload);
}


export async function prependBlock(dataType: DataType, data: string, parentID: BlockId | DocumentId): Promise<IResdoOperations[]> {
    let payload = {
        dataType: dataType,
        data: data,
        parentID: parentID
    }
    let url = '/api/block/prependBlock';
    return request(url, payload);
}


export async function appendBlock(dataType: DataType, data: string, parentID: BlockId | DocumentId): Promise<IResdoOperations[]> {
    let payload = {
        dataType: dataType,
        data: data,
        parentID: parentID
    }
    let url = '/api/block/appendBlock';
    return request(url, payload);
}


export async function updateBlock(dataType: DataType, data: string, id: BlockId): Promise<IResdoOperations[]> {
    let payload = {
        dataType: dataType,
        data: data,
        id: id
    }
    let url = '/api/block/updateBlock';
    return request(url, payload);
}


export async function deleteBlock(id: BlockId): Promise<IResdoOperations[]> {
    let data = {
        id: id
    }
    let url = '/api/block/deleteBlock';
    return request(url, data);
}


export async function moveBlock(id: BlockId, previousID?: PreviousID, parentID?: ParentID): Promise<IResdoOperations[]> {
    let data = {
        id: id,
        previousID: previousID,
        parentID: parentID
    }
    let url = '/api/block/moveBlock';
    return request(url, data);
}


export async function foldBlock(id: BlockId) {
    let data = {
        id: id
    }
    let url = '/api/block/foldBlock';
    return request(url, data);
}


export async function unfoldBlock(id: BlockId) {
    let data = {
        id: id
    }
    let url = '/api/block/unfoldBlock';
    return request(url, data);
}


export async function getBlockKramdown(id: BlockId): Promise<IResGetBlockKramdown> {
    let data = {
        id: id
    }
    let url = '/api/block/getBlockKramdown';
    return request(url, data);
}


export async function getChildBlocks(id: BlockId): Promise<IResGetChildBlock[]> {
    let data = {
        id: id
    }
    let url = '/api/block/getChildBlocks';
    return request(url, data);
}

export async function transferBlockRef(fromID: BlockId, toID: BlockId, refIDs: BlockId[]) {
    let data = {
        fromID: fromID,
        toID: toID,
        refIDs: refIDs
    }
    let url = '/api/block/transferBlockRef';
    return request(url, data);
}

// **************************************** Attributes ****************************************
export async function setBlockAttrs(id: BlockId, attrs: { [key: string]: string }) {
    let data = {
        id: id,
        attrs: attrs
    }
    let url = '/api/attr/setBlockAttrs';
    return request(url, data);
}


export async function getBlockAttrs(id: BlockId): Promise<{ [key: string]: string }> {
    let data = {
        id: id
    }
    let url = '/api/attr/getBlockAttrs';
    return request(url, data);
}

// **************************************** SQL ****************************************

export async function sql(sql: string): Promise<any[]> {
    let sqldata = {
        stmt: sql,
    };
    let url = '/api/query/sql';
    return request(url, sqldata);
}

export async function getBlockByID(blockId: string): Promise<Block> {
    let sqlScript = `select * from blocks where id ='${blockId}'`;
    let data = await sql(sqlScript);
    return data[0];
}

// **************************************** Template ****************************************

export async function render(id: DocumentId, path: string): Promise<IResGetTemplates> {
    let data = {
        id: id,
        path: path
    }
    let url = '/api/template/render';
    return request(url, data);
}


export async function renderSprig(template: string): Promise<string> {
    let url = '/api/template/renderSprig';
    return request(url, { template: template });
}

// **************************************** File ****************************************

export async function getFile(path: string): Promise<any> {
    let data = {
        path: path
    }
    let url = '/api/file/getFile';
    return new Promise((resolve, _) => {
        fetchPost(url, data, (content: any) => {
            resolve(content)
        });
    });
}


/**
 * fetchPost will secretly convert data into json, this func merely return Blob
 * @param endpoint 
 * @returns 
 */
export const getFileBlob = async (path: string): Promise<Blob | null> => {
    const endpoint = '/api/file/getFile'
    let response = await fetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
            path: path
        })
    });
    if (!response.ok) {
        return null;
    }
    let data = await response.blob();
    return data;
}


export async function putFile(path: string, isDir: boolean, file: any) {
    let form = new FormData();
    form.append('path', path);
    form.append('isDir', isDir.toString());
    form.append('modTime', Date.now().toString());
    form.append('file', file);
    let url = '/api/file/putFile';
    return request(url, form);
}

export async function removeFile(path: string) {
    let data = {
        path: path
    }
    let url = '/api/file/removeFile';
    return request(url, data);
}

export async function renameFile(newPath: string, path: string) {
    let data = {
        newPath,
        path
    }
    let url = '/api/file/renameFile';
    return fetchSyncPost(url, data);
}

export async function readDir(path: string): Promise<IResReadDir[]> {
    let data = {
        path: path
    }
    let url = '/api/file/readDir';
    return request(url, data);
}

/**
 * List drawio files from specified directories
 * @param dirs Array of directory paths to search in (without DATA_PATH prefix)
 * @returns Array of Asset objects
 */
export async function listDrawioFiles(dirs?: string[]): Promise<Asset[]> {
    const assets: Asset[] = [];
    
    // Use default directories if none specified
    const dirsToSearch = dirs || [
        STORAGE_PATH, // plugin location
        'assets' // assets location
        
    ];
    
    // Helper function to scan a directory for drawio files
    async function scanDirectory(path: string) {
        try {
            const files = await readDir(path);
            for (const file of files) {
                const fullPath = path + '/' + file.name;
                if (file.isDir) {
                    await scanDirectory(fullPath);
                } else if (file.name.endsWith(DRAWIO_EXTENSION)) {
                    const nameWithoutExt = file.name.slice(0, -DRAWIO_EXTENSION.length);
                    const parts = nameWithoutExt.split('-');
                    const baseName = parts.length >= 3 ? 
                        nameWithoutExt.slice(0, -(parts.slice(-2).join('-').length + 1)) : 
                        nameWithoutExt;
                    assets.push({
                        path: fullPath.substring(6),  // 移除 '/data/' 前缀
                        hName: baseName,
                        updated: file.updated
                    });
                }
            }
        } catch (err) {
            console.warn(`Failed to read directory ${path}:`, err);
        }
    }
    
    // Scan all specified directories
    for (const dir of dirsToSearch) {
        await scanDirectory(DATA_PATH + dir);
    }
    
    return assets.sort((a, b) => a.hName.localeCompare(b.hName, undefined, { numeric: true, sensitivity: 'base' }));
}

/**
 * Search for drawio files matching a keyword
 * @param keyword Search keyword
 * @param dirs Optional array of directory paths to search in
 * @returns Filtered array of Asset objects
 */
export async function searchDrawioFiles(keyword: string, dirs?: string[]): Promise<Asset[]> {
    const assets = await listDrawioFiles(dirs);
    if (!keyword) {
        return assets;
    }
    
    const lowerKeyword = keyword.toLowerCase();
    return assets.filter(asset => 
        asset.hName.toLowerCase().includes(lowerKeyword) || 
        asset.path.toLowerCase().includes(lowerKeyword)
    );
}

/**
 * Save drawio XML content to file
 * @param value Filename to save
 * @returns Object with success status and path
 */
export async function saveDrawIoXml(value: string) {
    if(!value || checkInvalidPathChar(value)) {
        throw new Error(`Drawio: 名称 ${value} 不合法`);
    }
    let filename;
    let filenameNoId;

    filename = value + "-" + generateSiyuanId() + DRAWIO_EXTENSION;
    filenameNoId = value + DRAWIO_EXTENSION
    
    const file = saveContentAsFile(value, blankDrawio);
    const path = DATA_PATH + STORAGE_PATH + '/' + filename;
    
    try {
        const response = await putFile(path, false, file);
        // Return standardized format to work with both older and newer versions
        return {
                succMap: {
                [filenameNoId]: STORAGE_PATH + '/' + filename 
            }
        };
    } catch (error) {
        console.error("Error saving drawio file:", error);
        throw error;
    }
}

function generateSiyuanId() {
    const now = new Date();

    // 生成时间戳部分 YYYYMMDDHHMMSS
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');

    const timestamp = `${year}${month}${day}${hours}${minutes}${seconds}`;

    // 生成 7 位随机字母
    const characters = 'abcdefghijklmnopqrstuvwxyz';
    let random = '';
    for (let i = 0; i < 7; i++) {
        random += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    return `${timestamp}-${random}`;
}

export async function renameDrawIo(name: string, oldPath: string) {
    if(!name || checkInvalidPathChar(name)) {
        throw new Error(`Drawio: 名称 ${name} 不合法`)
    }
    // 从旧路径提取时间戳和ID部分
    const oldName = oldPath.split('/').pop() || '';
    const oldPathWithoutFileName = oldPath.slice(0, -oldName.length);
    const parts = oldName.split('-');
    const suffix = parts.length >= 3 ? `-${parts.slice(-2).join('-')}` : '';
    
    const newName = name.endsWith(DRAWIO_EXTENSION) ? name : name + suffix;
    const newPath = DATA_PATH + oldPathWithoutFileName + newName;
    const res = await renameFile(newPath, DATA_PATH + oldPath)
    if(res.code === 0) {
        return res.data
    } else {
        throw new Error(res.msg)
    }
}

// **************************************** Export ****************************************

export async function exportMdContent(id: DocumentId): Promise<IResExportMdContent> {
    let data = {
        id: id
    }
    let url = '/api/export/exportMdContent';
    return request(url, data);
}

export async function exportResources(paths: string[], name: string): Promise<IResExportResources> {
    let data = {
        paths: paths,
        name: name
    }
    let url = '/api/export/exportResources';
    return request(url, data);
}

// **************************************** Convert ****************************************

export type PandocArgs = string;
export async function pandoc(args: PandocArgs[]) {
    let data = {
        args: args
    }
    let url = '/api/convert/pandoc';
    return request(url, data);
}

// **************************************** Notification ****************************************

// /api/notification/pushMsg
// {
//     "msg": "test",
//     "timeout": 7000
//   }
export async function pushMsg(msg: string, timeout: number = 7000) {
    let payload = {
        msg: msg,
        timeout: timeout
    };
    let url = "/api/notification/pushMsg";
    return request(url, payload);
}

export async function pushErrMsg(msg: string, timeout: number = 7000) {
    let payload = {
        msg: msg,
        timeout: timeout
    };
    let url = "/api/notification/pushErrMsg";
    return request(url, payload);
}

// **************************************** Network ****************************************
export async function forwardProxy(
    url: string, method: string = 'GET', payload: any = {},
    headers: any[] = [], timeout: number = 7000, contentType: string = "text/html"
): Promise<IResForwardProxy> {
    let data = {
        url: url,
        method: method,
        timeout: timeout,
        contentType: contentType,
        headers: headers,
        payload: payload
    }
    let url1 = '/api/network/forwardProxy';
    return request(url1, data);
}


// **************************************** System ****************************************

export async function bootProgress(): Promise<IResBootProgress> {
    return request('/api/system/bootProgress', {});
}


export async function version(): Promise<string> {
    return request('/api/system/version', {});
}


export async function currentTime(): Promise<number> {
    return request('/api/system/currentTime', {});
}

export async function searchAsset(k: string, exts: string[]): Promise<Asset[]> {
    return request('/api/search/searchAsset', { k, exts });
}

