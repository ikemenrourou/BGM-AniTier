import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AI_ROLES, ATRI_AVATAR_URL, buildTasteReportPrompt, LEGACY_ATRI_AVATAR_URL, normalizeVisibleTiers } from './tierLogic';
import { FEIYU_DEFAULT_PERSONA_PROMPT, FEIYU_REPORT_TASK_PROMPT, FEIYU_STUDIO_PERSONA_PROMPT, FEIYU_STUDIO_TASK_PROMPT, upgradeFeiyuPrompt } from './feiyuPersona';
import { buildInitialStudioScriptList, buildStudioTimelinePrompt, DEFAULT_STUDIO_AI_COMPANIONS, DEFAULT_USER_STUDIO_CHARACTER, normalizeStudioCompanions, normalizeStudioUserCharacter, resolveCharacterStandeeUrl, updateStudioCharacter, type StudioCharacterConfig } from './studioDirector';
import { createBackup, parseBackup } from './backup';
import { fieldsToStorage, STUDIO_FIELDS, STUDIO_STORAGE_KEYS, STORAGE_KEYS } from './persistenceSchema';
import { DEFAULT_THEME_ID, DEFAULT_THEME_VERSION, getInitialThemeId } from './themes';

const oldPrompt = readFileSync(new URL('./fixtures/feiyu-persona-v1.txt', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const oldStockPromptV2 = readFileSync(new URL('./fixtures/feiyu-persona-v2.txt', import.meta.url), 'utf8').replace(/\r\n/g, '\n').trim();
const oldHost: StudioCharacterConfig = JSON.parse(readFileSync(new URL('./fixtures/studio-host-v1.json', import.meta.url), 'utf8'));

test('new and retired four-row boards show all integer tiers while custom and letter selections survive', () => {
  const integers = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  assert.deepEqual(normalizeVisibleTiers(undefined), integers);
  assert.deepEqual(normalizeVisibleTiers([10, 9, 8, 7]), integers);
  assert.deepEqual(normalizeVisibleTiers([9.5, 9, 6, 1]), [9.5, 9, 6, 1]);
  assert.deepEqual(normalizeVisibleTiers([]), []);
  assert.deepEqual(normalizeVisibleTiers(undefined, 'letter'), [10, 8, 6, 4, 2]);
  assert.deepEqual(normalizeVisibleTiers([10, 6, 2], 'letter'), [10, 6, 2]);
  assert.deepEqual(createBackup({}).visibleTiers, integers);
  assert.deepEqual(createBackup({ [STORAGE_KEYS.GRADING_SYSTEM]: 'letter' }).visibleTiers, [10, 8, 6, 4, 2]);
});

test('full whale sheets are sent once in reports and studio, with output adaptations after the data', () => {
  const tiers = { '9': [{ id: 301, title: '测试作品', cover: '', bgmScore: 8.1 }] };
  const report = buildTasteReportPrompt(tiers, [], 'feiyu');
  const studio = buildStudioTimelinePrompt({ scriptItems: buildInitialStudioScriptList(tiers, []), companion: DEFAULT_STUDIO_AI_COMPANIONS[0] });
  assert.equal(AI_ROLES.feiyu.prompt, FEIYU_DEFAULT_PERSONA_PROMPT);
  assert.equal(DEFAULT_STUDIO_AI_COMPANIONS[0].prompt, FEIYU_STUDIO_PERSONA_PROMPT);
  assert.equal(report.split(FEIYU_DEFAULT_PERSONA_PROMPT).length, 2);
  assert.equal(studio.split(FEIYU_STUDIO_PERSONA_PROMPT).length, 2);
  assert.ok(!studio.includes(FEIYU_DEFAULT_PERSONA_PROMPT));
  assert.ok(report.includes('毒舌女仆'));
  assert.ok(studio.includes('毒舌损友'));
  for (const prompt of [report, studio]) {
    assert.ok(prompt.includes('<character_information character="大肥鱼">'));
    assert.ok(prompt.includes('测试作品'));
  }
  assert.ok(report.indexOf(FEIYU_REPORT_TASK_PROMPT) > report.indexOf('</bangumi_data>'));
  assert.ok(studio.indexOf(FEIYU_STUDIO_TASK_PROMPT) > studio.indexOf('</bangumi_data>'));
  assert.ok(studio.indexOf('title="时间线与台词输出规则"') > studio.indexOf('title="表情差分与漫符规则"'));
  assert.ok(!buildTasteReportPrompt(tiers, [], 'atri').includes(FEIYU_REPORT_TASK_PROMPT));
});

test('old stock whale sheets upgrade but edited sheets and character settings stay intact', () => {
  const saved = {
    ...DEFAULT_STUDIO_AI_COMPANIONS[0],
    name: '大肥鱼 (鲸鱼娘)',
    subtitle: '数据海洋女仆 · 主食白米饭',
    voicePreset: 'mochi_loli' as const,
    prompt: oldPrompt,
    voicePitch: 0.8,
    defaultAvatarUrl: 'data:image/png;base64,custom',
    customExpressions: [],
  };
  const upgraded = normalizeStudioCompanions([saved])[0];
  assert.equal(upgraded.prompt, FEIYU_STUDIO_PERSONA_PROMPT);
  assert.equal(upgraded.name, '鱼');
  assert.equal(upgraded.subtitle, '数据海洋活宝 · 主食白米饭');
  assert.equal(upgraded.voicePreset, 'whale_murmur');
  assert.equal(upgraded.voicePitch, 0.8);
  assert.equal(upgraded.defaultAvatarUrl, saved.defaultAvatarUrl);
  assert.deepEqual(upgraded.customExpressions, []);
  assert.equal(upgradeFeiyuPrompt(oldStockPromptV2), FEIYU_DEFAULT_PERSONA_PROMPT);
  assert.equal(normalizeStudioCompanions([{ ...saved, prompt: oldStockPromptV2 }])[0].prompt, FEIYU_STUDIO_PERSONA_PROMPT);
  const customPrompt = `${oldPrompt}\n我的自定义补充：轻声说话。`;
  assert.equal(upgradeFeiyuPrompt(customPrompt), customPrompt);
  assert.equal(upgradeFeiyuPrompt(oldPrompt.replace(/\n/g, '\r\n')), FEIYU_DEFAULT_PERSONA_PROMPT);
  const customStudio = normalizeStudioCompanions([{ ...saved, prompt: customPrompt, name: '我的鱼', voicePreset: 'atri_crystal' }])[0];
  assert.equal(customStudio.prompt, customPrompt);
  assert.equal(customStudio.name, '我的鱼');
  assert.equal(customStudio.voicePreset, 'atri_crystal');
  assert.equal(normalizeStudioCompanions([{ ...saved, isCustom: true }])[0].prompt, oldPrompt);
});

test('Atri uses the new avatar while stock saves migrate and custom art survives', () => {
  assert.equal(AI_ROLES.atri.avatarUrl, ATRI_AVATAR_URL);
  const atriDefault = DEFAULT_STUDIO_AI_COMPANIONS.find(character => character.id === 'studio-atri')!;
  assert.equal(atriDefault.defaultAvatarUrl, ATRI_AVATAR_URL);
  assert.equal(atriDefault.customExpressions[0].url, ATRI_AVATAR_URL);
  const stock = normalizeStudioCompanions([
    { ...atriDefault, defaultAvatarUrl: LEGACY_ATRI_AVATAR_URL, customExpressions: [{ id: 'atri-default', name: '默认', url: LEGACY_ATRI_AVATAR_URL }] },
  ])[0];
  assert.equal(stock.defaultAvatarUrl, ATRI_AVATAR_URL);
  assert.equal(stock.customExpressions[0].url, ATRI_AVATAR_URL);
  const custom = normalizeStudioCompanions([
    { ...atriDefault, defaultAvatarUrl: 'data:image/png;base64,atri', customExpressions: [{ id: 'mine', name: '笑', url: 'data:image/png;base64,mine' }] },
  ])[0];
  assert.equal(custom.defaultAvatarUrl, 'data:image/png;base64,atri');
  assert.equal(custom.customExpressions[0].url, 'data:image/png;base64,mine');
});

test('retired private host upgrades to neutral assets without replacing custom art or voice', () => {
  const upgraded = normalizeStudioUserCharacter(oldHost);
  assert.equal(upgraded.name, 'UP主本人');
  assert.equal(upgraded.defaultAvatarUrl, DEFAULT_USER_STUDIO_CHARACTER.defaultAvatarUrl);
  assert.equal(upgraded.customExpressions[0].url, upgraded.defaultAvatarUrl);
  assert.equal(upgraded.voicePreset, 'neutral_soft');
  assert.equal(upgraded.voicePitch, 1);
  const custom = { ...oldHost, name: '我的主持人', defaultAvatarUrl: 'data:image/png;base64,personal', voicePreset: 'atri_crystal' as const, voicePitch: 1.3, customExpressions: [{ id: 'mine', name: '微笑', url: 'data:image/png;base64,mine' }] };
  assert.deepEqual(normalizeStudioUserCharacter(custom), custom);
  const customVoice = normalizeStudioUserCharacter({ ...oldHost, voicePreset: 'retro_rpg', voicePitch: 0.75 });
  assert.equal(customVoice.voicePreset, 'retro_rpg');
  assert.equal(customVoice.voicePitch, 0.75);
});

test('updated presets and edited settings round-trip in full backups without creating demo content', () => {
  const host = normalizeStudioUserCharacter(oldHost);
  const companions = normalizeStudioCompanions([{ ...DEFAULT_STUDIO_AI_COMPANIONS[0], prompt: oldPrompt }]);
  const values = fieldsToStorage({ userChar: host, companions }, STUDIO_FIELDS);
  const restored = parseBackup(createBackup(values));
  assert.deepEqual(JSON.parse(restored[STUDIO_STORAGE_KEYS.USER_CHAR]), host);
  assert.deepEqual(JSON.parse(restored[STUDIO_STORAGE_KEYS.COMPANIONS]), companions);
  assert.deepEqual(JSON.parse(restored[STUDIO_STORAGE_KEYS.SCRIPT]), []);
  assert.equal(Object.values(JSON.parse(restored[STORAGE_KEYS.TIERS])).flat().length, 0);
  assert.equal(restored[STORAGE_KEYS.TASTE_REPORT], '');
});

test('explicit host edits survive remount, reload and backup even when choosing a retired stock URL', () => {
  const updated = updateStudioCharacter(DEFAULT_USER_STUDIO_CHARACTER, {
    defaultAvatarUrl: oldHost.defaultAvatarUrl,
  });
  const saved = fieldsToStorage({ userChar: updated }, STUDIO_FIELDS);
  const restored = parseBackup(createBackup(saved));
  let reloaded = JSON.parse(restored[STUDIO_STORAGE_KEYS.USER_CHAR]);
  for (let i = 0; i < 3; i++) {
    reloaded = normalizeStudioUserCharacter(JSON.parse(JSON.stringify(reloaded)));
    assert.equal(reloaded.defaultAvatarUrl, oldHost.defaultAvatarUrl);
    assert.equal(resolveCharacterStandeeUrl(reloaded, '思考'), oldHost.defaultAvatarUrl);
  }
  // Existing edited hosts predate the explicit-custom flag; their art also survives.
  const existing = normalizeStudioUserCharacter({ ...oldHost, name: '自定义主持人' });
  assert.equal(existing.defaultAvatarUrl, oldHost.defaultAvatarUrl);
  const stalePose = normalizeStudioUserCharacter({ ...oldHost, name: '测试主持人', isCustom: true, defaultAvatarUrl: 'data:image/png;base64,custom-saved' });
  assert.equal(resolveCharacterStandeeUrl(stalePose, '思考'), stalePose.defaultAvatarUrl);
  const changedPose = updateStudioCharacter(stalePose, { customExpressions: stalePose.customExpressions.map(e => ({ ...e, url: oldHost.defaultAvatarUrl, followDefaultAvatar: false })) });
  const changedAgain = normalizeStudioUserCharacter(updateStudioCharacter(changedPose, { defaultAvatarUrl: 'data:image/png;base64,new-main' }));
  assert.equal(resolveCharacterStandeeUrl(changedAgain, '思考'), oldHost.defaultAvatarUrl);
});

test('host speech uses the custom default while distinct expressions and legacy maps survive edits and backups', () => {
  const avatar = 'data:image/png;base64,custom-default';
  const smile = 'data:image/png;base64,custom-smile';
  const host = normalizeStudioUserCharacter({
    ...oldHost, name: '帅肉', defaultAvatarUrl: avatar,
    customExpressions: [...oldHost.customExpressions, { id: 'smile', name: '笑', url: smile }],
    expressions: { thinking: oldHost.defaultAvatarUrl, happy: smile },
  });
  assert.equal(host.name, 'UP主本人');
  assert.equal(resolveCharacterStandeeUrl(host, 'default'), avatar);
  assert.equal(resolveCharacterStandeeUrl(host, '思考'), avatar);
  assert.equal(resolveCharacterStandeeUrl(host, 'thinking'), avatar);
  assert.equal(resolveCharacterStandeeUrl(host, '笑'), smile);
  const changed = updateStudioCharacter(host, { defaultAvatarUrl: 'data:image/png;base64,new' });
  assert.equal(resolveCharacterStandeeUrl(changed, '思考'), changed.defaultAvatarUrl);
  assert.equal(resolveCharacterStandeeUrl(changed, 'thinking'), changed.defaultAvatarUrl);
  assert.equal(resolveCharacterStandeeUrl(changed, '笑'), smile);
  assert.equal(changed.expressions?.happy, smile);
  const restored = parseBackup(createBackup(fieldsToStorage({ userChar: changed }, STUDIO_FIELDS)));
  const reloaded = normalizeStudioUserCharacter(JSON.parse(restored[STUDIO_STORAGE_KEYS.USER_CHAR]));
  assert.deepEqual(reloaded, changed);
  assert.equal(resolveCharacterStandeeUrl(reloaded, '思考'), changed.defaultAvatarUrl);
  const stockExpression = normalizeStudioUserCharacter({ ...DEFAULT_USER_STUDIO_CHARACTER, defaultAvatarUrl: avatar });
  assert.equal(resolveCharacterStandeeUrl(stockExpression, '思考'), avatar);
  assert.deepEqual(updateStudioCharacter(host, { defaultAvatarUrl: avatar, customExpressions: [] }).customExpressions, []);
  const editedDefault = updateStudioCharacter(DEFAULT_USER_STUDIO_CHARACTER, { defaultAvatarUrl: avatar });
  assert.equal(resolveCharacterStandeeUrl(editedDefault, '思考'), avatar);
});

test('mist becomes the default while chosen themes survive reloads and full backup round-trips', () => {
  assert.equal(getInitialThemeId(null, null), DEFAULT_THEME_ID);
  assert.equal(getInitialThemeId('chameleon-aurora-pro', null), DEFAULT_THEME_ID);
  assert.equal(getInitialThemeId('sakura-noir', null), 'sakura-noir');
  assert.equal(getInitialThemeId('chameleon-aurora-pro', DEFAULT_THEME_VERSION), 'chameleon-aurora-pro');
  const restored = parseBackup(createBackup({ [STORAGE_KEYS.THEME]: 'chameleon-aurora-pro', [STORAGE_KEYS.THEME_DEFAULTS_VERSION]: DEFAULT_THEME_VERSION }));
  assert.equal(getInitialThemeId(restored[STORAGE_KEYS.THEME], restored[STORAGE_KEYS.THEME_DEFAULTS_VERSION]), 'chameleon-aurora-pro');
});
