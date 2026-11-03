import { AI_CONFIG_KEY, PERSISTED_KEYS, STORAGE_KEYS, fieldsToStorage, isRecord, mergeStoragePatch, pickStorageValues, reconcileServerState, type StorageValues } from './persistenceSchema';
import { createBackup, parseBackup } from './backup';
import { IS_STATIC_HOSTING } from './runtime';

const DB_NAME = 'bgm-anitier-user-data-v1';
const STORE = 'snapshots';
let database: IDBDatabase | null = null;
let openingDatabase: Promise<IDBDatabase> | null = null;
let values: StorageValues = {};
let committed: StorageValues = {};
let serverValues: StorageValues = {};
let initialized = false;
let importing = false;
let writeQueue: Promise<void> = Promise.resolve();
let mirrorQueue: Promise<void> = Promise.resolve();
let pendingMirror: StorageValues = {};
let mirrorTimer: ReturnType<typeof setTimeout> | undefined;
let saving = 0;
let message = '';
let serverMessage = '';
let serverSupported = false;
let serverChecked = false;
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };

export const getStorageStatus = () => message || (saving ? '正在保存…' : serverMessage || '已保存到此浏览器');
export const subscribeStorage = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const appStorage = {
  getItem(key: string): string | null { return values[key] ?? null; },
  setItem(key: string, value: string): void {
    if (importing) return; // The old React tree must not autosave over a committed import before reload.
    if (values[key] === value) return;
    values[key] = value;
    if (!initialized) return;
    saving++;
    emit();
    // React effects can write several related keys; persist the whole batch in one transaction.
    writeQueue = writeQueue.then(async () => {
      const patch = Object.fromEntries(Object.entries(values).filter(([key, value]) => committed[key] !== value));
      if (!Object.keys(patch).length) return;
      try {
        await commitPatch(patch);
        message = '';
        scheduleMirror(patch);
      } catch (error) {
        message = `保存失败：${error instanceof Error ? error.message : '浏览器存储不可用'} 请先导出备份。`;
      }
    }).finally(() => { saving--; emit(); });
  },
  snapshot(): StorageValues { return { ...values }; },
};

function openDatabase(): Promise<IDBDatabase> {
  if (database) return Promise.resolve(database);
  if (openingDatabase) return openingDatabase;
  openingDatabase = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    let settled = false;
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => {
      const connection = request.result;
      if (settled) { connection.close(); return; }
      settled = true;
      database = connection;
      // A suspended page, storage backend restart, or version change can invalidate
      // the handle. Keep our unsaved values and reopen on the next operation.
      connection.onclose = () => { if (database === connection) database = null; };
      connection.onversionchange = () => {
        if (database === connection) database = null;
        connection.close();
      };
      resolve(connection);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { settled = true; reject(new Error('请关闭旧页面后重试')); };
  }).finally(() => { openingDatabase = null; });
  return openingDatabase;
}

async function withDatabase<T>(operation: (connection: IDBDatabase) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const connection = await openDatabase();
    try { return await operation(connection); }
    catch (error) {
      const errorName = (error as { name?: string })?.name;
      let connectionClosed = database !== connection || errorName === 'InvalidStateError';
      // Forced closure can abort a transaction before the close event reaches us.
      // A harmless read transaction distinguishes that from an ordinary abort.
      if (!connectionClosed && errorName === 'AbortError') {
        try { connection.transaction(STORE); }
        catch (probeError) { connectionClosed = (probeError as { name?: string })?.name === 'InvalidStateError'; }
      }
      // Retry a closed connection once. Quota failures, bad imports and stale-tab
      // conflicts must still fail; reopening must never reset the merge baseline.
      if (!connectionClosed || errorName === 'QuotaExceededError') throw error;
      if (database === connection) database = null;
      connection.close();
      if (attempt > 0) throw error;
    }
  }
  throw new Error('浏览器数据库连接恢复失败，请导出当前内容后重试。');
}

function readSnapshot(key = 'current'): Promise<StorageValues | undefined> {
  return withDatabase(connection => new Promise((resolve, reject) => {
    const tx = connection.transaction(STORE);
    const request = tx.objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result ? pickStorageValues(request.result) : undefined);
    request.onerror = () => reject(request.error);
    tx.onabort = () => reject(tx.error || new Error('读取存档中断'));
  }));
}
function rememberServerBaseline(patch: StorageValues): Promise<void> {
  return withDatabase(connection => new Promise((resolve, reject) => {
    const tx = connection.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const request = store.get('server-base');
    request.onsuccess = () => store.put({ ...pickStorageValues(request.result), ...patch }, 'server-base');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  }));
}
async function commitPatch(patch: StorageValues, keepRecovery = false): Promise<void> {
  await withDatabase(connection => new Promise<void>((resolve, reject) => {
    const tx = connection.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const request = store.get('current');
    let problem: Error | null = null;
    request.onsuccess = () => {
      try {
        const current = pickStorageValues(request.result);
        const next = mergeStoragePatch(current, committed, patch);
        if (keepRecovery) store.put(parseBackup(createBackup(current)), 'before-import');
        store.put(next, 'current');
      } catch (error) { problem = error as Error; tx.abort(); }
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(problem || tx.error || new Error('存储空间不足或写入中断'));
    tx.onerror = () => { /* onabort handles the rejected transaction */ };
  }));
  committed = { ...committed, ...patch };
}

function readLegacy(): StorageValues {
  const result: StorageValues = {};
  for (const key of PERSISTED_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) result[key] = value;
  }
  if (!result[AI_CONFIG_KEY]) for (const version of [9, 8, 7, 6, 5]) {
    const legacy = localStorage.getItem(`anime-tier-list-ai-config-v${version}`);
    if (legacy) { result[AI_CONFIG_KEY] = legacy; break; }
  }
  // A valid empty board is intentional. Recover the old backup only when the primary is missing/broken.
  try { if (result[STORAGE_KEYS.TIERS]) JSON.parse(result[STORAGE_KEYS.TIERS]); }
  catch { delete result[STORAGE_KEYS.TIERS]; }
  if (result[STORAGE_KEYS.TIERS] === undefined) {
    const backup = localStorage.getItem(STORAGE_KEYS.TIERS_BACKUP);
    if (backup) { try { JSON.parse(backup); result[STORAGE_KEYS.TIERS] = backup; } catch { /* keep original disk bytes */ } }
  }
  return result;
}
async function fetchServer(): Promise<StorageValues> {
  if (IS_STATIC_HOSTING) {
    serverSupported = false;
    serverChecked = true;
    serverMessage = '已保存到此浏览器（线上版请定期导出备份）';
    return {};
  }
  const response = await fetch('/api/storage/state', { signal: AbortSignal.timeout(6000), cache: 'no-store' });
  if (!response.ok) throw new Error('服务器备份暂不可用');
  const body = await response.json();
  serverSupported = body.storageVersion === 1 && body.persistent === true;
  serverChecked = true;
  serverMessage = body.persistent === false ? '已保存到此浏览器（线上版请定期导出备份）' : serverSupported ? '' : '已保存到浏览器；重启本地服务后启用完整备份';
  const state = isRecord(body.state) ? body.state : {};
  return isRecord(state.storageEntries) ? pickStorageValues(state.storageEntries) : fieldsToStorage(state);
}

export async function initializeStorage(): Promise<void> {
  if (initialized) return;
  let local: StorageValues | undefined;
  let serverBaseline: StorageValues | undefined;
  let legacy: StorageValues = {};
  try { legacy = readLegacy(); } catch { /* IndexedDB may still work when localStorage is disabled. */ }
  try { await openDatabase(); local = await readSnapshot(); serverBaseline = await readSnapshot('server-base'); }
  catch { message = '浏览器数据库无法打开。请先导出备份，再检查浏览器存储权限。'; }
  try { serverValues = await fetchServer(); }
  catch { serverMessage = '已保存到浏览器；服务器备份暂不可用'; }
  committed = { ...local };
  values = local ? { ...local } : { ...serverValues, ...legacy };
  // Keep the last acknowledged server version across restarts; an older browser cannot
  // overwrite a newer server snapshot simply by reopening the app.
  if (local && serverBaseline) {
    const { recovered, expected } = reconcileServerState(local, serverBaseline, serverValues);
    if (Object.keys(recovered).length) {
      try { await commitPatch(recovered); values = { ...values, ...recovered }; }
      catch { message = '恢复服务器更新时保存失败，请先导出当前内容。'; }
    }
    serverValues = expected;
  }
  // Hydration finishes before React mounts: defaults can never overwrite a pending restore.
  if (!local && database) {
    try { await commitPatch(values); }
    catch { values = await readSnapshot() || values; committed = { ...values }; }
  }
  initialized = true;
  if (database) scheduleMirror(values);
  window.addEventListener('beforeunload', event => {
    if (saving || message) { event.preventDefault(); event.returnValue = ''; }
  });
  window.addEventListener('online', () => { serverChecked = false; scheduleMirror(committed); });
}

function scheduleMirror(patch: StorageValues) {
  pendingMirror = { ...pendingMirror, ...patch };
  clearTimeout(mirrorTimer);
  mirrorTimer = setTimeout(() => { void flushServerMirror(); }, 600);
}
export async function flushServerMirror(): Promise<void> {
  clearTimeout(mirrorTimer);
  const batch = pendingMirror;
  pendingMirror = {};
  mirrorQueue = mirrorQueue.then(async () => {
    if (!Object.keys(batch).length) return;
    try {
      if (!serverChecked || !serverSupported) serverValues = await fetchServer();
      if (!serverSupported) { pendingMirror = { ...batch, ...pendingMirror }; emit(); return; }
      const patch = Object.fromEntries(Object.entries(batch).filter(([key, value]) => serverValues[key] !== value));
      if (Object.keys(patch).length) {
        const expected = Object.fromEntries(Object.keys(patch).map(key => [key, serverValues[key] ?? null]));
        const response = await fetch('/api/storage/state', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storageVersion: 1, patch, expected }), signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error(response.status === 409 ? '另一个页面已更新服务器备份，请导出当前内容后刷新' : response.status === 413 ? '数据超过本机服务的保存容量，请保留导出的 JSON 备份' : '服务器写入失败');
        const body = await response.json();
        if (!body.ok || !body.persistent) throw new Error('服务器未确认持久化保存');
        serverValues = { ...serverValues, ...patch };
      }
      await rememberServerBaseline(Object.fromEntries(Object.keys(batch).map(key => [key, serverValues[key]])));
      serverMessage = '已保存到浏览器和本机文件';
    } catch (error) {
      pendingMirror = { ...batch, ...pendingMirror };
      serverMessage = `已保存到浏览器；${error instanceof Error ? error.message : '服务器备份失败'}`;
    }
    emit();
  });
  await mirrorQueue;
}

export async function flushStorage(): Promise<void> {
  await writeQueue;
  if (message) throw new Error(message);
}
export async function retryStorage(): Promise<void> {
  saving++;
  emit();
  writeQueue = writeQueue.then(async () => {
    try {
      await readSnapshot();
      const patch = Object.fromEntries(Object.entries(values).filter(([key, value]) => committed[key] !== value));
      if (Object.keys(patch).length) { await commitPatch(patch); scheduleMirror(patch); }
      message = '';
    } catch (error) { message = `保存失败：${error instanceof Error ? error.message : '浏览器存储不可用'} 请先导出备份。`; }
  }).finally(() => { saving--; emit(); });
  await writeQueue;
  await flushServerMirror();
  emit();
}
export async function importStorage(patch: StorageValues): Promise<void> {
  await flushStorage();
  importing = true;
  // Validate first, then commit once. Failed imports leave both the current UI and disk untouched.
  try {
    await mirrorQueue;
    // Choosing a backup is an explicit replacement of those fields, including on the server.
    try {
      const latest = await fetchServer();
      for (const key of Object.keys(patch)) {
        if (latest[key] === undefined) delete serverValues[key];
        else serverValues[key] = latest[key];
      }
    } catch { /* Import can still commit locally when the server is offline. */ }
    await commitPatch(patch, true);
    values = { ...values, ...patch };
    scheduleMirror(patch);
    await flushServerMirror();
  } finally { importing = false; }
}
export async function restoreBeforeImport(): Promise<void> {
  const saved = await readSnapshot('before-import');
  if (!saved || !Object.keys(saved).length) throw new Error('暂无导入前的恢复点');
  await importStorage(saved);
}
