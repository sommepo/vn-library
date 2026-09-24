export class Store {
  constructor(name = 'vnkit-local-v1') { this.name = name; this.db = null; }
  async open() {
    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('records');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error(`Browser storage unavailable: ${request.error?.message || 'IndexedDB denied'}`));
    });
  }
  async get(key) {
    return new Promise((resolve, reject) => {
      const request = this.db.transaction('records').objectStore('records').get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async put(key, value) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('records', 'readwrite');
      tx.objectStore('records').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(`Could not save browser data: ${tx.error?.message || 'storage quota or permission'}`));
      tx.onabort = () => reject(new Error('Browser storage transaction was aborted'));
    });
  }
  async delete(key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('records', 'readwrite');
      tx.objectStore('records').delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(`Could not delete browser save: ${tx.error?.message || 'storage permission'}`));
      tx.onabort = () => reject(new Error('Browser save deletion was aborted'));
    });
  }
  async replaceRecords(keys, expected, records, backupKey, backup) {
    // One IndexedDB transaction: compare, back up, and replace together. A
    // competing tab or quota failure must never leave half a save bank.
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('records', 'readwrite'), store = tx.objectStore('records');
      let remaining = keys.length, conflict = false;
      for (const key of keys) {
        const request = store.get(key);
        request.onsuccess = () => {
          if (JSON.stringify(request.result) !== JSON.stringify(expected[key])) { conflict = true; tx.abort(); return; }
          if (--remaining) return;
          try {
            store.put(backup, backupKey);
            for (const name of keys) {
              if (Object.hasOwn(records, name)) store.put(records[name], name);
              else store.delete(name);
            }
          } catch { tx.abort(); }
        };
      }
      tx.oncomplete = resolve;
      tx.onabort = () => reject(new Error(conflict ? 'Local saves changed in another tab. Reopen Save location and try again.' : 'Could not replace local saves. Nothing was changed.'));
      tx.onerror = () => {};
    });
  }
}
