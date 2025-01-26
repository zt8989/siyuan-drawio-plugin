import { SettingUtils } from "./setting-utils";
import { Plugin } from "siyuan";
import { DEFAULT_SAVE_PATH } from "../constants";

export class DrawioSettings extends SettingUtils {
    constructor(plugin: Plugin) {
        super({
            plugin,
            name: 'drawio-settings',
            callback: () => {
                // Reload configuration when settings change
                plugin.data['drawio-settings'] = this.dump();
            }
        });

        // Add default save path setting
        this.addItem({
            key: 'savePath', 
            title: '默认保存路径',
            description: 'Drawio 文件的默认保存路径 (必须以assets/开头)',
            type: 'textinput',
            value: DEFAULT_SAVE_PATH,
            validator: (value: string) => {
                if (!value || !value.startsWith('assets/')) {
                    return '保存路径必须以assets/开头且不能为空';
                }
                return true;
            }
        });

        this.load();
    }

    getSavePath(): string {
        return this.get('savePath') || DEFAULT_SAVE_PATH;
    }
}
