import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackup, embedBackupImages, parseBackup } from './backup';
import { BOARD_FIELDS, STUDIO_FIELDS, STORAGE_KEYS, STUDIO_STORAGE_KEYS, fieldsToStorage, mergeStoragePatch, reconcileServerState } from './persistenceSchema';
import { createEmptyTierMap } from './tierLogic';
import { buildInitialStudioScriptList } from './studioDirector';

const work = { id: -1, title: '自定义作品', cover: 'data:image/png;base64,YQ==', isCustom: true, deepEnriched: true };
const board = { tiers: { ...createEmptyTierMap(), '9.5': [work] }, unrankedPool: [], comments: [], boardTitle: '收尾测试', visibleTiers: [], gradingSystem: 'letter', showTitles: false, useCustomBg: true, enableGlow: false, enableGlassBlur: false, glassBlurPx: 0, customBgUrl: work.cover, savedReport: '', exportHideEmptyTiers: false, aiConfig: { baseUrl: '', apiKey: 'fixture-only', model: '', worldBookEntries: [] } };
const values = fieldsToStorage(board);

test('full backup round-trip preserves every registered field, including studio and intentionally empty values', () => {
  const full = createBackup(values);
  full.studio.script[0].userText = '';
  full.studio.script[0].userImage = work.cover;
  full.studio.script[0].aiRawText = '[笑] 测试';
  full.studio.speechSpeed = 0.5;
  full.studio.bookends.opening.userText = '打分规则';
  full.studio.promptRules.expressionRuleTemplate = '自定义规则';
  const restored = parseBackup(JSON.parse(JSON.stringify(full)));
  for (const [key, value] of Object.entries(values)) assert.equal(restored[key], value, key);
  assert.equal(JSON.parse(restored[STUDIO_STORAGE_KEYS.SCRIPT])[0].userImage, work.cover);
  assert.equal(restored[STUDIO_STORAGE_KEYS.SPEECH_SPEED], '0.5');
  assert.equal(JSON.parse(restored[STUDIO_STORAGE_KEYS.BOOKENDS]).opening.userText, '打分规则');
  assert.deepEqual(parseBackup(createBackup(restored)), restored);
  assert.equal(new Set([...BOARD_FIELDS, ...STUDIO_FIELDS].map(([, key]) => key)).size, BOARD_FIELDS.length + STUDIO_FIELDS.length);
});

test('legacy all-in-one and nextTiers wrapper import without erasing absent studio settings', () => {
  const restored = parseBackup({ version: '3.0.0-all-in-one', tiers: { nextTiers: board.tiers }, comments: [] });
  assert.equal(JSON.parse(restored[STORAGE_KEYS.TIERS])['9.5'][0].title, work.title);
  assert.equal(restored[STUDIO_STORAGE_KEYS.SCRIPT], undefined);
});

test('reopening studio preserves intentionally blank AI dialogue', () => {
  const initial = buildInitialStudioScriptList(board.tiers, []);
  initial[0].aiRawText = '';
  initial[0].userText = '';
  const reopened = buildInitialStudioScriptList(board.tiers, [], initial);
  assert.equal(reopened[0].aiRawText, '');
  assert.equal(reopened[0].userText, '');
});

test('empty board and empty candidate pool remain empty after export/import', () => {
  const restored = parseBackup(createBackup(fieldsToStorage({ tiers: createEmptyTierMap(), unrankedPool: [], comments: [] })));
  assert.equal(Object.values(JSON.parse(restored[STORAGE_KEYS.TIERS])).flat().length, 0);
  assert.equal(restored[STORAGE_KEYS.UNRANKED_POOL], '[]');
});

test('malformed backups reject before producing a writable patch', () => {
  for (const bad of [null, [], {}, { tiers: [] }, { tiers: { '10': [null] } }, { tiers: { '11': [work] } }, { ...board, comments: [null] }, { ...board, unrankedPool: [{ id: 1, title: [] }] }, { ...board, aiConfig: { worldBookEntries: 'bad' } }, { ...board, studio: { companions: [] } }, { ...board, studio: { script: [{ animeId: 1 }] } }, { ...board, version: '99.0.0' }]) assert.throws(() => parseBackup(bad));
});

test('nested invalid metadata and duplicate work IDs are rejected before render', () => {
  for (const metadata of [{ bgmScore: '9' }, { director: {} }, { tagsWithCount: [{ name: 'TV', count: 'many' }] }, { characters: [null] }, { characters: [{ id: 1, name: '角色', topComments: [false] }] }, { originalNumericScore: 11 }]) {
    assert.throws(() => parseBackup({ tiers: { '10': [{ ...work, ...metadata }] } }));
  }
  assert.throws(() => parseBackup({ ...board, unrankedPool: [work] }));
});

test('embedded images deduplicate requests, preserve failed URLs, and never fetch prose or credentials', async () => {
  const fetched: string[] = [];
  const source = { cover: 'https://example.test/image', studio: { script: [{ userImage: 'https://example.test/image' }], companions: [{ customExpressions: [{ name: '笑', url: 'https://example.test/missing' }] }] }, aiConfig: { apiKey: 'secret', baseUrl: 'https://private.test/api' }, prompt: 'https://private.test/prompt' };
  const { backup, externalImages } = await embedBackupImages(source, async url => { fetched.push(url); if (url.endsWith('missing')) throw new Error('offline'); return work.cover; });
  assert.equal(externalImages, 1);
  assert.equal(backup.studio.script[0].userImage, work.cover);
  assert.equal(backup.studio.companions[0].customExpressions[0].url, 'https://example.test/missing');
  assert.equal(source.cover, 'https://example.test/image');
  assert.deepEqual(fetched, ['https://example.test/image', 'https://example.test/missing']);
});

test('concurrent edits merge separate fields and reject stale writes to the same field', () => {
  const initial = { title: 'old', script: 'old' };
  assert.deepEqual(mergeStoragePatch({ ...initial, title: 'new' }, initial, { script: 'new' }), { title: 'new', script: 'new' });
  assert.throws(() => mergeStoragePatch({ title: 'other' }, { title: 'old' }, { title: 'stale' }));
  assert.deepEqual(mergeStoragePatch({ title: 'same' }, {}, { title: 'same' }), { title: 'same' });
});

test('restart adopts newer server values only for fields unchanged locally', () => {
  const baseline = { title: 'old', script: 'old' };
  assert.deepEqual(reconcileServerState({ title: 'old', script: 'local edit' }, baseline, { title: 'new', script: 'old' }), {
    recovered: { title: 'new' }, expected: { title: 'new', script: 'old' },
  });
  const conflict = reconcileServerState({ title: 'local edit' }, { title: 'old' }, { title: 'remote edit' });
  assert.deepEqual(conflict.recovered, {});
  assert.throws(() => mergeStoragePatch({ title: 'remote edit' }, conflict.expected, { title: 'local edit' }));
});
