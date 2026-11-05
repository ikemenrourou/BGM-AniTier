import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorldBookEntry } from '../types';
import { AI_ROLES, buildTasteReportPrompt, DEFAULT_WORLD_BOOK_ENTRIES, LEGACY_D0_KNOWLEDGE_CONTENT, normalizeWorldBookConfig, normalizeWorldBookEntries } from './tierLogic';
import { buildStudioTimelinePrompt, DEFAULT_STUDIO_AI_COMPANIONS, DEFAULT_STUDIO_PROMPT_RULES_CONFIG, getStudioWorldBookEntries, normalizeStudioPromptRules } from './studioDirector';
import { createBackup, parseBackup } from './backup';
import { AI_CONFIG_KEY, STUDIO_STORAGE_KEYS } from './persistenceSchema';

function assertOrder(prompt: string, markers: string[]) {
  const indices = markers.map(marker => {
    const index = prompt.indexOf(marker);
    assert.ok(index >= 0, `Missing ${marker}`);
    return index;
  });
  assert.deepEqual(indices, [...indices].sort((a, b) => a - b));
}

test('report and studio honor the requested three-position ordering and ascending priorities', () => {
  const entries: WorldBookEntry[] = [
    { id: 'visual', title: '可视化', content: 'ORDER_VISUAL', enabled: true, position: 'd0', priority: 100 },
    { id: 'knowledge', title: '知识库', content: 'ORDER_KNOWLEDGE', enabled: true, position: 'before-character', priority: 100 },
    { id: 'output', title: '输出规范', content: 'ORDER_OUTPUT', enabled: true, position: 'd0', priority: 99 },
    { id: 'director', title: '台长', content: 'ORDER_DIRECTOR', enabled: true, position: 'after-character', priority: 1 },
    { id: 'satire', title: '讽刺', content: 'ORDER_SATIRE', enabled: true, position: 'before-character', priority: 99 },
  ];
  const report = buildTasteReportPrompt({}, [], 'atri', { persona: { ...AI_ROLES.atri, prompt: 'ORDER_CHARACTER' }, worldBookEntries: entries });
  const studio = buildStudioTimelinePrompt({ scriptItems: [], companion: { ...DEFAULT_STUDIO_AI_COMPANIONS[0], prompt: 'ORDER_CHARACTER' }, worldBookEntries: entries, enabledWorldBookIds: entries.map(e => e.id) });
  for (const prompt of [report, studio]) assertOrder(prompt, ['ORDER_SATIRE', 'ORDER_KNOWLEDGE', 'ORDER_CHARACTER', 'ORDER_DIRECTOR', 'ORDER_OUTPUT', 'ORDER_VISUAL']);
});

test('defaults keep report layout out of the studio and put expression/timeline rules last', () => {
  const report = buildTasteReportPrompt({}, [], 'atri');
  assertOrder(report, ['<RoleDefinition>', 'title="通用 ACGN 知识库"', '<bangumi_data>', '<front_end_visualization>', '<输出规范>']);
  const studio = buildStudioTimelinePrompt({ scriptItems: [], companion: DEFAULT_STUDIO_AI_COMPANIONS[0], enabledWorldBookIds: DEFAULT_WORLD_BOOK_ENTRIES.map(e => e.id) });
  assertOrder(studio, ['<RoleDefinition>', 'title="通用 ACGN 知识库"', '<bangumi_data>', 'title="表情差分与漫符规则"', 'title="时间线与台词输出规则"']);
  assert.doesNotMatch(studio, /<front_end_visualization>|<输出规范>|深度专栏排版|角色头像自动显示与节奏控制/);
});

test('new default rules keep recording guidance in the studio and share the satire guide', () => {
  const report = buildTasteReportPrompt({}, [], 'atri');
  const studio = buildStudioTimelinePrompt({ scriptItems: [], companion: DEFAULT_STUDIO_AI_COMPANIONS[0] });
  assert.match(report, /title="互联网讽刺与生草造梗学"/);
  for (const title of ['双人录屏搭档定位', '🎙️去八股', '🎙️Bangumi数据捕食与认知门控', '🎙️熟人连麦陪看腔']) {
    assert.ok(!report.includes(`title="${title}"`), `${title} should stay out of reports`);
  }
  for (const title of ['⚡ 嘴臭DLC(可选)', '⚡ 阴阳怪气DLC(可选)', '⚡ XP拷打(可选)']) {
    assert.ok(!report.includes(`title="${title}"`), `${title} should be off by default`);
    assert.ok(!studio.includes(`title="${title}"`), `${title} should be off by default`);
  }
  assertOrder(studio, [
    'title="双人录屏搭档定位"',
    '<RoleDefinition>',
    'title="通用 ACGN 知识库"',
    'title="互联网讽刺与生草造梗学"',
    'title="🎙️去八股"',
    'title="🎙️Bangumi数据捕食与认知门控"',
    'title="🎙️熟人连麦陪看腔"',
    '\n<bangumi_data>\n',
  ]);
  const withDlc = buildStudioTimelinePrompt({
    scriptItems: [],
    companion: DEFAULT_STUDIO_AI_COMPANIONS[0],
    enabledWorldBookIds: [...DEFAULT_STUDIO_PROMPT_RULES_CONFIG.enabledWorldBookIds, 'wb-rage-dlc'],
  });
  assertOrder(withDlc, ['title="🎙️Bangumi数据捕食与认知门控"', 'title="⚡ 嘴臭DLC(可选)"', 'title="🎙️熟人连麦陪看腔"']);
});

test('studio templates can be positioned before or after the character and interleaved with D0 entries', () => {
  const entries: WorldBookEntry[] = [{ id: 'between', title: '夹层', content: 'ORDER_BETWEEN', enabled: true, position: 'd0', priority: 200 }];
  const params = { scriptItems: [], companion: { ...DEFAULT_STUDIO_AI_COMPANIONS[0], prompt: 'ORDER_CHARACTER' }, worldBookEntries: entries, enabledWorldBookIds: ['between'], expressionRuleTemplate: 'ORDER_EXPRESSION', timelineRuleTemplate: 'ORDER_TIMELINE' };
  const interleaved = buildStudioTimelinePrompt({ ...params, expressionRulePlacement: { position: 'd0', priority: 199 }, timelineRulePlacement: { position: 'd0', priority: 201 } });
  assertOrder(interleaved, ['ORDER_CHARACTER', 'ORDER_EXPRESSION', 'ORDER_BETWEEN', 'ORDER_TIMELINE']);
  const moved = buildStudioTimelinePrompt({ ...params, expressionRulePlacement: { position: 'before-character', priority: -10 }, timelineRulePlacement: { position: 'after-character', priority: 50 } });
  assertOrder(moved, ['ORDER_EXPRESSION', 'ORDER_CHARACTER', 'ORDER_TIMELINE', '<bangumi_data>', 'ORDER_BETWEEN']);
});

test('disabled, edited, empty and deleted defaults stay that way after repeated normalization', () => {
  assert.deepEqual(normalizeWorldBookEntries([]), []);
  const edited = DEFAULT_WORLD_BOOK_ENTRIES.map(e => ({ ...e, content: '', title: '我的名字', enabled: false }));
  assert.deepEqual(normalizeWorldBookEntries(normalizeWorldBookEntries(edited)), edited);
  assert.deepEqual(getStudioWorldBookEntries(DEFAULT_WORLD_BOOK_ENTRIES, []), []);
  const deleted = normalizeWorldBookEntries(DEFAULT_WORLD_BOOK_ENTRIES.filter(e => e.id === 'wb-report-output'));
  assert.equal(normalizeWorldBookEntries(deleted).length, 1);
  const custom = normalizeWorldBookEntries([{ id: 'd0-global-custom', title: '自定义', content: '保留', enabled: false, isLockedD0: true }]);
  assert.equal(custom[0].position, 'd0');
  assert.equal(custom[0].enabled, false);
  assert.equal(custom[0].isLockedD0, undefined);
});

test('legacy combined entries split once while preserving custom text and removing the lock', () => {
  const migrated = normalizeWorldBookEntries([{ id: 'wb-d0-default', title: '通用 ACGN 知识库与输出规范', content: LEGACY_D0_KNOWLEDGE_CONTENT + '\nCUSTOM_FOOTNOTE', enabled: true, isLockedD0: true }]);
  assert.equal(migrated.length, 2);
  assert.ok(migrated[0].content.includes('CUSTOM_FOOTNOTE'));
  assert.ok(migrated[0].content.includes('<动画公司知识库>'));
  assert.ok(!migrated[0].content.includes('<输出规范>'));
  assert.equal(migrated[1].scope, 'report');
  assert.deepEqual(normalizeWorldBookEntries(migrated), migrated);
  const custom = normalizeWorldBookEntries([{ id: 'wb-html-visualization', title: '我改的可视化', content: '全部重写了', enabled: false }]);
  assert.equal(custom[0].content, '全部重写了');
  const legacyTail = normalizeWorldBookConfig({ worldBookEntries: [], d0Prompt: '保留旧版额外规则' });
  assert.equal(legacyTail.worldBookEntries[0].content, '保留旧版额外规则');
  assert.equal(legacyTail.d0Prompt, '');
  assert.deepEqual(normalizeWorldBookConfig(legacyTail), legacyTail);
});

test('placement, ties, deletions and template settings survive backup export/import', () => {
  const entries = ['FIRST_TIE', 'SECOND_TIE'].map((content, i) => ({ id: String(i), title: String(i), content, enabled: true, position: 'd0' as const, priority: 7, scope: 'all' as const }));
  const rules = normalizeStudioPromptRules({ ...DEFAULT_STUDIO_PROMPT_RULES_CONFIG, expressionRulePlacement: { position: 'before-character', priority: -12 }, timelineRulePlacement: { position: 'd0', priority: 201 } });
  const backup = createBackup({ [AI_CONFIG_KEY]: JSON.stringify({ worldBookEntries: entries }), [STUDIO_STORAGE_KEYS.PROMPT_RULES]: JSON.stringify(rules) });
  const restored = parseBackup(JSON.parse(JSON.stringify(backup)));
  assert.deepEqual(JSON.parse(restored[AI_CONFIG_KEY]).worldBookEntries, entries);
  assert.deepEqual(normalizeStudioPromptRules(JSON.parse(restored[STUDIO_STORAGE_KEYS.PROMPT_RULES])), rules);
  assertOrder(buildTasteReportPrompt({}, [], 'atri', JSON.parse(restored[AI_CONFIG_KEY])), ['FIRST_TIE', 'SECOND_TIE']);
  for (const patch of [{ position: 'invalid' }, { priority: '10' }, { priority: 1.5 }, { scope: 'invalid' }]) {
    assert.throws(() => parseBackup({ ...backup, aiConfig: { worldBookEntries: [{ ...entries[0], ...patch }] } }));
  }
  const empty = createBackup({ [AI_CONFIG_KEY]: JSON.stringify({ worldBookEntries: [] }) });
  assert.deepEqual(normalizeWorldBookEntries(JSON.parse(parseBackup(empty)[AI_CONFIG_KEY]).worldBookEntries), []);
});
