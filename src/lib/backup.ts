import { ALL_TIER_SCORES, DEFAULT_VISIBLE_TIERS, LETTER_DEFAULT_VISIBLE_TIERS, normalizeTierMap } from './tierLogic';
import { DEFAULT_THEME_ID, DEFAULT_THEME_VERSION } from './themes';
import { BOARD_FIELDS, STUDIO_FIELDS, STORAGE_KEYS, fieldsToStorage, isRecord, storageToFields, type StorageValues } from './persistenceSchema';
import { DEFAULT_STUDIO_AI_COMPANIONS, DEFAULT_USER_STUDIO_CHARACTER, DEFAULT_STUDIO_PROMPT_RULES_CONFIG, buildInitialStudioScriptList, normalizeStudioBookends } from './studioDirector';

function requireValue(condition: unknown, path: string): asserts condition {
  if (!condition) throw new Error(`备份中的 ${path} 格式不正确，未修改当前数据。`);
}
function optionalText(value: Record<string, any>, fields: string[], path: string) {
  for (const field of fields) requireValue(value[field] === undefined || typeof value[field] === 'string', `${path}.${field}`);
}
function promptPlacement(value: Record<string, any>, path: string) {
  requireValue(value.position === undefined || ['before-character', 'after-character', 'd0'].includes(value.position), `${path}.position`);
  requireValue(value.priority === undefined || Number.isSafeInteger(value.priority), `${path}.priority`);
}
function records(value: unknown, path: string, validate: (item: Record<string, any>, path: string) => void) {
  requireValue(Array.isArray(value), path);
  value.forEach((item, i) => { requireValue(isRecord(item), `${path}[${i}]`); validate(item, `${path}[${i}]`); });
}
function anime(value: Record<string, any>, path: string) {
  requireValue(Number.isFinite(value.id) && typeof value.title === 'string', path);
  optionalText(value, ['cover', 'summary', 'originalTitle', 'airDate', 'studio', 'director', 'scriptWriter', 'originalWork', 'author', 'illustrator', 'publisher', 'platform', 'category', 'userBgmComment', 'bgmUpdatedAt'], path);
  for (const key of ['bgmScore', 'bgmRank', 'eps', 'volumes', 'ratingTotal', 'deepDataVersion', 'userBgmRate']) requireValue(value[key] === undefined || Number.isFinite(value[key]), `${path}.${key}`);
  for (const key of ['deepEnriched', 'isCustom']) requireValue(value[key] === undefined || typeof value[key] === 'boolean', `${path}.${key}`);
  requireValue(value.originalNumericScore === undefined || ALL_TIER_SCORES.includes(value.originalNumericScore), `${path}.originalNumericScore`);
  for (const key of ['collectionStats', 'ratingCounts']) requireValue(value[key] === undefined || (isRecord(value[key]) && Object.values(value[key]).every(Number.isFinite)), `${path}.${key}`);
  if (value.discussionStatus !== undefined) {
    const status = value.discussionStatus;
    requireValue(isRecord(status) && ['ok', 'unavailable'].includes(status.subject), `${path}.discussionStatus`);
    for (const key of ['charactersRequested', 'charactersFetched', 'updatedAt']) requireValue(Number.isFinite(status[key]) && status[key] >= 0, `${path}.discussionStatus.${key}`);
  }
  if (value.tags !== undefined) requireValue(Array.isArray(value.tags) && value.tags.every((x: unknown) => typeof x === 'string'), `${path}.tags`);
  for (const field of ['characters', 'tagsWithCount', 'bgmNetizenComments']) {
    if (value[field] !== undefined) records(value[field], `${path}.${field}`, (item, name) => {
      optionalText(item, ['name', 'nameCn', 'summary', 'cv', 'avatar', 'comment', 'user', 'relation'], name);
      if (field === 'characters') requireValue(Number.isFinite(item.id) && typeof item.name === 'string', name);
      if (field === 'tagsWithCount') requireValue(typeof item.name === 'string' && Number.isFinite(item.count), name);
      if (field === 'bgmNetizenComments') requireValue(typeof item.user === 'string' && typeof item.comment === 'string', name);
      for (const key of ['collects', 'commentCount', 'rate']) requireValue(item[key] === undefined || Number.isFinite(item[key]), `${name}.${key}`);
      if (item.topComments !== undefined) requireValue(Array.isArray(item.topComments) && item.topComments.every((x: unknown) => typeof x === 'string'), `${name}.topComments`);
    });
  }
}
function character(value: Record<string, any>, path: string) {
  requireValue(typeof value.id === 'string' && typeof value.name === 'string', path);
  optionalText(value, ['defaultAvatarUrl', 'prompt', 'subtitle', 'voicePreset'], path);
  requireValue(value.voicePitch === undefined || (Number.isFinite(value.voicePitch) && value.voicePitch > 0 && value.voicePitch <= 3), `${path}.voicePitch`);
  requireValue(value.expressions === undefined || (isRecord(value.expressions) && Object.values(value.expressions).every(x => typeof x === 'string')), `${path}.expressions`);
  if (value.customExpressions !== undefined) records(value.customExpressions, `${path}.customExpressions`, (entry, name) => {
    requireValue(typeof entry.id === 'string' && typeof entry.name === 'string' && typeof entry.url === 'string', name);
    optionalText(entry, ['note'], name);
    requireValue(entry.followDefaultAvatar === undefined || typeof entry.followDefaultAvatar === 'boolean', `${name}.followDefaultAvatar`);
  });
}

export function parseBackup(input: unknown): StorageValues {
  requireValue(isRecord(input) && isRecord(input.tiers), 'tiers（请选择排行榜备份文件）');
  if (typeof input.version === 'string') requireValue(Number(input.version.split('.')[0]) <= 4, 'version（版本过新，请更新应用后导入）');
  const source = isRecord(input.tiers.nextTiers) ? input.tiers.nextTiers : input.tiers;
  for (const [score, list] of Object.entries(source)) {
    requireValue(ALL_TIER_SCORES.includes(Number(score) as never), `tiers.${score}`);
    records(list, `tiers.${score}`, anime);
  }
  const parsed = { ...input, tiers: normalizeTierMap(JSON.parse(JSON.stringify(source))) };
  for (const list of Object.values(parsed.tiers)) for (const item of list) item.cover ??= '';
  if (input.unrankedPool !== undefined) records(input.unrankedPool, 'unrankedPool', anime);
  const ids = [...Object.values(parsed.tiers).flat(), ...(input.unrankedPool || [])].map(item => item.id);
  requireValue(new Set(ids).size === ids.length, '作品 ID（同一作品不能重复出现在榜单和候选池）');
  if (input.comments !== undefined) records(input.comments, 'comments', (item, path) => {
    requireValue(typeof item.id === 'string' && Number.isFinite(item.animeId) && typeof item.text === 'string' && typeof item.animeTitle === 'string', path);
    requireValue(ALL_TIER_SCORES.includes(item.tierScore) && [1, 2, 3, 4, 5, 6].includes(item.cardStyle), path);
    optionalText(item, ['animeCover'], path);
  });
  if (input.reportChat !== undefined) records(input.reportChat, 'reportChat', (item, path) => {
    requireValue(['user', 'assistant'].includes(item.role) && typeof item.content === 'string', path);
  });
  optionalText(input, BOARD_FIELDS.filter(([, , kind]) => kind === 'text').map(([field]) => field), 'settings');
  if (input.gradingSystem !== undefined) requireValue(['numeric', 'letter'].includes(input.gradingSystem), 'gradingSystem');
  if (input.visibleTiers !== undefined) requireValue(Array.isArray(input.visibleTiers) && input.visibleTiers.every((x: never) => ALL_TIER_SCORES.includes(x)), 'visibleTiers');
  for (const name of ['showTitles', 'exportHideEmptyTiers', 'useCustomBg', 'enableParticles', 'enableGlow', 'enableGlassBlur']) requireValue(input[name] === undefined || typeof input[name] === 'boolean', name);
  for (const [name, max] of [['tierRowOpacity', 100], ['glassBlurPx', 100]] as const) requireValue(input[name] === undefined || (Number.isFinite(input[name]) && input[name] >= 0 && input[name] <= max), name);
  if (input.bgmSyncConfig !== undefined) { requireValue(isRecord(input.bgmSyncConfig), 'bgmSyncConfig'); optionalText(input.bgmSyncConfig, ['token', 'username', 'nickname', 'avatar'], 'bgmSyncConfig'); }
  if (input.aiConfig !== undefined) {
    requireValue(isRecord(input.aiConfig), 'aiConfig');
    optionalText(input.aiConfig, ['baseUrl', 'apiKey', 'model', 'selectedPersonaId', 'd0Prompt'], 'aiConfig');
    if (input.aiConfig.availableModels !== undefined) requireValue(Array.isArray(input.aiConfig.availableModels) && input.aiConfig.availableModels.every((x: unknown) => typeof x === 'string'), 'aiConfig.availableModels');
    for (const key of ['personas', 'worldBookEntries']) if (input.aiConfig[key] !== undefined) records(input.aiConfig[key], `aiConfig.${key}`, (entry, path) => {
      requireValue(typeof entry.id === 'string', path);
      optionalText(entry, ['displayName', 'avatarUrl', 'prompt', 'title', 'content', 'shortDesc'], path);
      if (key === 'worldBookEntries') {
        promptPlacement(entry, path);
        requireValue(entry.scope === undefined || ['all', 'report', 'studio'].includes(entry.scope), `${path}.scope`);
        requireValue(entry.enabled === undefined || typeof entry.enabled === 'boolean', `${path}.enabled`);
      }
    });
  }
  let studio: StorageValues = {};
  if (input.studio !== undefined) {
    requireValue(isRecord(input.studio), 'studio');
    const s = input.studio;
    if (s.script !== undefined) records(s.script, 'studio.script', (item, path) => {
      requireValue(Number.isFinite(item.animeId) && Number.isFinite(item.orderIndex) && ALL_TIER_SCORES.includes(item.targetScore), path);
      requireValue(typeof item.userText === 'string' && typeof item.aiRawText === 'string' && isRecord(item.anime), path);
      anime(item.anime, `${path}.anime`);
      optionalText(item, ['userImage', 'userImageEffect', 'userExpression', 'userEmote'], path);
    });
    if (s.userChar !== undefined) { requireValue(isRecord(s.userChar), 'studio.userChar'); character(s.userChar, 'studio.userChar'); }
    if (s.companions !== undefined) { records(s.companions, 'studio.companions', character); requireValue(s.companions.length > 0, 'studio.companions'); }
    optionalText(s, ['selectedCompanionId', 'metaCardStyle'], 'studio');
    for (const name of ['enableExpressions', 'enableEmotes', 'isPoolBlindBox', 'isVoiceMuted']) requireValue(s[name] === undefined || typeof s[name] === 'boolean', `studio.${name}`);
    for (const name of ['bubbleFontSize', 'speechSpeed']) requireValue(s[name] === undefined || (Number.isFinite(s[name]) && s[name] > 0), `studio.${name}`);
    if (s.promptRules !== undefined) {
      requireValue(isRecord(s.promptRules), 'studio.promptRules');
      optionalText(s.promptRules, ['expressionRuleTemplate', 'timelineRuleTemplate'], 'studio.promptRules');
      requireValue(s.promptRules.enabledWorldBookIds === undefined || (Array.isArray(s.promptRules.enabledWorldBookIds) && s.promptRules.enabledWorldBookIds.every((x: unknown) => typeof x === 'string')), 'studio.promptRules.enabledWorldBookIds');
      for (const key of ['expressionRulePlacement', 'timelineRulePlacement']) if (s.promptRules[key] !== undefined) {
        requireValue(isRecord(s.promptRules[key]), `studio.promptRules.${key}`);
        promptPlacement(s.promptRules[key], `studio.promptRules.${key}`);
      }
    }
    if (s.bookends !== undefined) {
      requireValue(isRecord(s.bookends), 'studio.bookends');
      for (const key of ['opening', 'ending']) {
        requireValue(isRecord(s.bookends[key]), `studio.bookends.${key}`);
        optionalText(s.bookends[key], ['userText', 'aiRawText'], `studio.bookends.${key}`);
        for (const field of ['enabled', 'generateAi']) requireValue(s.bookends[key][field] === undefined || typeof s.bookends[key][field] === 'boolean', `studio.bookends.${key}.${field}`);
      }
    }
    studio = fieldsToStorage(s, STUDIO_FIELDS);
  }
  return { ...fieldsToStorage(parsed), ...studio };
}

export function createBackup(values: StorageValues) {
  const board = {
    tiers: normalizeTierMap({}), unrankedPool: [], comments: [],
    boardTitle: '动画 Tier List 鉴赏排行', visibleTiers: [...DEFAULT_VISIBLE_TIERS], gradingSystem: 'numeric',
    showTitles: true, exportHideEmptyTiers: true, activeThemeId: DEFAULT_THEME_ID, themeDefaultsVersion: DEFAULT_THEME_VERSION,
    tierRowStyle: 'ambient-glass', tierRowOpacity: 82, customBgUrl: '', useCustomBg: false,
    enableParticles: false, enableGlow: true, enableGlassBlur: true, glassBlurPx: 10,
    savedReport: '', reportChat: [], aiConfig: {}, bgmSyncConfig: { token: '' },
    ...storageToFields(values),
  };
  if (!values[STORAGE_KEYS.VISIBLE_TIERS] && board.gradingSystem === 'letter') {
    board.visibleTiers = [...LETTER_DEFAULT_VISIBLE_TIERS];
  }
  return {
    version: '4.0.0-all-in-one', exportedAt: new Date().toISOString(),
    ...board, studio: {
      script: buildInitialStudioScriptList(board.tiers || {}, board.comments || [], undefined, 'studio-feiyu', board.gradingSystem === 'letter' ? 'letter' : 'numeric'),
      userChar: DEFAULT_USER_STUDIO_CHARACTER, companions: DEFAULT_STUDIO_AI_COMPANIONS,
      selectedCompanionId: 'studio-feiyu', enableExpressions: true, enableEmotes: true,
      metaCardStyle: 'wide-feather', isPoolBlindBox: false, promptRules: DEFAULT_STUDIO_PROMPT_RULES_CONFIG,
      bubbleFontSize: 13.5, speechSpeed: 1, isVoiceMuted: false, bookends: normalizeStudioBookends(),
      ...storageToFields(values, STUDIO_FIELDS),
    },
  };
}

// Embed only asset fields; prose/prompts and credentials are never sent to image services.
export async function embedBackupImages<T>(backup: T, embed: (url: string) => Promise<string>) {
  const copy: T = JSON.parse(JSON.stringify(backup));
  const jobs: Array<{ target: Record<string, any>; key: string; url: string }> = [];
  const assetFields = new Set(['cover', 'animeCover', 'customBgUrl', 'defaultAvatarUrl', 'avatarUrl', 'avatar', 'userImage']);
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if ((assetFields.has(key) || (key === 'url' && 'name' in value)) && typeof item === 'string' && item && !item.startsWith('data:')) jobs.push({ target: value, key, url: item });
      else if (typeof item === 'object') visit(item);
    }
  };
  visit(copy);
  const urls = [...new Set(jobs.map(job => job.url))];
  const results = new Map<string, string>();
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(4, urls.length) }, async () => {
    while (index < urls.length) {
      const url = urls[index++];
      try { results.set(url, await embed(url)); } catch { results.set(url, url); }
    }
  }));
  for (const job of jobs) job.target[job.key] = results.get(job.url) || job.url;
  const externalImages = [...results.values()].filter(url => !url.startsWith('data:')).length;
  return { backup: copy, externalImages };
}
