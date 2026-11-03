import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStateFile } from './stateFile';
import { STORAGE_KEYS, STUDIO_STORAGE_KEYS } from './persistenceSchema';

test('server commits full data, retains previous file, and can be reopened after restart', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'anitier-storage-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'user-state.json');
  const storage = createStateFile(file);
  const key = STORAGE_KEYS.TITLE;
  storage.write({ storageVersion: 1, patch: { [key]: 'first', [STUDIO_STORAGE_KEYS.SCRIPT]: '[]' }, expected: { [key]: null, [STUDIO_STORAGE_KEYS.SCRIPT]: null } });
  storage.write({ storageVersion: 1, patch: { [key]: 'second' }, expected: { [key]: 'first' } });
  assert.equal(createStateFile(file).read().boardTitle, 'second');
  assert.equal(JSON.parse(fs.readFileSync(file + '.bak', 'utf8')).boardTitle, 'first');
  assert.equal(storage.read().storageEntries[STUDIO_STORAGE_KEYS.SCRIPT], '[]');
  assert.equal(fs.existsSync(file + '.tmp'), false);
  assert.throws(() => storage.write({ storageVersion: 1, patch: { [key]: 'stale' }, expected: { [key]: 'first' } }), /另一页面/);
  assert.equal(storage.read().boardTitle, 'second');
  assert.throws(() => storage.write({ boardTitle: 'legacy tab' }), /刷新页面/);
  assert.equal(storage.read().boardTitle, 'second');
});

test('corrupt state and filesystem write failures do not silently report success or destroy the old file', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'anitier-storage-failure-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'user-state.json');
  fs.writeFileSync(file, '{truncated');
  const storage = createStateFile(file);
  assert.throws(() => storage.write({ storageVersion: 1, patch: {}, expected: {} }));
  assert.equal(fs.readFileSync(file, 'utf8'), '{truncated');
  fs.writeFileSync(file, '{}');
  fs.mkdirSync(file + '.tmp');
  assert.throws(() => storage.write({ storageVersion: 1, patch: { [STORAGE_KEYS.TITLE]: 'new' }, expected: { [STORAGE_KEYS.TITLE]: null } }));
  assert.equal(fs.readFileSync(file, 'utf8'), '{}');
});
