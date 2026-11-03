import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { STORAGE_KEYS } from './persistenceSchema';

test('a fresh page edits an existing database and failed imports leave the previous snapshot intact', async () => {
  const factory = new IDBFactory();
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open('bgm-anitier-user-data-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>(resolve => {
    const tx = db.transaction('snapshots', 'readwrite');
    tx.objectStore('snapshots').put({ [STORAGE_KEYS.TITLE]: 'before restart', [STORAGE_KEYS.TIERS]: '{}', [STORAGE_KEYS.COMMENTS]: '[]' }, 'current');
    tx.oncomplete = () => resolve();
  });
  Object.assign(globalThis, { indexedDB: factory, window: { addEventListener() {} }, localStorage: { getItem: () => null } });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ persistent: false, state: null }));
  const read = () => new Promise<any>(resolve => { const r = db.transaction('snapshots').objectStore('snapshots').get('current'); r.onsuccess = () => resolve(r.result); });
  const prototype = Object.getPrototypeOf(db);
  const originalTransaction = prototype.transaction;
  try {
    const storage = await import('./appStorage');
    await storage.initializeStorage();
    storage.appStorage.setItem(STORAGE_KEYS.TITLE, 'after restart');
    await storage.flushStorage();
    assert.equal((await read())[STORAGE_KEYS.TITLE], 'after restart');
    prototype.transaction = function (...args: unknown[]) {
      const tx = originalTransaction.apply(this, args);
      if (args[1] === 'readwrite') queueMicrotask(() => tx.abort());
      return tx;
    };
    await assert.rejects(storage.importStorage({ [STORAGE_KEYS.TITLE]: 'must not partially import' }));
    assert.equal(storage.appStorage.getItem(STORAGE_KEYS.TITLE), 'after restart');
    assert.equal((await read())[STORAGE_KEYS.TITLE], 'after restart');
    prototype.transaction = originalTransaction;
    await storage.importStorage({ [STORAGE_KEYS.TITLE]: 'valid import' });
    await storage.restoreBeforeImport();
    assert.equal((await read())[STORAGE_KEYS.TITLE], 'after restart');
  } finally {
    prototype.transaction = originalTransaction;
    globalThis.fetch = oldFetch;
    db.close();
  }
});
