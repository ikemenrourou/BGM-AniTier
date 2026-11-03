import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { STORAGE_KEYS, STUDIO_STORAGE_KEYS } from './persistenceSchema';
import { createBackup, parseBackup } from './backup';

test('browser migration, large backup import, rollback, and stale-tab protection use atomic IndexedDB writes', async () => {
  const factory = new IDBFactory();
  const legacy = new Map([
    [STORAGE_KEYS.TIERS, '{}'], [STORAGE_KEYS.UNRANKED_POOL, '[]'], [STORAGE_KEYS.COMMENTS, '[]'],
    [STORAGE_KEYS.TIERS_BACKUP, JSON.stringify({ '10': [{ id: 1, title: 'must not resurrect', cover: '' }] })],
    [STUDIO_STORAGE_KEYS.SPEECH_SPEED, '0.75'],
  ]);
  Object.assign(globalThis, { indexedDB: factory, window: { addEventListener() {} }, localStorage: { getItem: (key: string) => legacy.get(key) ?? null } });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ state: { boardTitle: 'restored', tiers: { '10': [] } }, persistent: false, storageVersion: 1 }));
  try {
    const storage = await import('./appStorage');
    await storage.initializeStorage();
    assert.equal(storage.appStorage.getItem(STORAGE_KEYS.TITLE), 'restored');
    assert.equal(storage.appStorage.getItem(STORAGE_KEYS.TIERS), '{}');
    assert.equal(storage.appStorage.getItem(STUDIO_STORAGE_KEYS.SPEECH_SPEED), '0.75');
    const backup = createBackup(storage.appStorage.snapshot());
    backup.boardTitle = 'large image import';
    backup.customBgUrl = 'data:image/png;base64,' + 'A'.repeat(6 * 1024 * 1024);
    await storage.importStorage(parseBackup(backup));
    assert.equal(storage.appStorage.getItem(STORAGE_KEYS.CUSTOM_BG)?.length, backup.customBgUrl.length);
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = factory.open('bgm-anitier-user-data-v1', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const read = () => new Promise<any>(resolve => { const r = db.transaction('snapshots').objectStore('snapshots').get('current'); r.onsuccess = () => resolve(r.result); });
    assert.equal((await read())[STORAGE_KEYS.TITLE], 'large image import');
    await storage.restoreBeforeImport();
    assert.equal(storage.appStorage.getItem(STORAGE_KEYS.TITLE), 'restored');
    assert.equal(storage.appStorage.getItem(STORAGE_KEYS.CUSTOM_BG), '');
    // Another tab writes a newer title while this tab still holds the old value.
    await new Promise<void>(resolve => { const tx = db.transaction('snapshots', 'readwrite'); const s = tx.objectStore('snapshots'); const r = s.get('current'); r.onsuccess = () => s.put({ ...r.result, [STORAGE_KEYS.TITLE]: 'other tab' }, 'current'); tx.oncomplete = () => resolve(); });
    storage.appStorage.setItem(STORAGE_KEYS.TITLE, 'stale edit');
    await assert.rejects(storage.flushStorage(), /另一页面/);
    assert.equal((await read())[STORAGE_KEYS.TITLE], 'other tab');
    db.close();
  } finally { globalThis.fetch = originalFetch; }
});
