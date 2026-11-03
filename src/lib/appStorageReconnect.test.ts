import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import forceCloseDatabase from 'fake-indexeddb/lib/forceCloseDatabase';
import { STORAGE_KEYS, type StorageValues } from './persistenceSchema';
import { createBackup, parseBackup } from './backup';

test('lost IndexedDB connections recover without losing edits or bypassing conflict protection', async t => {
  const factory = new IDBFactory();
  const open = factory.open.bind(factory);
  const connections: IDBDatabase[] = [];
  let denyOpen = false;
  let immediatelyClose = false;
  t.mock.method(factory, 'open', (...args: Parameters<IDBFactory['open']>) => {
    if (denyOpen) throw new DOMException('temporarily unavailable', 'UnknownError');
    const request = open(...args);
    request.addEventListener('success', () => {
      connections.push(request.result);
      if (immediatelyClose) request.result.close();
    });
    return request;
  });
  Object.assign(globalThis, { indexedDB: factory, window: { addEventListener() {} }, localStorage: { getItem: () => null } });
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ persistent: false, storageVersion: 1, state: null })));
  const storage = await import('./appStorage');
  await storage.initializeStorage();
  const observer = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = open('bgm-anitier-user-data-v1', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const read = () => new Promise<StorageValues>((resolve, reject) => {
    const request = observer.transaction('snapshots').objectStore('snapshots').get('current');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const save = async (title: string) => {
    storage.appStorage.setItem(STORAGE_KEYS.TITLE, title);
    await storage.flushStorage();
    assert.equal((await read())[STORAGE_KEYS.TITLE], title);
  };
  try {
    await t.test('a stale handle reopens automatically and preserves the other fields', async () => {
      storage.appStorage.setItem(STORAGE_KEYS.COMMENTS, '[]');
      await save('before closure');
      const count = connections.length;
      connections.at(-1)!.close(); // Explicit close does not dispatch a close event.
      await save('after closure');
      assert.equal(connections.length, count + 1);
      assert.equal((await read())[STORAGE_KEYS.COMMENTS], '[]');
    });

    await t.test('unexpected closure and closure during an abort both recover', async () => {
      forceCloseDatabase(connections.at(-1)!);
      await save('after forced closure');
      const connection = connections.at(-1)!;
      const transaction = connection.transaction.bind(connection);
      let interrupted = false;
      const mock = t.mock.method(connection, 'transaction', (...args: Parameters<IDBDatabase['transaction']>) => {
        if (!interrupted) {
          interrupted = true;
          connection.close();
          throw new DOMException('connection closed before its close event', 'AbortError');
        }
        return transaction(...args);
      });
      await save('after interrupted transaction');
      mock.mock.restore();
    });

    await t.test('failed reopening retains an exportable edit and retry writes it durably', async () => {
      const previous = (await read())[STORAGE_KEYS.TITLE];
      forceCloseDatabase(connections.at(-1)!);
      denyOpen = true;
      storage.appStorage.setItem(STORAGE_KEYS.TITLE, 'unsaved but recoverable');
      await assert.rejects(storage.flushStorage(), /保存失败/);
      assert.equal((await read())[STORAGE_KEYS.TITLE], previous);
      assert.equal(parseBackup(createBackup(storage.appStorage.snapshot()))[STORAGE_KEYS.TITLE], 'unsaved but recoverable');
      denyOpen = false;
      await storage.retryStorage();
      await storage.flushStorage();
      assert.equal((await read())[STORAGE_KEYS.TITLE], 'unsaved but recoverable');
    });

    await t.test('repeated closure has a bounded retry and remains recoverable', async () => {
      connections.at(-1)!.close();
      immediatelyClose = true;
      const count = connections.length;
      storage.appStorage.setItem(STORAGE_KEYS.TITLE, 'after repeated closure');
      await assert.rejects(storage.flushStorage(), /保存失败/);
      assert.equal(connections.length, count + 1);
      immediatelyClose = false;
      await storage.retryStorage();
      await storage.flushStorage();
      assert.equal((await read())[STORAGE_KEYS.TITLE], 'after repeated closure');
    });

    await t.test('quota errors stay visible and do not trigger reconnection loops', async () => {
      const count = connections.length;
      const previous = (await read())[STORAGE_KEYS.TITLE];
      const mock = t.mock.method(connections.at(-1)!, 'transaction', () => { throw new DOMException('full', 'QuotaExceededError'); });
      storage.appStorage.setItem(STORAGE_KEYS.TITLE, 'after capacity returns');
      await assert.rejects(storage.flushStorage(), /保存失败/);
      assert.equal(connections.length, count);
      assert.equal((await read())[STORAGE_KEYS.TITLE], previous);
      mock.mock.restore();
      await storage.retryStorage();
      await storage.flushStorage();
      assert.equal((await read())[STORAGE_KEYS.TITLE], 'after capacity returns');
    });

    await t.test('import and its recovery point survive reconnection', async () => {
      const previous = (await read())[STORAGE_KEYS.TITLE];
      connections.at(-1)!.close();
      await storage.importStorage({ [STORAGE_KEYS.TITLE]: 'imported after closure' });
      assert.equal((await read())[STORAGE_KEYS.TITLE], 'imported after closure');
      connections.at(-1)!.close();
      await storage.restoreBeforeImport();
      assert.equal((await read())[STORAGE_KEYS.TITLE], previous);
    });

    await t.test('reconnection and manual retry cannot overwrite another tab', async () => {
      await new Promise<void>(resolve => {
        const tx = observer.transaction('snapshots', 'readwrite');
        const store = tx.objectStore('snapshots');
        const request = store.get('current');
        request.onsuccess = () => store.put({ ...request.result, [STORAGE_KEYS.TITLE]: 'newer tab' }, 'current');
        tx.oncomplete = () => resolve();
      });
      connections.at(-1)!.close();
      storage.appStorage.setItem(STORAGE_KEYS.TITLE, 'stale tab');
      await assert.rejects(storage.flushStorage(), /另一页面/);
      await storage.retryStorage();
      await assert.rejects(storage.flushStorage(), /另一页面/);
      assert.equal((await read())[STORAGE_KEYS.TITLE], 'newer tab');
    });
  } finally {
    await storage.flushServerMirror();
    observer.close();
    connections.forEach(connection => connection.close());
  }
});
