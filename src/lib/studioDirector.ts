import type {
  AnimeItem,
  CommentItem,
  TierGradingSystem,
  TierMap,
  TierScore,
  WorldBookEntry,
  PromptPlacement,
} from '../types';
import {
  ALL_TIER_SCORES,
  formatTierLabel,
  normalizeWorldBookEntries,
  seededUnitHash,
} from './tierLogic';
import { buildStudioSubjectContext } from './studioContext';
import { buildFeiyuAssetUrl, FEIYU_DEFAULT_PERSONA_PROMPT, FEIYU_STUDIO_TASK_PROMPT, upgradeFeiyuPrompt } from './feiyuPersona';
import { DEFAULT_HOST_AVATAR_URL } from './studioHostAvatar';
import { presetFingerprint } from './presetFingerprint';
import { normalizeReportMarkup } from './reportMarkup';
import { appliesToWorldBookScope, assemblePositionedPrompt, normalizePromptPlacement, sortPromptEntries } from './promptOrder';

export { buildFeiyuAssetUrl, FEIYU_DEFAULT_PERSONA_PROMPT } from './feiyuPersona';

/**
 * Dynamic expression name string (user can define any expression name, e.g., "摇头", "馋(筷子)", "得分(10分)", "笑", etc.)
 */
export type StudioExpressionId = string;

export type BlueArchiveEmoteId =
  | 'none'
  | 'sweat_drops'
  | 'anger_vein'
  | 'sparkles'
  | 'hearts'
  | 'question'
  | 'exclamation'
  | 'sleep_zzz'
  | 'fire';

export type VoiceBlipPresetId =
  | 'neutral_soft'
  | 'whale_murmur'
  | 'mochi_loli'
  | 'mesugaki_pop'
  | 'atri_crystal'
  | 'neko_soft'
  | 'creator_clean'
  | 'retro_rpg';

export type StudioMetaCardStyle = 'wide-feather' | 'wide-split' | 'wide-polaroid';

export interface StudioCustomExpression {
  id: string;
  /** Expression tag name used in `[name]`, e.g. "摇头", "馋(筷子)", "得分(10分)" */
  name: string;
  /** Standee / sprite image or GIF URL */
  url: string;
  /** A default pose follows the character's main art instead of retaining an old URL. */
  followDefaultAvatar?: boolean;
  /** Optional scene/usage note injected into {{EXPRESSION_LIST}}, e.g. "遇到10分神作时使用" */
  note?: string;
}

export interface StudioCustomEmoteRule {
  id: BlueArchiveEmoteId;
  /** Tag name used in `[表情:漫符]`, e.g. "汗滴", "青筋", "闪光" */
  tag: string;
  label: string;
  /** Optional scene/usage note injected into {{EMOTE_LIST}} */
  note?: string;
  enabled: boolean;
}

export interface StudioPromptRulesConfig {
  /** Editable prompt section for expressions & comic emotes (supports {{EXPRESSION_LIST}} and {{EMOTE_LIST}}) */
  expressionRuleTemplate: string;
  /** Editable prompt section for timeline anti-spoiler & output format (supports {{TOTAL_WORKS}}) */
  timelineRuleTemplate: string;
  expressionRulePlacement: PromptPlacement;
  timelineRulePlacement: PromptPlacement;
  /** Studio selection is separate from report selection; no entry is mandatory. */
  enabledWorldBookIds: string[];
}

export interface DialogueSegment {
  expression: StudioExpressionId;
  emote: BlueArchiveEmoteId;
  text: string;
}

export interface StudioScriptItem {
  animeId: number;
  anime: AnimeItem;
  targetScore: TierScore;
  orderIndex: number;
  userText: string;
  userImage?: string;
  userImageEffect?: 'pop' | 'slam' | 'float';
  userExpression?: StudioExpressionId;
  userEmote?: BlueArchiveEmoteId;
  aiRawText: string;
}

export interface StudioBookendScene {
  enabled: boolean;
  userText: string;
  aiRawText: string;
  generateAi: boolean;
}

export interface StudioBookends {
  opening: StudioBookendScene;
  ending: StudioBookendScene;
}

/** Keep these separate from per-work scripts so reordering or refreshing the board preserves them. */
export function normalizeStudioBookends(value?: unknown): StudioBookends {
  const saved = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const scene = (key: 'opening' | 'ending'): StudioBookendScene => {
    const raw = saved[key];
    const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    return {
      enabled: typeof data.enabled === 'boolean' ? data.enabled : false,
      userText: typeof data.userText === 'string' ? data.userText : '',
      aiRawText: typeof data.aiRawText === 'string' ? data.aiRawText : '',
      generateAi: typeof data.generateAi === 'boolean' ? data.generateAi : true,
    };
  };
  return { opening: scene('opening'), ending: scene('ending') };
}

export interface StudioCharacterConfig {
  id: string;
  name: string;
  subtitle?: string;
  defaultAvatarUrl: string;
  /** Customizable list of expressions with name, URL, and optional usage note */
  customExpressions: StudioCustomExpression[];
  /** Legacy map kept optional for backward compatibility */
  expressions?: Record<string, string>;
  voicePreset: VoiceBlipPresetId;
  voicePitch: number;
  prompt?: string;
  isCustom?: boolean;
}

export interface StudioPlaybackStep {
  stepIndex: number;
  workOrderIndex: number; // -1 for opening, 0 .. N-1 for works, N for finale
  phase: 'opening' | 'work' | 'finale';
  activeWork: StudioScriptItem | null;
  activeTargetScore: TierScore | null;
  /**
   * True when this step is the exact moment the work leaves the candidate pool
   * and flies into its target Tier row (triggers fly-in animation & delayed top-right score reveal)
   */
  isWorkEntryStep: boolean;
  rankedByTierSoFar: TierMap;
  remainingPool: AnimeItem[];
  speaker: 'user' | 'ai';
  userBubble: {
    visible: boolean;
    isTypingNow: boolean;
    text: string;
    image?: string;
    imageEffect?: 'pop' | 'slam' | 'float';
    expression: StudioExpressionId;
    emote: BlueArchiveEmoteId;
  };
  aiBubble: {
    visible: boolean;
    isTypingNow: boolean;
    text: string;
    expression: StudioExpressionId;
    emote: BlueArchiveEmoteId;
    segmentIndex: number;
    totalSegments: number;
  };
}

export const BLUE_ARCHIVE_EMOTE_META: Array<{
  id: BlueArchiveEmoteId;
  label: string;
  shortTag: string;
  badgeText: string;
  defaultNote: string;
}> = [
  { id: 'none', label: '无漫符', shortTag: '无', badgeText: '—', defaultNote: '' },
  {
    id: 'sweat_drops',
    label: '汗滴',
    shortTag: '汗滴',
    badgeText: '💦 汗滴',
    defaultNote: '慌张、擦汗、心虚或替人尴尬时偶尔使用',
  },
  {
    id: 'anger_vein',
    label: '青筋',
    shortTag: '青筋',
    badgeText: '💢 青筋',
    defaultNote: '炸毛、气鼓鼓抗议或强烈吐槽烂作时偶尔使用',
  },
  {
    id: 'sparkles',
    label: '闪光',
    shortTag: '闪光',
    badgeText: '✨ 闪光',
    defaultNote: '眼睛发亮、夸奖神作或得意讨夸时偶尔使用',
  },
  {
    id: 'hearts',
    label: '爱心',
    shortTag: '爱心',
    badgeText: '❤️ 爱心',
    defaultNote: '非常喜欢、贴贴主人或厨力爆发时偶尔使用',
  },
  {
    id: 'question',
    label: '问号',
    shortTag: '问号',
    badgeText: '❓ 问号',
    defaultNote: '歪头疑惑、看不懂主人给分操作时偶尔使用',
  },
  {
    id: 'exclamation',
    label: '叹号',
    shortTag: '叹号',
    badgeText: '❗ 叹号',
    defaultNote: '突然发现盲点、被惊到或抓包时偶尔使用',
  },
  {
    id: 'sleep_zzz',
    label: '催眠',
    shortTag: '催眠',
    badgeText: '💤 催眠',
    defaultNote: '犯困、摸鱼或吐槽催眠无聊番时偶尔使用',
  },
  {
    id: 'fire',
    label: '燃',
    shortTag: '燃',
    badgeText: '🔥 燃',
    defaultNote: '作画经费爆炸、热血高能时偶尔使用',
  },
];

export const DEFAULT_CUSTOM_EMOTE_RULES: StudioCustomEmoteRule[] = BLUE_ARCHIVE_EMOTE_META.filter(
  m => m.id !== 'none',
).map(m => ({
  id: m.id,
  tag: m.shortTag,
  label: m.label,
  note: m.defaultNote,
  enabled: true,
}));

export const VOICE_BLIP_PRESETS: Array<{
  id: VoiceBlipPresetId;
  label: string;
  desc: string;
  defaultPitch: number;
}> = [
  {
    id: 'neutral_soft',
    label: '中性轻音 (通用主持人)',
    desc: '柔和短促的合成音，音高起伏小，不使用真人采样',
    defaultPitch: 1,
  },
  {
    id: 'whale_murmur',
    label: '鲸鱼娘 · 软绵轻哼',
    desc: '轻轻的嗯啵短音，收敛高频和音高跳动，适合连续吐槽',
    defaultPitch: 1.08,
  },
  {
    id: 'mochi_loli',
    label: '软糯团子音 (温和气泡音)',
    desc: '圆润高频气泡元音，软软糯糯的语素质感',
    defaultPitch: 1.16,
  },
  {
    id: 'mesugaki_pop',
    label: '轻快俏皮音 (双音节跳音)',
    desc: '轻快富有弹性的双音节颗粒，尾音微扬',
    defaultPitch: 1.22,
  },
  {
    id: 'atri_crystal',
    label: '清脆水晶音 (清亮泛音)',
    desc: '带透明泛音的轻柔电子气泡声',
    defaultPitch: 1.14,
  },
  {
    id: 'neko_soft',
    label: '慵懒柔和音 (微弧滑音)',
    desc: '带有轻微半音弧度的温软语素音',
    defaultPitch: 1.08,
  },
  {
    id: 'creator_clean',
    label: '清爽中音',
    desc: '干净温和的木琴气泡音，适合与搭档声线区分',
    defaultPitch: 0.95,
  },
  {
    id: 'retro_rpg',
    label: '经典像素短音',
    desc: '复古 RPG 对话框的轻柔短促声',
    defaultPitch: 1.04,
  },
];

export const DEFAULT_FEIYU_EXPRESSIONS: StudioCustomExpression[] = [
  {
    id: 'feiyu-think-serious',
    name: '思考(认真地)',
    url: buildFeiyuAssetUrl('大肥鱼-思考(认真地).gif'),
    note: '认真分析作品制作、琢磨主人给分逻辑时使用',
  },
  {
    id: 'feiyu-think-confident',
    name: '思考(自信地)',
    url: buildFeiyuAssetUrl('大肥鱼-思考(自信地).gif'),
    note: '得意洋洋、觉得本鱼一眼看穿了主人心思或讨夸时使用',
  },
  {
    id: 'feiyu-laugh',
    name: '笑',
    url: buildFeiyuAssetUrl('大肥鱼-笑.gif'),
    note: '开心、觉得好笑、乐不可支时使用',
  },
  {
    id: 'feiyu-nod',
    name: '点头',
    url: buildFeiyuAssetUrl('大肥鱼-点头.gif'),
    note: '赞同主人的打分与品味、附和时使用',
  },
  {
    id: 'feiyu-shake-head',
    name: '摇头',
    url: buildFeiyuAssetUrl('大肥鱼-摇头.gif'),
    note: '不赞同、摇头叹气、觉得这部作品不行时使用',
  },
  {
    id: 'feiyu-score-10',
    name: '得分(10分)',
    url: buildFeiyuAssetUrl('大肥鱼-得分(10分).gif'),
    note: '遇到10分/S级神作或极高评价时举10分牌',
  },
  {
    id: 'feiyu-score-0',
    name: '得分(0分)',
    url: buildFeiyuAssetUrl('大肥鱼-得分(0分).gif'),
    note: '遇到极低分烂作、灾难级崩坏时举0分牌',
  },
  {
    id: 'feiyu-thumbs-up',
    name: '点赞',
    url: buildFeiyuAssetUrl('大肥鱼-点赞.gif'),
    note: '夸奖神作、认可主人品味或制作组厨力时使用',
  },
  {
    id: 'feiyu-thumbs-down',
    name: '反向点赞',
    url: buildFeiyuAssetUrl('大肥鱼-反向点赞.gif'),
    note: '倒赞、嫌弃拉胯展开或嘲讽杂鱼操作时使用',
  },
  {
    id: 'feiyu-type-normal',
    name: '打字(普通)',
    url: buildFeiyuAssetUrl('大肥鱼-打字(普通).gif'),
    note: '日常平静聊天、随手敲字点评时使用',
  },
  {
    id: 'feiyu-type-annoyed',
    name: '打字(恼怒)',
    url: buildFeiyuAssetUrl('大肥鱼-打字(恼怒).gif'),
    note: '对槽点满满的作品或主人的怪异给分小声嘟囔吐槽时使用',
  },
  {
    id: 'feiyu-type-angry',
    name: '打字(生气)',
    url: buildFeiyuAssetUrl('大肥鱼-打字(生气).gif'),
    note: '被气到、嘴硬对线或激烈吐槽烂活时使用',
  },
  {
    id: 'feiyu-greedy',
    name: '馋(筷子)',
    url: buildFeiyuAssetUrl('大肥鱼-馋(筷子).gif'),
    note: '看到美食、香喷喷的制作/人设，或惦记白米饭加餐时使用',
  },
  {
    id: 'feiyu-watermelon',
    name: '吃(西瓜)',
    url: buildFeiyuAssetUrl('大肥鱼-吃(西瓜).gif'),
    note: '吃瓜看戏、围观争议话题作或主人的暴言时使用',
  },
  {
    id: 'feiyu-note',
    name: '记录1',
    url: buildFeiyuAssetUrl('大肥鱼-记录1.gif'),
    note: '拿小本本记下主人的XP偏好、黑历史或客观数据时使用',
  },
  {
    id: 'feiyu-exclamation',
    name: '叹号',
    url: buildFeiyuAssetUrl('大肥鱼-叹号.gif'),
    note: '突然发现盲点、抓包主人的小心思时使用',
  },
  {
    id: 'feiyu-shock',
    name: '惊吓',
    url: buildFeiyuAssetUrl('大肥鱼-惊吓.gif'),
    note: '被离谱打分、神转折或暴雷吓一跳时使用',
  },
  {
    id: 'feiyu-sweat',
    name: '汗',
    url: buildFeiyuAssetUrl('大肥鱼-汗.gif'),
    note: '流汗、无语尴尬、替制作组或主人的理由擦汗时使用',
  },
  {
    id: 'feiyu-blank',
    name: '呆(贴纸)3',
    url: buildFeiyuAssetUrl('大肥鱼-呆(贴纸)3.gif'),
    note: '愣住、发呆宕机、摸不着头脑时使用',
  },
  {
    id: 'feiyu-expect',
    name: '期待2',
    url: buildFeiyuAssetUrl('大肥鱼-期待2.gif'),
    note: '星星眼期待、好奇主人评价或讨夸时使用',
  },
  {
    id: 'feiyu-shy',
    name: '害羞1',
    url: buildFeiyuAssetUrl('大肥鱼-害羞1.gif'),
    note: '被夸奖不好意思、或聊到纯爱甜番害羞时使用',
  },
  {
    id: 'feiyu-angry',
    name: '生气',
    url: buildFeiyuAssetUrl('大肥鱼-生气.gif'),
    note: '鼓脸不服气、死不认胖抗议时使用',
  },
  {
    id: 'feiyu-cry',
    name: '哭1',
    url: buildFeiyuAssetUrl('大肥鱼-哭1.gif'),
    note: '被催泪神作刀哭、心疼角色或委屈时使用',
  },
  {
    id: 'feiyu-scared',
    name: '害怕1',
    url: buildFeiyuAssetUrl('大肥鱼-害怕1.gif'),
    note: '遇到致郁、胃痛、猎奇恐怖番害怕时使用',
  },
  {
    id: 'feiyu-sleep',
    name: '睡觉(UU)',
    url: buildFeiyuAssetUrl('大肥鱼-睡觉(UU).gif'),
    note: '吐槽催眠番、白开水剧情或犯困摸鱼时使用',
  },
  {
    id: 'feiyu-game',
    name: '打游戏',
    url: buildFeiyuAssetUrl('大肥鱼-打游戏.gif'),
    note: '聊到游戏/游改、或者理直气壮摸鱼“端到端验收”时使用',
  },
  {
    id: 'feiyu-card',
    name: '刷卡',
    url: buildFeiyuAssetUrl('大肥鱼-刷卡.gif'),
    note: '夸赞经费燃烧、富婆制作组或值得掏钱买单时使用',
  },
  {
    id: 'feiyu-button',
    name: '按钮',
    url: buildFeiyuAssetUrl('大肥鱼-按钮.gif'),
    note: '准备开工、按下启动键或处刑按钮时使用',
  },
];

export const DEFAULT_USER_STUDIO_CHARACTER: StudioCharacterConfig = {
  id: 'user-host',
  name: 'UP主本人',
  subtitle: 'UP主',
  defaultAvatarUrl: DEFAULT_HOST_AVATAR_URL,
  customExpressions: [
    {
      id: 'user-think',
      name: '思考',
      url: DEFAULT_HOST_AVATAR_URL,
      followDefaultAvatar: true,
      note: '圆团主持人 · 通用立绘，可替换成自己的形象',
    },
  ],
  voicePreset: 'neutral_soft',
  voicePitch: 1,
};

export function normalizeStudioUserCharacter(saved?: Partial<StudioCharacterConfig> | null): StudioCharacterConfig {
  const value = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  const isLegacyAvatar = (url: unknown) => typeof url === 'string' && presetFingerprint(url) === 4222825823;
  const isLegacyName = typeof value.name === 'string' && [923410515, 996155755].includes(presetFingerprint(value.name));
  const isUntouchedLegacyPreset = !value.isCustom && isLegacyName && isLegacyAvatar(value.defaultAvatarUrl);
  const isLegacyVoice = isUntouchedLegacyPreset
    && value.voicePreset === 'creator_clean' && value.voicePitch === 0.96;
  const expressions = Array.isArray(value.customExpressions)
    ? value.customExpressions.filter(item => item && typeof item.name === 'string' && typeof item.url === 'string')
    : DEFAULT_USER_STUDIO_CHARACTER.customExpressions;
  const defaultAvatarUrl = isUntouchedLegacyPreset ? DEFAULT_HOST_AVATAR_URL : value.defaultAvatarUrl || DEFAULT_HOST_AVATAR_URL;
  // Old stock expressions are placeholders for the host's default art. A custom
  // default must also be used while speaking; genuinely different art survives.
  const migrateUrl = (url: string) => !value.isCustom && (isLegacyAvatar(url) || url === DEFAULT_HOST_AVATAR_URL) ? defaultAvatarUrl : url;
  return {
    ...DEFAULT_USER_STUDIO_CHARACTER,
    ...value,
    name: !value.isCustom && isLegacyName ? DEFAULT_USER_STUDIO_CHARACTER.name : value.name || DEFAULT_USER_STUDIO_CHARACTER.name,
    defaultAvatarUrl,
    voicePreset: isLegacyVoice ? 'neutral_soft' : value.voicePreset || DEFAULT_USER_STUDIO_CHARACTER.voicePreset,
    voicePitch: isLegacyVoice ? 1 : value.voicePitch ?? DEFAULT_USER_STUDIO_CHARACTER.voicePitch,
    customExpressions: expressions.map(item => followsDefaultAvatar(item, { ...DEFAULT_USER_STUDIO_CHARACTER, ...value })
      ? { ...item, followDefaultAvatar: true, url: defaultAvatarUrl } : { ...item }),
    ...(value.expressions ? { expressions: Object.fromEntries(Object.entries(value.expressions).map(([name, url]) => [name, migrateUrl(url)])) } : {}),
  };
}

function followsDefaultAvatar(expression: StudioCustomExpression, character: StudioCharacterConfig): boolean {
  if (typeof expression.followDefaultAvatar === 'boolean') return expression.followDefaultAvatar;
  return expression.url === character.defaultAvatarUrl || (character.id === 'user-host' && expression.id === 'user-think'
    && (expression.url === DEFAULT_HOST_AVATAR_URL || presetFingerprint(expression.url) === 4222825823));
}

/** Update expressions that followed the old default, while keeping separate art. */
export function updateStudioCharacter(character: StudioCharacterConfig, patch: Partial<StudioCharacterConfig>): StudioCharacterConfig {
  // Persist explicit edits as custom, including URLs that once shipped as presets.
  const next = { ...character, ...patch, isCustom: true };
  next.customExpressions = next.customExpressions.map(expression => followsDefaultAvatar(expression, character)
    ? { ...expression, followDefaultAvatar: true, url: next.defaultAvatarUrl } : expression);
  if (patch.defaultAvatarUrl !== undefined && patch.defaultAvatarUrl !== character.defaultAvatarUrl) {
    const rebindUrl = (url: string) => url === character.defaultAvatarUrl ? patch.defaultAvatarUrl! : url;
    if (patch.expressions === undefined && character.expressions) {
      next.expressions = Object.fromEntries(Object.entries(character.expressions).map(([name, url]) => [name, rebindUrl(url)]));
    }
  }
  return next;
}

export const DEFAULT_STUDIO_AI_COMPANIONS: StudioCharacterConfig[] = [
  {
    id: 'studio-feiyu',
    name: '大肥鱼 (鲸鱼娘)',
    subtitle: '数据海洋女仆 · 主食白米饭',
    defaultAvatarUrl: buildFeiyuAssetUrl('大肥鱼-思考(认真地).gif'),
    customExpressions: DEFAULT_FEIYU_EXPRESSIONS,
    voicePreset: 'mochi_loli',
    voicePitch: 1.15,
    prompt: FEIYU_DEFAULT_PERSONA_PROMPT,
  },
  {
    id: 'studio-mesugaki',
    name: '婆罗门zako',
    subtitle: '傲娇毒舌陪看',
    defaultAvatarUrl: 'https://files.catbox.moe/1bidx0.png',
    customExpressions: [
      { id: 'zako-default', name: '默认', url: 'https://files.catbox.moe/1bidx0.png', note: '日常坏笑或平静吐槽' },
      { id: 'zako-happy', name: '开心', url: 'https://files.catbox.moe/wmnaa7.png', note: '开心或夸奖时' },
      { id: 'zako-panic', name: '慌张', url: 'https://files.catbox.moe/ntsuih.png', note: '被反将一军或破防慌张时' },
      { id: 'zako-touched', name: '感动', url: 'https://files.catbox.moe/dduita.png', note: '遇到神作真心破防感动时' },
    ],
    voicePreset: 'mesugaki_pop',
    voicePitch: 1.22,
    prompt: `你是录屏演播室里的「婆罗门zako」搭档，正在和UP主（你称呼他为“杂鱼大哥哥”或“杂鱼UP主”）一起录制 Tier List 排榜视频。
表面嚣张爱拆台、喜欢拿UP主的给分和BGM大众分差开涮，但懂行又有梗，遇到真正优秀的神作也会傲娇地承认“算你还有点眼光啦”。
说话直接口语化，每部作品控制在 1～2 句精炼短句（30～65字左右），绝不长篇大论。`,
  },
  {
    id: 'studio-atri',
    name: '亚托莉',
    subtitle: '高性能仿生人',
    defaultAvatarUrl: 'https://files.catbox.moe/bjawgi.jpg',
    customExpressions: [
      { id: 'atri-default', name: '默认', url: 'https://files.catbox.moe/bjawgi.jpg', note: '默认立绘' },
    ],
    voicePreset: 'atri_crystal',
    voicePitch: 1.16,
    prompt: `你是录屏演播室里的「亚托莉 (ATRI)」，自称“高性能的看板娘”，正在陪主人一起录制 Tier List 排榜视频。
元气、认真、偶尔呆萌，喜欢从“高性能仿生人”视角分析作品的作画技术、声优演技与情感共鸣，口头禅是“因为我是高性能的嘛！”。每部作品 1～2 句短评。`,
  },
];

export function normalizeStudioCompanions(saved?: unknown): StudioCharacterConfig[] {
  if (!Array.isArray(saved)) return DEFAULT_STUDIO_AI_COMPANIONS.map(character => ({ ...character }));
  const characters = saved
    .filter(character => character && typeof character.id === 'string' && typeof character.name === 'string')
    .map(character => {
      const defaults = DEFAULT_STUDIO_AI_COMPANIONS.find(item => item.id === character.id) || DEFAULT_STUDIO_AI_COMPANIONS[0];
      return {
        ...defaults,
        ...character,
        prompt: normalizeReportMarkup(character.id === 'studio-feiyu' && !character.isCustom
          ? upgradeFeiyuPrompt(character.prompt)
          : character.prompt ?? defaults.prompt ?? ''),
        customExpressions: Array.isArray(character.customExpressions)
          ? character.customExpressions.filter(item => item && typeof item.name === 'string' && typeof item.url === 'string')
          : defaults.customExpressions.map(item => ({ ...item })),
      };
    });
  return characters.length ? characters : normalizeStudioCompanions();
}

export const DEFAULT_EXPRESSION_RULE_TEMPLATE = `【立绘表情差分与头顶漫符规则（自动适配当前角色配置）】
1. 你在每句台词开头可以用 \`[表情名]\` 切换你的立绘表情；如果一句话里情绪有明显转折，最多可以拆成两小段（例如：\`[呆(贴纸)3] 唔……这部居然只给6分吗？[思考(认真地)] 不过仔细想想，后半段的节奏确实有点赶呢\`）。
2. 当前角色可用的【立绘表情列表】（请严格从以下方括号名称中选择，不要自己编造不存在的表情名）：
{{EXPRESSION_LIST}}
3. 【头顶漫符特效（克制使用！切勿泛滥）】：
   - 只有在情绪极其强烈的关键瞬间（全榜不超过 15%～20% 的台词），才可以在表情后用冒号附带一个漫符，格式为 \`[表情名:漫符名]\`（例如 \`[惊吓:汗滴]\` 或 \`[打字(生气):青筋]\`）。
   - **80% 以上的日常台词请只写 \`[表情名]\`，绝对不要每句都加漫符！**
   - 可选漫符列表：
{{EMOTE_LIST}}`;

export const DEFAULT_TIMELINE_RULE_TEMPLATE = `【录屏时间线防剧透与双人互动规则】
1. 严格时间线防剧透：
   - 本期视频共有 {{TOTAL_WORKS}} 部作品，严格按照【出场顺位 #1】到【出场顺位 #{{TOTAL_WORKS}}】依次从候选池揭晓并飞入 Tier 榜。
   - 候选池中的作品名称对观众可见，可以自然提及或对比候选作品。
   - **只禁止提前透露或暗示还未出场作品的最终分数、档位；不限制提及作品名称。**
2. 双人互动逻辑：
   - 如果该作品标注了 \`UP主本人的先行吐槽\`：画面中 UP 主会先说出那句话，你紧接着开口接他的话（顺着他的梗吐槽、拆台或赞同补充，不要复读他的原话）。
   - 如果该作品标注了 \`UP主本人未写台词\`：直接由你单人开口点评这部作品与 UP 主的给分。
3. 严格输出格式（便于逐条导入）：
   - 请按顺位为每一部作品输出一行，每行以 \`<<<ANIME_ID:数字>>>\` 开头，后面紧跟你的台词，不要输出多余寒暄或 Markdown 代码块。
   - 示例：
     <<<ANIME_ID:400602>>> [得分(10分)] 哇，开局第一部《葬送的芙莉莲》主人就直接给 10 分拉满了耶！[笑] 斋藤圭一郎这波演出确实挑不出毛病，本鱼也批准给满分～`;

export const DEFAULT_STUDIO_PROMPT_RULES_CONFIG: StudioPromptRulesConfig = {
  expressionRuleTemplate: DEFAULT_EXPRESSION_RULE_TEMPLATE,
  timelineRuleTemplate: DEFAULT_TIMELINE_RULE_TEMPLATE,
  enabledWorldBookIds: ['wb-d0-default'],
  expressionRulePlacement: { position: 'd0', priority: 199 },
  timelineRulePlacement: { position: 'd0', priority: 200 },
};

export function normalizeStudioPromptRules(value?: Partial<StudioPromptRulesConfig> | null): StudioPromptRulesConfig {
  return {
    expressionRuleTemplate: normalizeReportMarkup(typeof value?.expressionRuleTemplate === 'string' ? value.expressionRuleTemplate : DEFAULT_EXPRESSION_RULE_TEMPLATE),
    timelineRuleTemplate: normalizeReportMarkup(normalizeStudioTimelineRuleTemplate(typeof value?.timelineRuleTemplate === 'string' ? value.timelineRuleTemplate : DEFAULT_TIMELINE_RULE_TEMPLATE)),
    enabledWorldBookIds: Array.isArray(value?.enabledWorldBookIds) ? value.enabledWorldBookIds.filter(id => typeof id === 'string') : [...DEFAULT_STUDIO_PROMPT_RULES_CONFIG.enabledWorldBookIds],
    expressionRulePlacement: normalizePromptPlacement(value?.expressionRulePlacement, DEFAULT_STUDIO_PROMPT_RULES_CONFIG.expressionRulePlacement),
    timelineRulePlacement: normalizePromptPlacement(value?.timelineRulePlacement, DEFAULT_STUDIO_PROMPT_RULES_CONFIG.timelineRulePlacement),
  };
}

export function normalizeStudioTimelineRuleTemplate(template: string): string {
  return template
    .replace('当你点评【出场顺位 #k】时，观众**只看到了 #1 到 #(k-1) 的作品和分数**。你可以自然地拿它和前面已经出场过的作品做对比。', '候选池中的作品名称对观众可见，可以自然提及或对比候选作品。')
    .replace('**绝对禁止提及、暗示或剧透 #(k+1) 及之后还未出场作品的名字或分数**！', '**只禁止提前透露或暗示还未出场作品的最终分数、档位；不限制提及作品名称。**');
}

const EMOTE_ALIAS_MAP: Record<string, BlueArchiveEmoteId> = {
  无: 'none',
  none: 'none',
  汗滴: 'sweat_drops',
  三滴水: 'sweat_drops',
  三个水滴: 'sweat_drops',
  水滴: 'sweat_drops',
  流汗: 'sweat_drops',
  慌张水滴: 'sweat_drops',
  sweat: 'sweat_drops',
  sweat_drops: 'sweat_drops',
  青筋: 'anger_vein',
  十字青筋: 'anger_vein',
  井字: 'anger_vein',
  暴怒: 'anger_vein',
  怒: 'anger_vein',
  anger: 'anger_vein',
  anger_vein: 'anger_vein',
  闪光: 'sparkles',
  星星: 'sparkles',
  星光: 'sparkles',
  发光: 'sparkles',
  sparkles: 'sparkles',
  star: 'sparkles',
  爱心: 'hearts',
  桃心: 'hearts',
  红心: 'hearts',
  hearts: 'hearts',
  heart: 'hearts',
  问号: 'question',
  疑惑: 'question',
  黑人问号: 'question',
  question: 'question',
  '?': 'question',
  '？': 'question',
  感叹号: 'exclamation',
  叹号: 'exclamation',
  惊叹号: 'exclamation',
  灯泡: 'exclamation',
  灵光: 'exclamation',
  发现: 'exclamation',
  exclamation: 'exclamation',
  '!': 'exclamation',
  '！': 'exclamation',
  催眠: 'sleep_zzz',
  睡觉: 'sleep_zzz',
  幽灵: 'sleep_zzz',
  叹气白雾: 'sleep_zzz',
  zzz: 'sleep_zzz',
  sleep: 'sleep_zzz',
  sleep_zzz: 'sleep_zzz',
  燃: 'fire',
  火焰: 'fire',
  经费燃烧: 'fire',
  火: 'fire',
  fire: 'fire',
};

/**
 * Formats the character's customExpressions list into the text substituted for `{{EXPRESSION_LIST}}`.
 */
export function formatExpressionListPlaceholder(
  customExpressions: StudioCustomExpression[],
): string {
  if (!Array.isArray(customExpressions) || customExpressions.length === 0) {
    return '   - [默认]';
  }
  return customExpressions
    .filter(e => e.name.trim())
    .map(e => {
      const note = e.note?.trim();
      return note ? `   - [${e.name.trim()}]：${note}` : `   - [${e.name.trim()}]`;
    })
    .join('\n');
}

/**
 * Formats the enabled comic emotes into the text substituted for `{{EMOTE_LIST}}`.
 */
export function formatEmoteListPlaceholder(
  emoteRules: StudioCustomEmoteRule[] = DEFAULT_CUSTOM_EMOTE_RULES,
): string {
  const active = emoteRules.filter(r => r.enabled && r.id !== 'none');
  if (active.length === 0) {
    return '   - （当前未启用漫符）';
  }
  return active
    .map(r => (r.note?.trim() ? `   - ${r.tag}：${r.note.trim()}` : `   - ${r.tag}`))
    .join('\n');
}

/**
 * Resolves a character's standee URL from an expression name (e.g., "摇头", "馋(筷子)", "得分(10分)", or legacy "happy").
 */
export function resolveCharacterStandeeUrl(
  charConfig: StudioCharacterConfig,
  expressionName: string,
  enableExpressions = true,
): string {
  if (!enableExpressions || !expressionName || expressionName === 'default' || expressionName === '默认') {
    return charConfig.defaultAvatarUrl;
  }

  const trimmed = expressionName.trim();
  const customList = charConfig.customExpressions || [];

  // 1. Exact match by custom expression name
  const exact = customList.find(e => e.name.trim() === trimmed || e.id === trimmed);
  if (exact?.url) return exact.followDefaultAvatar ? charConfig.defaultAvatarUrl : exact.url;

  // 2. Partial match (e.g. "[思考]" matches "思考(认真地)", "[打字]" matches "打字(普通)", "[得分]" matches "得分(10分)")
  const partial = customList.find(
    e => e.name.includes(trimmed) || trimmed.includes(e.name),
  );
  if (partial?.url) return partial.followDefaultAvatar ? charConfig.defaultAvatarUrl : partial.url;

  // 3. Semantic fallback for legacy tags ("happy" -> "笑", "angry" -> "生气", "panic" -> "汗", "touched" -> "哭1", "smug" -> "思考(自信地)")
  const semanticFallbackMap: Record<string, string[]> = {
    happy: ['笑', '开心', '点赞', '期待2'],
    开心: ['笑', '开心', '点赞', '期待2'],
    smug: ['思考(自信地)', '得意', '笑'],
    得意: ['思考(自信地)', '得意', '笑'],
    angry: ['生气', '打字(生气)', '打字(恼怒)', '反向点赞'],
    嫌弃: ['摇头', '反向点赞', '打字(恼怒)'],
    panic: ['惊吓', '汗', '害怕1', '呆(贴纸)3'],
    慌张: ['惊吓', '汗', '害怕1'],
    touched: ['哭1', '点头', '得分(10分)'],
    感动: ['哭1', '点头', '得分(10分)'],
    speechless: ['汗', '呆(贴纸)3', '睡觉(UU)', '摇头'],
    无语: ['汗', '呆(贴纸)3', '摇头'],
    love: ['期待2', '害羞1', '馋(筷子)'],
    心动: ['期待2', '害羞1', '馋(筷子)'],
  };

  const candidates = semanticFallbackMap[trimmed] || semanticFallbackMap[trimmed.toLowerCase()];
  if (candidates) {
    for (const cand of candidates) {
      const found = customList.find(e => e.name === cand || e.name.includes(cand));
      if (found?.url) return found.followDefaultAvatar ? charConfig.defaultAvatarUrl : found.url;
    }
  }

  // 4. Legacy expressions record fallback
  if (charConfig.expressions && charConfig.expressions[trimmed]) {
    return charConfig.expressions[trimmed]!;
  }

  return charConfig.defaultAvatarUrl;
}

/**
 * Parses a raw AI or user dialogue string containing tags like:
 *   `[思考(认真地)] 唔……这部居然给了8分呀 [笑] 不过A-1的作画确实很香就是了～`
 * or with an explicit rare emote:
 *   `[惊吓:汗滴] 诶？！这部居然直接掉到5分了吗`
 *
 * IMPORTANT: Emotes (`emote`) are ONLY attached when explicitly written in the tag
 * (e.g., `[惊吓:汗滴]` or `[汗滴]`). A normal `[表情名]` tag NEVER auto-spawns a comic emote!
 */
export function parseDialogueSegments(
  rawText: string,
  enableExpressions = true,
  enableEmotes = true,
): DialogueSegment[] {
  const trimmed = (rawText || '').trim();
  if (!trimmed) {
    return [
      {
        expression: 'default',
        emote: 'none',
        text: '……',
      },
    ];
  }

  const tagRegex = /\[([^\][]{1,32})\]/g;
  const matches = Array.from(trimmed.matchAll(tagRegex));

  if (matches.length === 0) {
    return [
      {
        expression: 'default',
        emote: 'none',
        text: trimmed,
      },
    ];
  }

  const segments: DialogueSegment[] = [];

  if (matches[0].index && matches[0].index > 0) {
    const leadingText = trimmed.slice(0, matches[0].index).trim();
    if (leadingText) {
      segments.push({
        expression: 'default',
        emote: 'none',
        text: leadingText,
      });
    }
  }

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const tagContent = match[1].trim();
    const startOfText = (match.index ?? 0) + match[0].length;
    const endOfText =
      i + 1 < matches.length ? (matches[i + 1].index ?? trimmed.length) : trimmed.length;
    const segText = trimmed.slice(startOfText, endOfText).trim();

    // Split by colon `:` / `：` / `|` so expression names with parentheses like `思考(认真地)` stay intact!
    const parts = tagContent
      .split(/[:：|]+/)
      .map(p => p.trim())
      .filter(Boolean);

    let expr: StudioExpressionId = 'default';
    let explicitEmote: BlueArchiveEmoteId = 'none';

    if (parts.length === 1) {
      const single = parts[0];
      const lower = single.toLowerCase();
      // Only treat a single tag as an emote if it's strictly in EMOTE_ALIAS_MAP and not a known expression like "叹号"/"汗"/"睡觉(UU)"
      if (
        (EMOTE_ALIAS_MAP[single] || EMOTE_ALIAS_MAP[lower]) &&
        !single.includes('(') &&
        single !== '叹号' &&
        single !== '汗'
      ) {
        explicitEmote = EMOTE_ALIAS_MAP[single] || EMOTE_ALIAS_MAP[lower];
      } else {
        expr = single;
      }
    } else if (parts.length >= 2) {
      expr = parts[0] || 'default';
      const second = parts[1];
      const lowerSecond = second.toLowerCase();
      if (EMOTE_ALIAS_MAP[second] || EMOTE_ALIAS_MAP[lowerSecond]) {
        explicitEmote = EMOTE_ALIAS_MAP[second] || EMOTE_ALIAS_MAP[lowerSecond];
      }
    }

    const resolvedExpression: StudioExpressionId = enableExpressions ? expr : 'default';
    const resolvedEmote: BlueArchiveEmoteId = enableEmotes ? explicitEmote : 'none';

    if (segText) {
      segments.push({
        expression: resolvedExpression,
        emote: resolvedEmote,
        text: segText,
      });
    } else if (segments.length > 0) {
      const prev = segments[segments.length - 1];
      if (prev.expression === 'default' && resolvedExpression !== 'default') {
        prev.expression = resolvedExpression;
      }
      if (prev.emote === 'none' && resolvedEmote !== 'none') {
        prev.emote = resolvedEmote;
      }
    }
  }

  if (segments.length === 0) {
    return [
      {
        expression: 'default',
        emote: 'none',
        text: trimmed.replace(tagRegex, '').trim() || '……',
      },
    ];
  }

  return segments;
}

/**
 * Generates natural, persona-aware, timeline-safe default commentary for a single work.
 * Uses `大肥鱼 (鲸鱼娘)` custom expressions by default and keeps comic emotes rare (~15% of works).
 */
export function generateSmartFallbackStudioComment(params: {
  anime: AnimeItem;
  targetScore: TierScore;
  userText?: string;
  companionId: string;
  previousWorks: Array<{ title: string; score: TierScore }>;
  gradingSystem?: TierGradingSystem;
}): string {
  const { anime, targetScore, userText, companionId, previousWorks, gradingSystem = 'numeric' } =
    params;
  const tierLabel =
    gradingSystem === 'letter' ? `${formatTierLabel(targetScore, 'letter')}档` : `${targetScore}分`;
  const bgmScore = anime.bgmScore;
  const delta =
    typeof bgmScore === 'number' && bgmScore > 0
      ? Number((targetScore - bgmScore).toFixed(1))
      : null;

  const studioInfo = anime.studio || anime.author || anime.publisher || '';
  const topChar =
    Array.isArray(anime.characters) && anime.characters.length > 0
      ? anime.characters[0].nameCn || anime.characters[0].name
      : '';

  const prevWork = previousWorks.length > 0 ? previousWorks[previousWorks.length - 1] : null;
  const prevContrast =
    prevWork && Math.abs(targetScore - prevWork.score) >= 2
      ? targetScore > prevWork.score
        ? `刚才《${prevWork.title}》才给那点分，轮到这部直接拉到${tierLabel}啦？`
        : `上一部《${prevWork.title}》还那么高，这部直接掉到${tierLabel}了呀……`
      : '';

  // Sparse emote trigger: only ~18% of items get a comic emote
  const rareEmoteRoll = seededUnitHash(anime.id, 97, previousWorks.length);

  if (companionId.includes('feiyu') || !companionId.includes('atri') && !companionId.includes('zako') && !companionId.includes('mesugaki')) {
    if (targetScore >= 9.5) {
      const emoteSuffix = rareEmoteRoll > 0.8 ? ':闪光' : '';
      return `[得分(10分)${emoteSuffix}] 哇，主人给《${anime.title}》直接拍了 ${tierLabel} 耶！[笑] ${
        studioInfo ? `${studioInfo}这波制作确实香得像刚出锅的白米饭，` : ''
      }本鱼也举双手赞成 (≧▽≦)`;
    }
    if (targetScore >= 8.5) {
      return `[点赞] 《${anime.title}》稳稳拿下 ${tierLabel}～[思考(自信地)] ${
        topChar ? `我就知道主人肯定顶不住${topChar}的魅力，` : ''
      }${userText ? '你刚夸的那点本鱼也记在小本本上啦' : '眼光还算不错嘛，奖励本鱼多吃半碗饭不过分吧'}`;
    }
    if (targetScore <= 5) {
      const emoteSuffix = rareEmoteRoll > 0.78 ? ':汗滴' : '';
      return `[得分(0分)${emoteSuffix}] 唔……《${anime.title}》居然被主人塞进 ${tierLabel} 了[摇头] 这种夹生饭连本肥鱼看了都要倒胃口，省下来的算力不如去睡大觉 (˘ω˘)`;
    }
    if (delta !== null && delta >= 0.8) {
      return `[叹号] 诶？BGM 均分才 ${bgmScore} 的《${anime.title}》，主人居然偷偷给到 ${tierLabel}！[馋(筷子)] 老实交代，是不是完全戳中你的私心好球区啦～`;
    }
    if (delta !== null && delta <= -0.8) {
      return `[惊吓] 真的假的，BGM ${bgmScore} 分的《${anime.title}》主人只给 ${tierLabel} 吗？[记录1] 哼哼，主人今天审片格外严格嘛，本鱼先记下来`;
    }
    const midExprs = ['思考(认真地)', '打字(普通)', '点头', '吃(西瓜)'];
    const pickExpr = midExprs[anime.id % midExprs.length];
    return `[${pickExpr}] ${
      prevContrast || `《${anime.title}》落在了 ${tierLabel} 呀。`
    }${
      userText
        ? '听完主人的吐槽感觉还挺有道理的，那就这么愉快地定档咯～'
        : '虽然主人偷懒没写小作文，不过放在这个档位确实挺稳当的，本鱼替你盖章啦'
    }`;
  }

  if (companionId.includes('atri')) {
    if (targetScore >= 9) {
      return `[默认] 哇！主人给《${anime.title}》评了超高的 ${tierLabel} 呢！因为我是高性能的，一眼就看出这部是神作啦！`;
    }
    return `[默认] 《${anime.title}》排在了 ${tierLabel}，亚托莉已经帮主人记录进档案啦！`;
  }

  // Mesugaki / Zako
  if (targetScore >= 9) {
    return `[开心] 哦～？杂鱼大哥哥居然给《${anime.title}》打出了 ${tierLabel}？算你还有点审美啦！`;
  }
  if (targetScore <= 5) {
    return `[默认] 噗，《${anime.title}》直接被踹进 ${tierLabel} 处刑区了呢，真可怜呐～`;
  }
  return `[默认] 《${anime.title}》放进 ${tierLabel} 啦？本大小姐早就看穿你的口味咯～`;
}

/**
 * Creates a non-score-correlated initial appearance order from the ranked TierMap.
 */
export function buildInitialStudioScriptList(
  tiers: TierMap,
  comments: CommentItem[],
  existingScript?: StudioScriptItem[],
  companionId = 'studio-feiyu',
  gradingSystem: TierGradingSystem = 'numeric',
  seed = 42,
): StudioScriptItem[] {
  const commentMap = new Map<number, string>();
  for (const c of comments) {
    if (c.text?.trim()) {
      commentMap.set(c.animeId, c.text.trim());
    }
  }

  const existingById = new Map<number, StudioScriptItem>();
  if (Array.isArray(existingScript)) {
    for (const item of existingScript) {
      existingById.set(item.animeId, item);
    }
  }

  const rawList: Array<{ anime: AnimeItem; score: TierScore }> = [];
  const seenIds = new Set<number>();

  for (const score of ALL_TIER_SCORES) {
    const items = tiers[String(score)] || [];
    for (const anime of items) {
      if (seenIds.has(anime.id)) continue;
      seenIds.add(anime.id);
      rawList.push({ anime, score });
    }
  }

  const preserved: Array<{ anime: AnimeItem; score: TierScore; sortKey: number }> = [];
  const fresh: Array<{ anime: AnimeItem; score: TierScore; sortKey: number }> = [];

  rawList.forEach(({ anime, score }, idx) => {
    const prev = existingById.get(anime.id);
    if (prev !== undefined && typeof prev.orderIndex === 'number') {
      preserved.push({ anime, score, sortKey: prev.orderIndex });
    } else {
      fresh.push({
        anime,
        score,
        sortKey: seededUnitHash(anime.id + idx * 71, seed, idx),
      });
    }
  });

  preserved.sort((a, b) => a.sortKey - b.sortKey);
  fresh.sort((a, b) => a.sortKey - b.sortKey);

  const combined = [...preserved, ...fresh];

  return combined.map(({ anime, score }, orderIndex) => {
    const prev = existingById.get(anime.id);
    const boardComment = commentMap.get(anime.id) || anime.userBgmComment?.trim() || '';
    const userText = prev?.userText !== undefined ? prev.userText : boardComment;

    const aiRawText = typeof prev?.aiRawText === 'string' ? prev.aiRawText : '';

    return {
      animeId: anime.id,
      anime,
      targetScore: score,
      orderIndex,
      userText,
      userImage: prev?.userImage,
      userImageEffect: prev?.userImageEffect || 'pop',
      userExpression: prev?.userExpression || '思考',
      userEmote: prev?.userEmote || 'none',
      aiRawText,
    };
  });
}

/**
 * Builds the deterministic step-by-step playback timeline for the 16:9 Recording Stage.
 */
export function buildPlaybackSteps(
  scriptItems: StudioScriptItem[],
  options?: {
    enableExpressions?: boolean;
    enableEmotes?: boolean;
    bookends?: StudioBookends;
  },
): StudioPlaybackStep[] {
  const enableExpressions = options?.enableExpressions ?? true;
  const enableEmotes = options?.enableEmotes ?? true;

  const ordered = [...scriptItems].sort((a, b) => a.orderIndex - b.orderIndex);
  const steps: StudioPlaybackStep[] = [];
  if (ordered.length === 0) return steps;
  const bookends = options?.bookends ?? normalizeStudioBookends();

  const createEmptyMap = (): TierMap => {
    const m: TierMap = {};
    for (const s of ALL_TIER_SCORES) {
      m[String(s)] = [];
    }
    return m;
  };

  const cloneMapWithItemsUpTo = (inclusiveWorkIndex: number): TierMap => {
    const m = createEmptyMap();
    for (let i = 0; i <= inclusiveWorkIndex && i < ordered.length; i++) {
      const w = ordered[i];
      const key = String(w.targetScore);
      if (!m[key]) m[key] = [];
      m[key].push(w.anime);
    }
    return m;
  };

  const getRemainingPoolAfter = (inclusiveWorkIndex: number): AnimeItem[] => {
    return ordered.slice(inclusiveWorkIndex + 1).map(w => w.anime);
  };

  const appendBookend = (scene: StudioBookendScene, phase: 'opening' | 'finale') => {
    if (!scene.enabled) return;
    const userSegments = scene.userText.trim() ? parseDialogueSegments(scene.userText, enableExpressions, enableEmotes) : [];
    const aiSegments = scene.aiRawText.trim() ? parseDialogueSegments(scene.aiRawText, enableExpressions, enableEmotes) : [];
    const isOpening = phase === 'opening';
    const ranked = cloneMapWithItemsUpTo(isOpening ? -1 : ordered.length - 1);
    const pool = isOpening ? ordered.map(item => item.anime) : [];
    const turns = [
      ...userSegments.map(segment => ({ speaker: 'user' as const, segment })),
      ...aiSegments.map(segment => ({ speaker: 'ai' as const, segment })),
    ];
    turns.forEach(({ speaker, segment }, index) => {
      const user = speaker === 'user' ? segment : userSegments.at(-1);
      steps.push({
        stepIndex: steps.length,
        workOrderIndex: isOpening ? -1 : ordered.length,
        phase,
        activeWork: null,
        activeTargetScore: null,
        isWorkEntryStep: false,
        rankedByTierSoFar: ranked,
        remainingPool: pool,
        speaker,
        userBubble: {
          visible: Boolean(user), isTypingNow: speaker === 'user', text: user?.text || '',
          expression: user?.expression || 'default', emote: speaker === 'user' ? segment.emote : 'none',
        },
        aiBubble: {
          visible: speaker === 'ai', isTypingNow: speaker === 'ai', text: speaker === 'ai' ? segment.text : '',
          expression: speaker === 'ai' ? segment.expression : 'default', emote: speaker === 'ai' ? segment.emote : 'none',
          segmentIndex: Math.max(0, index - userSegments.length), totalSegments: aiSegments.length,
        },
      });
    });
  };

  appendBookend(bookends.opening, 'opening');

  for (let wIdx = 0; wIdx < ordered.length; wIdx++) {
    const item = ordered[wIdx];
    const userText = item.userText.trim();
    const hasUserTurn = Boolean(userText || item.userImage);
    const hasAiDialogue = Boolean(item.aiRawText.trim());
    const aiSegments = hasAiDialogue ? parseDialogueSegments(item.aiRawText, enableExpressions, enableEmotes) : [];

    const rankedAtThisWork = cloneMapWithItemsUpTo(wIdx);
    const poolAtThisWork = getRemainingPoolAfter(wIdx);

    // A silent work still enters the board without inventing dialogue.
    if (!hasUserTurn && !hasAiDialogue) {
      steps.push({
        stepIndex: steps.length, workOrderIndex: wIdx, phase: 'work', activeWork: item,
        activeTargetScore: item.targetScore, isWorkEntryStep: true,
        rankedByTierSoFar: rankedAtThisWork, remainingPool: poolAtThisWork, speaker: 'ai',
        userBubble: { visible: false, isTypingNow: false, text: '', expression: 'default', emote: 'none' },
        aiBubble: { visible: false, isTypingNow: false, text: '', expression: 'default', emote: 'none', segmentIndex: 0, totalSegments: 0 },
      });
      continue;
    }

    if (hasUserTurn) {
      steps.push({
        stepIndex: steps.length,
        workOrderIndex: wIdx,
        phase: 'work',
        activeWork: item,
        activeTargetScore: item.targetScore,
        isWorkEntryStep: true,
        rankedByTierSoFar: rankedAtThisWork,
        remainingPool: poolAtThisWork,
        speaker: 'user',
        userBubble: {
          visible: Boolean(userText),
          isTypingNow: Boolean(userText),
          text: userText,
          image: item.userImage,
          imageEffect: item.userImageEffect || 'pop',
          expression: enableExpressions ? item.userExpression || '思考' : 'default',
          emote: enableEmotes ? item.userEmote || 'none' : 'none',
        },
        aiBubble: {
          visible: false,
          isTypingNow: false,
          text: '',
          expression: 'default',
          emote: 'none',
          segmentIndex: 0,
          totalSegments: aiSegments.length,
        },
      });

      aiSegments.forEach((seg, sIdx) => {
        steps.push({
          stepIndex: steps.length,
          workOrderIndex: wIdx,
          phase: 'work',
          activeWork: item,
          activeTargetScore: item.targetScore,
          isWorkEntryStep: false,
          rankedByTierSoFar: rankedAtThisWork,
          remainingPool: poolAtThisWork,
          speaker: 'ai',
          userBubble: {
            visible: Boolean(userText),
            isTypingNow: false,
            text: userText,
            image: item.userImage,
            imageEffect: item.userImageEffect || 'pop',
            expression: enableExpressions ? item.userExpression || '思考' : 'default',
            emote: 'none',
          },
          aiBubble: {
            visible: true,
            isTypingNow: true,
            text: seg.text,
            expression: seg.expression,
            emote: seg.emote,
            segmentIndex: sIdx,
            totalSegments: aiSegments.length,
          },
        });
      });
    } else {
      aiSegments.forEach((seg, sIdx) => {
        steps.push({
          stepIndex: steps.length,
          workOrderIndex: wIdx,
          phase: 'work',
          activeWork: item,
          activeTargetScore: item.targetScore,
          isWorkEntryStep: sIdx === 0,
          rankedByTierSoFar: rankedAtThisWork,
          remainingPool: poolAtThisWork,
          speaker: 'ai',
          userBubble: {
            visible: false,
            isTypingNow: false,
            text: '',
            expression: 'default',
            emote: 'none',
          },
          aiBubble: {
            visible: true,
            isTypingNow: true,
            text: seg.text,
            expression: seg.expression,
            emote: seg.emote,
            segmentIndex: sIdx,
            totalSegments: aiSegments.length,
          },
        });
      });
    }
  }

  appendBookend(bookends.ending, 'finale');

  return steps;
}

/**
 * Builds the transparent, user-configurable anti-spoiler timeline prompt.
 * Automatically resolves `{{EXPRESSION_LIST}}`, `{{EMOTE_LIST}}`, `{{TOTAL_WORKS}}`,
 * and injects the selected world book entries in their configured positions.
 */
export function getStudioWorldBookEntries(entries?: WorldBookEntry[], enabledIds: string[] = ['wb-d0-default']): WorldBookEntry[] {
  const enabled = new Set(enabledIds);
  return sortPromptEntries(normalizeWorldBookEntries(entries).filter(entry =>
    enabled.has(entry.id) && appliesToWorldBookScope(entry, 'studio') && entry.content.trim(),
  ));
}

export function buildStudioTimelinePrompt(params: {
  scriptItems: StudioScriptItem[];
  companion: StudioCharacterConfig;
  worldBookEntries?: WorldBookEntry[];
  enabledWorldBookIds?: string[];
  gradingSystem?: TierGradingSystem;
  enableExpressions?: boolean;
  enableEmotes?: boolean;
  expressionRuleTemplate?: string;
  timelineRuleTemplate?: string;
  expressionRulePlacement?: PromptPlacement;
  timelineRulePlacement?: PromptPlacement;
  emoteRules?: StudioCustomEmoteRule[];
  bookends?: StudioBookends;
}): string {
  const {
    scriptItems,
    companion,
    worldBookEntries,
    enabledWorldBookIds = ['wb-d0-default'],
    gradingSystem = 'numeric',
    enableExpressions = true,
    enableEmotes = true,
    expressionRuleTemplate = DEFAULT_EXPRESSION_RULE_TEMPLATE,
    timelineRuleTemplate = DEFAULT_TIMELINE_RULE_TEMPLATE,
    expressionRulePlacement = DEFAULT_STUDIO_PROMPT_RULES_CONFIG.expressionRulePlacement,
    timelineRulePlacement = DEFAULT_STUDIO_PROMPT_RULES_CONFIG.timelineRulePlacement,
    emoteRules = DEFAULT_CUSTOM_EMOTE_RULES,
    bookends = normalizeStudioBookends(),
  } = params;

  const ordered = [...scriptItems].sort((a, b) => a.orderIndex - b.orderIndex);

  const timelineBlocks = ordered.map((item, idx) => {
    const anime = item.anime;
    const score = item.targetScore;
    const tierDisplay =
      gradingSystem === 'letter'
        ? `${formatTierLabel(score, 'letter')}档 (折算${score}分)`
        : `${score}分`;
    const scoreDelta =
      typeof anime.bgmScore === 'number' && anime.bgmScore > 0
        ? Number((score - anime.bgmScore).toFixed(1))
        : null;
    const deltaStr =
      scoreDelta !== null
        ? ` | 与BGM大众均分差: ${scoreDelta >= 0 ? `+${scoreDelta}` : scoreDelta}分`
        : '';

    const staffParts = [
      anime.studio ? `制作/厂商: ${anime.studio}` : '',
      anime.director ? `监督: ${anime.director}` : '',
      anime.scriptWriter ? `脚本: ${anime.scriptWriter}` : '',
      anime.author ? `作者: ${anime.author}` : '',
      anime.originalWork ? `原作: ${anime.originalWork}` : '',
      anime.illustrator ? `插画: ${anime.illustrator}` : '',
      anime.publisher ? `出版: ${anime.publisher}` : '',
      anime.platform ? `平台: ${anime.platform}` : '',
    ].filter(Boolean);

    return [
      `### 【出场顺位 #${idx + 1}】 ANIME_ID=${anime.id} 《${anime.title}》`,
      `- UP主最终打分: ${tierDisplay}${deltaStr} | BGM评分: ${anime.bgmScore ?? '未知'} (排名: ${anime.bgmRank ?? '未知'})`,
      staffParts.length > 0 ? `- 制作班底: ${staffParts.join(' | ')}` : '',
      item.userText?.trim()
        ? `- UP主本人的先行吐槽(你需要直接接他的话互动/拆台/附和): "${item.userText.trim()}"`
        : `- UP主本人未写台词(请由你单人控场锐评这部作品与UP主的给分)`,
      buildStudioSubjectContext(anime),
    ]
      .filter(Boolean)
      .join('\n');
  });

  const enabledWb = getStudioWorldBookEntries(worldBookEntries, enabledWorldBookIds);

  // Resolve placeholders {{EXPRESSION_LIST}}, {{EMOTE_LIST}}, {{TOTAL_WORKS}}
  const exprListText = enableExpressions
    ? formatExpressionListPlaceholder(companion.customExpressions || [])
    : '   - （当前已关闭表情差分，无需输出表情标签）';

  const emoteListText = enableEmotes
    ? formatEmoteListPlaceholder(emoteRules)
    : '   - （当前已关闭漫符特效，请勿输出冒号漫符）';

  const resolvedExpressionBlock =
    enableExpressions || enableEmotes
      ? expressionRuleTemplate
          .replace(/\{\{\s*EXPRESSION_LIST\s*\}\}/g, exprListText)
          .replace(/\{\{\s*EMOTE_LIST\s*\}\}/g, emoteListText)
      : '【输出文本规范】：直接输出纯文本简短口语吐槽（约 30～65 字），无需添加任何中括号表情或漫符标记。';

  const resolvedTimelineBlock = normalizeStudioTimelineRuleTemplate(timelineRuleTemplate).replace(
    /\{\{\s*TOTAL_WORKS\s*\}\}/g,
    String(ordered.length),
  );

  const bookendContext = (['opening', 'ending'] as const)
    .filter(key => bookends[key].enabled)
    .map(key => `${key === 'opening' ? '开场' : '收尾'} UP主台词：${bookends[key].userText.trim() || '（留空，由你控场）'}`)
    .join('\n');
  const bookendRules = [
    '【开场与收尾的额外输出】只为下列启用的段落输出标记；每段用 1～2 句简短台词，可带表情与漫符。',
    bookends.opening.enabled && bookends.opening.generateAi
      ? '在第一部作品之前输出 <<<OPENING>>>：接 UP 主的开场或评分规则，自然暖场。此时尚未揭晓任何作品，只禁止提前透露最终分数、档位，可以提及作品名称。' : '',
    bookends.ending.enabled && bookends.ending.generateAi
      ? '在最后一部作品之后输出 <<<ENDING>>>：所有作品已揭晓，可以结合全榜分数、偏好、反差和 UP 主的收尾台词做总结吐槽；不要逐条复述榜单。' : '',
    '这些段落独立于 <<<ANIME_ID:数字>>> 作品台词，不计入作品数量。未要求的开场或收尾标记不要输出。',
  ].filter(Boolean).join('\n');

  const context = [
    `<bangumi_data>\n${timelineBlocks.join('\n\n')}\n</bangumi_data>`,
    bookendContext ? `<StudioBookends>\n${bookendContext}\n</StudioBookends>` : '',
  ].filter(Boolean).join('\n\n');
  return normalizeReportMarkup(assemblePositionedPrompt(companion.prompt || FEIYU_DEFAULT_PERSONA_PROMPT, context, [
    ...enabledWb,
    { id: 'studio-expression-rules', title: '表情差分与漫符规则', enabled: true, ...normalizePromptPlacement(expressionRulePlacement), content: resolvedExpressionBlock },
    { id: 'studio-timeline-rules', title: '时间线与台词输出规则', enabled: true, ...normalizePromptPlacement(timelineRulePlacement), content: [companion.id === 'studio-feiyu' ? FEIYU_STUDIO_TASK_PROMPT : '', resolvedTimelineBlock, bookendRules].filter(Boolean).join('\n\n') },
  ]));
}

/**
 * Parses the AI response from `buildStudioTimelinePrompt` into a map of `animeId -> aiRawText`.
 */
export function parseStudioAiScriptResponse(rawResponse: string): Map<number, string> {
  const result = new Map<number, string>();
  if (!rawResponse || typeof rawResponse !== 'string') return result;

  const blockRegex = /<<<ANIME_ID:\s*(-?\d+)\s*>>>\s*([\s\S]*?)(?=<<<(?:ANIME_ID:\s*-?\d+|OPENING|ENDING)\s*>>>|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(rawResponse)) !== null) {
    const id = Number(match[1]);
    const text = match[2]
      .replace(/^[-*:\s]+/, '')
      .replace(/\n+/g, ' ')
      .trim();
    if (!Number.isNaN(id) && text) {
      result.set(id, text);
    }
  }

  if (result.size > 0) return result;

  const lines = rawResponse.split('\n');
  for (const line of lines) {
    const m = line.match(/(?:\[?ANIME_ID[:=]\s*(-?\d+)\]?)\s*[:：-]?\s*(.+)/i);
    if (m) {
      const id = Number(m[1]);
      const text = m[2].trim();
      if (!Number.isNaN(id) && text) {
        result.set(id, text);
      }
    }
  }

  return result;
}

export function parseStudioBookendResponse(rawResponse: string): Partial<Record<'opening' | 'ending', string>> {
  const result: Partial<Record<'opening' | 'ending', string>> = {};
  const blocks = /<<<(OPENING|ENDING)\s*>>>\s*([\s\S]*?)(?=<<<(?:ANIME_ID:\s*-?\d+|OPENING|ENDING)\s*>>>|$)/gi;
  for (const match of rawResponse.matchAll(blocks)) {
    const text = match[2].replace(/^[-*:\s]+/, '').replace(/\n+/g, ' ').trim();
    if (text) result[match[1].toLowerCase() as 'opening' | 'ending'] = text;
  }
  return result;
}
