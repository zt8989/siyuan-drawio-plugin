import { NoopElectronImpl } from "./Electron";

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
    if (this.debug) {
      console.log('Storage.getItem:', { key });
    }
    const result = this.storage.getItem(key);
    if (this.debug) {
      console.log('Storage.getItem result:', result);
    }
    return result;
  }

  setItem(key, value) {
    if (this.debug) {
      console.log('Storage.setItem:', { key, value });
    }
    return this.storage.setItem(key, value);
  }

  removeItem(key) {
    if (this.debug) {
      console.log('Storage.removeItem:', { key });
    }
    return this.storage.removeItem(key);
  }

  clear() {
    if (this.debug) {
      console.log('Storage.clear');
    }
    return this.storage.clear();
  }

  key(index) {
    if (this.debug) {
      console.log('Storage.key:', { index });
    }
    const result = this.storage.key(index);
    if (this.debug) {
      console.log('Storage.key result:', result);
    }
    return result;
  }

  get length() {
    if (this.debug) {
      console.log('Storage.length');
    }
    const result = this.storage.length;
    if (this.debug) {
      console.log('Storage.length result:', result);
    }
    return result;
  }
}

export default Storage;
