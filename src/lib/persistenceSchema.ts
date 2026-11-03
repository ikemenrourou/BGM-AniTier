// One registry for browser persistence, server recovery, and portable backups.
export const STORAGE_KEYS = {
  TIERS: 'anime-tier-list-data-v5',
  TIERS_BACKUP: 'anime-tier-list-data-backup-v5',
  UNRANKED_POOL: 'anime-tier-list-unranked-pool-v5',
  VISIBLE_TIERS: 'anime-tier-list-visible-tiers-v5',
  GRADING_SYSTEM: 'anime-tier-list-grading-system-v1',
  TITLE: 'anime-tier-list-title-v5',
  SHOW_TITLES: 'anime-tier-list-show-titles-v5',
  THEME: 'anime-tier-list-theme-v12',
  THEME_DEFAULTS_VERSION: 'anime-tier-list-theme-defaults-version',
  TIER_ROW_STYLE: 'anime-tier-list-row-style-v2',
  TIER_ROW_OPACITY: 'anime-tier-list-row-opacity-v2',
  CUSTOM_BG: 'anime-tier-list-custom-bg-v5',
  COMMENTS: 'anime-tier-list-comments-v8',
  TASTE_REPORT: 'anime-tier-list-taste-report-v5',
  REPORT_CHAT: 'anime-tier-list-report-chat-v1',
  BGM_SYNC: 'anime-tier-list-bgm-sync-v5',
  EXPORT_HIDE_EMPTY: 'anime-tier-list-export-hide-empty-v1',
  USE_CUSTOM_BG: 'anime-tier-list-use-custom-bg-v1',
  PARTICLES: 'anime-tier-list-particles-v1',
  GLOW: 'anime-tier-list-glow-v1',
  GLASS_BLUR: 'anime-tier-list-glass-blur-v1',
  GLASS_BLUR_PX: 'anime-tier-list-glass-blur-px-v1',
};

export const AI_CONFIG_KEY = 'anime-tier-list-ai-config-v10';
export const STUDIO_STORAGE_KEYS = {
  SCRIPT: 'bgm-anitier-studio-script-v2',
  USER_CHAR: 'bgm-anitier-studio-user-char-v2',
  COMPANIONS: 'bgm-anitier-studio-companions-v2',
  SELECTED_COMPANION_ID: 'bgm-anitier-studio-selected-companion-v2',
  ENABLE_EXPRESSIONS: 'bgm-anitier-studio-enable-expressions-v2',
  ENABLE_EMOTES: 'bgm-anitier-studio-enable-emotes-v2',
  META_STYLE: 'bgm-anitier-studio-meta-style-v2',
  BLIND_POOL: 'bgm-anitier-studio-blind-pool-v2',
  PROMPT_RULES: 'bgm-anitier-studio-prompt-rules-v2',
  BUBBLE_FONT_SIZE: 'bgm-anitier-studio-bubble-font-size',
  BOOKENDS: 'bgm-anitier-studio-bookends-v1',
  SPEECH_SPEED: 'bgm-anitier-studio-speech-speed-v1',
  VOICE_MUTED: 'bgm-anitier-studio-voice-muted-v1',
};

type Field = readonly [string, string, 'text' | 'json'];
export const BOARD_FIELDS: readonly Field[] = [
  ['boardTitle', STORAGE_KEYS.TITLE, 'text'], ['tiers', STORAGE_KEYS.TIERS, 'json'],
  ['unrankedPool', STORAGE_KEYS.UNRANKED_POOL, 'json'], ['comments', STORAGE_KEYS.COMMENTS, 'json'],
  ['visibleTiers', STORAGE_KEYS.VISIBLE_TIERS, 'json'], ['gradingSystem', STORAGE_KEYS.GRADING_SYSTEM, 'text'],
  ['showTitles', STORAGE_KEYS.SHOW_TITLES, 'json'], ['exportHideEmptyTiers', STORAGE_KEYS.EXPORT_HIDE_EMPTY, 'json'],
  ['activeThemeId', STORAGE_KEYS.THEME, 'text'], ['tierRowStyle', STORAGE_KEYS.TIER_ROW_STYLE, 'text'],
  ['themeDefaultsVersion', STORAGE_KEYS.THEME_DEFAULTS_VERSION, 'text'],
  ['tierRowOpacity', STORAGE_KEYS.TIER_ROW_OPACITY, 'json'], ['customBgUrl', STORAGE_KEYS.CUSTOM_BG, 'text'],
  ['useCustomBg', STORAGE_KEYS.USE_CUSTOM_BG, 'json'], ['enableParticles', STORAGE_KEYS.PARTICLES, 'json'],
  ['enableGlow', STORAGE_KEYS.GLOW, 'json'], ['enableGlassBlur', STORAGE_KEYS.GLASS_BLUR, 'json'],
  ['glassBlurPx', STORAGE_KEYS.GLASS_BLUR_PX, 'json'], ['savedReport', STORAGE_KEYS.TASTE_REPORT, 'text'],
  ['reportChat', STORAGE_KEYS.REPORT_CHAT, 'json'],
  ['bgmSyncConfig', STORAGE_KEYS.BGM_SYNC, 'json'], ['aiConfig', AI_CONFIG_KEY, 'json'],
];
export const STUDIO_FIELDS: readonly Field[] = [
  ['script', STUDIO_STORAGE_KEYS.SCRIPT, 'json'], ['userChar', STUDIO_STORAGE_KEYS.USER_CHAR, 'json'],
  ['companions', STUDIO_STORAGE_KEYS.COMPANIONS, 'json'], ['selectedCompanionId', STUDIO_STORAGE_KEYS.SELECTED_COMPANION_ID, 'text'],
  ['enableExpressions', STUDIO_STORAGE_KEYS.ENABLE_EXPRESSIONS, 'json'], ['enableEmotes', STUDIO_STORAGE_KEYS.ENABLE_EMOTES, 'json'],
  ['metaCardStyle', STUDIO_STORAGE_KEYS.META_STYLE, 'text'], ['isPoolBlindBox', STUDIO_STORAGE_KEYS.BLIND_POOL, 'json'],
  ['promptRules', STUDIO_STORAGE_KEYS.PROMPT_RULES, 'json'], ['bubbleFontSize', STUDIO_STORAGE_KEYS.BUBBLE_FONT_SIZE, 'json'],
  ['bookends', STUDIO_STORAGE_KEYS.BOOKENDS, 'json'], ['speechSpeed', STUDIO_STORAGE_KEYS.SPEECH_SPEED, 'json'],
  ['isVoiceMuted', STUDIO_STORAGE_KEYS.VOICE_MUTED, 'json'],
];
export const PERSISTED_KEYS = [...BOARD_FIELDS, ...STUDIO_FIELDS].map(([, key]) => key);
export type StorageValues = Record<string, string>;
export function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function pickStorageValues(value: unknown): StorageValues {
  if (!isRecord(value)) return {};
  return Object.fromEntries(PERSISTED_KEYS.filter(key => typeof value[key] === 'string').map(key => [key, value[key]]));
}
export function fieldsToStorage(value: Record<string, unknown>, fields = BOARD_FIELDS): StorageValues {
  return Object.fromEntries(fields.filter(([field]) => value[field] !== undefined).map(([field, key, kind]) =>
    [key, kind === 'text' ? String(value[field]) : JSON.stringify(value[field])],
  ));
}
export function storageToFields(values: StorageValues, fields = BOARD_FIELDS): Record<string, any> {
  return Object.fromEntries(fields.filter(([, key]) => values[key] !== undefined).map(([field, key, kind]) =>
    [field, kind === 'text' ? values[key] : JSON.parse(values[key])],
  ));
}
export function mergeStoragePatch(current: StorageValues, expected: StorageValues, patch: StorageValues): StorageValues {
  for (const [key, value] of Object.entries(patch)) {
    if (current[key] !== expected[key] && current[key] !== value) {
      throw new Error('另一页面已修改同一份数据。请先导出当前内容，再刷新页面。');
    }
  }
  return { ...current, ...patch };
}

export function reconcileServerState(local: StorageValues, baseline: StorageValues, remote: StorageValues) {
  const recovered: StorageValues = {};
  const expected = { ...baseline };
  for (const [key, value] of Object.entries(remote)) {
    if (local[key] === baseline[key]) recovered[key] = value;
    if (local[key] === baseline[key] || local[key] === value) expected[key] = value;
  }
  return { recovered, expected };
}
