import fs from 'node:fs';
import path from 'node:path';
import { isRecord, mergeStoragePatch, pickStorageValues, fieldsToStorage, storageToFields } from './persistenceSchema';

export function createStateFile(file: string) {
  const read = (): Record<string, any> => {
    if (!fs.existsSync(file)) return {};
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!isRecord(parsed)) throw new Error('存档文件格式异常，已停止自动覆盖');
    return parsed;
  };
  return {
    read,
    write(body: unknown) {
      if (!isRecord(body) || body.storageVersion !== 1 || !isRecord(body.patch) || !isRecord(body.expected)) {
        throw Object.assign(new Error('请刷新页面以使用新的保存格式'), { status: 409 });
      }
      const existing = read();
      const current = isRecord(existing.storageEntries) ? pickStorageValues(existing.storageEntries) : fieldsToStorage(existing);
      const patch = pickStorageValues(body.patch);
      if (Object.keys(patch).length !== Object.keys(body.patch).length) throw Object.assign(new Error('存档字段无效'), { status: 400 });
      const expected = Object.fromEntries(Object.keys(patch).map(key => [key, body.expected[key] === null ? undefined : body.expected[key]]));
      let entries;
      try { entries = mergeStoragePatch(current, expected, patch); }
      catch (error) { throw Object.assign(error as Error, { status: 409 }); }
      const next = { ...existing, ...storageToFields(entries), storageEntries: entries, updatedAt: Date.now() };
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temp = `${file}.tmp`;
      try {
        const fd = fs.openSync(temp, 'w');
        try { fs.writeFileSync(fd, JSON.stringify(next)); fs.fsyncSync(fd); }
        finally { fs.closeSync(fd); }
        // Keep the previous valid generation; a failed write never truncates the current file.
        if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
        fs.renameSync(temp, file);
      } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
      return next;
    },
  };
}
