import { NoopElectronImpl } from "./Electron";
import { logger } from "./logger";

class Storage {
  constructor(debug = false) {
    this.storage = window.localStorage;
    this.debug = debug;
    this.electron = new NoopElectronImpl()
  }

  setElectron(electron){
    this.electron = electron
  }

  getItem(key) {
    logger.debug('Storage.getItem:', { key });
    const result = this.storage.getItem(key);
    logger.debug('Storage.getItem result:', result);
    return result;
  }

  setItem(key, value) {
    logger.debug('Storage.setItem:', { key, value });
    return this.storage.setItem(key, value);
  }

  removeItem(key) {
    logger.debug('Storage.removeItem:', { key });
    return this.storage.removeItem(key);
  }

  clear() {
    logger.debug('Storage.clear');
    return this.storage.clear();
  }

  key(index) {
    logger.debug('Storage.key:', { index });
    const result = this.storage.key(index);
    logger.debug('Storage.key result:', result);
    return result;
  }

  get length() {
    logger.debug('Storage.length');
    const result = this.storage.length;
    logger.debug('Storage.length result:', result);
    return result;
  }
}

export default Storage;
