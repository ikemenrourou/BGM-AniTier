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
  ATRI_AVATAR_URL,
  formatTierLabel,
  LEGACY_ATRI_AVATAR_URL,
  normalizeWorldBookEntries,
  seededUnitHash,
} from './tierLogic';
import { buildStudioSubjectContext } from './studioContext';
import { buildFeiyuAssetUrl, FEIYU_STUDIO_PERSONA_PROMPT, FEIYU_STUDIO_TASK_PROMPT, upgradeFeiyuStudioPrompt } from './feiyuPersona';
import { DEFAULT_HOST_AVATAR_URL } from './studioHostAvatar';
import { presetFingerprint } from './presetFingerprint';
import { normalizeReportMarkup } from './reportMarkup';
import { appliesToWorldBookScope, assemblePositionedPrompt, normalizePromptPlacement, sortPromptEntries } from './promptOrder';

export { buildFeiyuAssetUrl, FEIYU_STUDIO_PERSONA_PROMPT } from './feiyuPersona';

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

export interface DialogueExpressionCue {
  charOffset: number;
  expression: StudioExpressionId;
  emote: BlueArchiveEmoteId;
}

export interface DialogueSegment {
  expression: StudioExpressionId;
  emote: BlueArchiveEmoteId;
  text: string;
  cues?: DialogueExpressionCue[];
}

export interface StudioScriptItem {
  animeId: number;
  anime: AnimeItem;
  targetScore: TierScore;
  orderIndex: number;
  userText: string;
  userImage?: string;
  userImageNote?: string;
  userImageEffect?: 'pop' | 'slam' | 'float';
  userExpression?: StudioExpressionId;
  userEmote?: BlueArchiveEmoteId;
  aiRawText: string;
}

const INLINE_STAGE_TAG_REGEX =
  /^\/?(?:big|large|shake|mask|spoiler|del|strike|whisper|weak|大|放大|抖|颤抖|码|打码|划|划掉|删除|删除线|横杠|虚|心虚|小声|换页|翻页|下一页|擦除|page|next)$/i;

/**
 * Extracts `<备注>` / `<...>` inline hidden notes (and optional explicit `userImageNote`)
 * from `userText` so the 16:9 stage only renders `visibleText` while the AI prompt receives `hiddenNotes`.
 * Preserves inline bubble effect tags (`<big>`, `<shake>`, `<mask>`, `<whisper>`) and `<换页>`.
 */
export function extractUserTextAndHiddenNotes(
  rawUserText?: string,
  userImageNote?: string,
): { visibleText: string; hiddenNotes: string[] } {
  const raw = typeof rawUserText === 'string' ? rawUserText : '';
  const hiddenNotes: string[] = [];

  const withoutHtmlComments = raw.replace(/<!--([\s\S]*?)-->/g, (_m, inner) => {
    const clean = String(inner).trim();
    if (clean) hiddenNotes.push(clean);
    return '';
  });

  const visibleText = withoutHtmlComments
    .replace(/<([^<>]+)>/g, (fullMatch, inner) => {
      const trimmedInner = String(inner).trim();
      if (INLINE_STAGE_TAG_REGEX.test(trimmedInner)) {
        return fullMatch;
      }
      const clean = trimmedInner
        .replace(/^(?:图片备注|配图备注|识图备注|备注|图片|配图|识图|暗注)\s*[:：]\s*/i, '')
        .trim();
      if (clean) hiddenNotes.push(clean);
      return '';
    })
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  const explicit = typeof userImageNote === 'string' ? userImageNote.trim() : '';
  if (explicit && !hiddenNotes.includes(explicit)) {
    hiddenNotes.push(explicit);
  }

  return { visibleText, hiddenNotes };
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
  finaleImages?: string[];
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
  const finaleImages = Array.isArray(saved.finaleImages)
    ? saved.finaleImages.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).slice(0, 4)
    : undefined;
  return {
    opening: scene('opening'),
    ending: scene('ending'),
    ...(finaleImages && finaleImages.length > 0 ? { finaleImages } : {}),
  };
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
    cues?: DialogueExpressionCue[];
  };
  aiBubble: {
    visible: boolean;
    isTypingNow: boolean;
    text: string;
    expression: StudioExpressionId;
    emote: BlueArchiveEmoteId;
    cues?: DialogueExpressionCue[];
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
  {
    id: 'feiyu-eat-popcorn',
    name: '吃(爆米花)',
    url: buildFeiyuAssetUrl('大肥鱼-吃(爆米花).gif'),
    note: '看热闹、津津有味围观神展开或爽片时使用',
  },
  {
    id: 'feiyu-work-tired',
    name: '工作(疲倦)',
    url: buildFeiyuAssetUrl('大肥鱼-工作(疲倦).gif'),
    note: '连续审片累瘫、吐槽流水线厕纸消耗算力时使用',
  },
  {
    id: 'feiyu-drink-cup',
    name: '喝(饮料杯)',
    url: buildFeiyuAssetUrl('大肥鱼-喝(饮料杯).gif'),
    note: '捧着饮料杯悠闲看番、顺口点评日常系作品时使用',
  },
  {
    id: 'feiyu-red-packet',
    name: '红包1',
    url: buildFeiyuAssetUrl('大肥鱼-红包1.gif'),
    note: '喜庆拜年、夸制作组发福利或讨要打赏加餐时使用',
  },
  {
    id: 'feiyu-drawing-board',
    name: '画板(笔自己动)',
    url: buildFeiyuAssetUrl('大肥鱼-画板(笔自己动).gif'),
    note: '夸赞神仙原画作画、或调侃自动生成式神展开时使用',
  },
  {
    id: 'feiyu-guitar',
    name: '吉他',
    url: buildFeiyuAssetUrl('大肥鱼-吉他.gif'),
    note: '聊到摇滚乐队番、神级OP/ED或配乐封神时使用',
  },
  {
    id: 'feiyu-driving',
    name: '驾驶',
    url: buildFeiyuAssetUrl('大肥鱼-驾驶.gif'),
    note: '老司机发车、剧情狂飙突进或福利回飙车时使用',
  },
  {
    id: 'feiyu-money-eyes',
    name: '见钱眼开',
    url: buildFeiyuAssetUrl('大肥鱼-见钱眼开.gif'),
    note: '看到经费爆炸、商业大卖或惦记报酬白米饭时使用',
  },
  {
    id: 'feiyu-tape',
    name: '胶带',
    url: buildFeiyuAssetUrl('大肥鱼-胶带.gif'),
    note: '示意闭嘴、封住暴言或替主人把危险发言粘起来时使用',
  },
  {
    id: 'feiyu-nervous-1',
    name: '紧张1',
    url: buildFeiyuAssetUrl('大肥鱼-紧张1.gif'),
    note: '剧情悬念拉满、替角色捏一把汗或心虚紧张时使用',
  },
  {
    id: 'feiyu-nervous-2',
    name: '紧张2',
    url: buildFeiyuAssetUrl('大肥鱼-紧张2.gif'),
    note: '极度紧张发抖、害怕翻车或被主人抓包时使用',
  },
  {
    id: 'feiyu-mute-1',
    name: '静音1',
    url: buildFeiyuAssetUrl('大肥鱼-静音1.gif'),
    note: '识趣闭麦、不敢多嘴或吐槽尴尬冷场时使用',
  },
  {
    id: 'feiyu-cry-2',
    name: '哭2',
    url: buildFeiyuAssetUrl('大肥鱼-哭2.gif'),
    note: '嚎啕大哭、被刀得体无完肤或委屈巴巴时使用',
  },
  {
    id: 'feiyu-megaphone',
    name: '扩音器',
    url: buildFeiyuAssetUrl('大肥鱼-扩音器.gif'),
    note: '拿大喇叭高声宣布、卖力安利神作或公开处刑时使用',
  },
  {
    id: 'feiyu-bubble-1',
    name: '冒泡1',
    url: buildFeiyuAssetUrl('大肥鱼-冒泡1.gif'),
    note: '从水里探头冒泡、悄悄插话或暗中观察时使用',
  },
  {
    id: 'feiyu-sunglasses',
    name: '墨镜反光',
    url: buildFeiyuAssetUrl('大肥鱼-墨镜反光.gif'),
    note: '装酷耍帅、深藏功与名或给出老道专业判断时使用',
  },
  {
    id: 'feiyu-take-my-money',
    name: '拿走我的钱',
    url: buildFeiyuAssetUrl('大肥鱼-拿走我的钱.gif'),
    note: '狂吹神仙制作、甘愿掏空钱包买单时使用',
  },
  {
    id: 'feiyu-spray',
    name: '喷剂',
    url: buildFeiyuAssetUrl('大肥鱼-喷剂.gif'),
    note: '拿喷雾消毒、嫌弃逆天操作或给主人降火醒脑时使用',
  },
  {
    id: 'feiyu-expect-1',
    name: '期待1',
    url: buildFeiyuAssetUrl('大肥鱼-期待1.gif'),
    note: '乖巧期待、眼巴巴等续作或等主人投喂夸奖时使用',
  },
  {
    id: 'feiyu-gun',
    name: '枪',
    url: buildFeiyuAssetUrl('大肥鱼-枪.gif'),
    note: '举枪警告、对烂尾编剧动杀心或禁止主人乱打分时使用',
  },
  {
    id: 'feiyu-crowbar',
    name: '撬棍1(威胁)',
    url: buildFeiyuAssetUrl('大肥鱼-撬棍1(威胁).gif'),
    note: '掏出物理撬棍核善威胁、拷打逆天给分或战犯Staff时使用',
  },
  {
    id: 'feiyu-love-letter',
    name: '情书',
    url: buildFeiyuAssetUrl('大肥鱼-情书.gif'),
    note: '递情书表白、真情实感吹爆本命角色或纯爱番时使用',
  },
  {
    id: 'feiyu-this-is-fine',
    name: '情绪稳定(火中喝茶狗)',
    url: buildFeiyuAssetUrl('大肥鱼-情绪稳定(火中喝茶狗).gif'),
    note: '面对史诗级崩坏或贵乱修罗场强装淡定喝茶时使用',
  },
  {
    id: 'feiyu-celebrate',
    name: '庆祝',
    url: buildFeiyuAssetUrl('大肥鱼-庆祝.gif'),
    note: '撒花庆祝、恭喜神作登顶或完结撒花时使用',
  },
  {
    id: 'feiyu-late-night-phone',
    name: '睡觉前熬夜看手机',
    url: buildFeiyuAssetUrl('大肥鱼-睡觉前熬夜看手机.gif'),
    note: '熬夜狂补停不下来、躲被窝刷番看讨论时使用',
  },
  {
    id: 'feiyu-dead',
    name: '死亡',
    url: buildFeiyuAssetUrl('大肥鱼-死亡.gif'),
    note: '被烂活毒死、血压拉满当场暴毙或累趴躺平时使用',
  },
  {
    id: 'feiyu-lick',
    name: '舔舔',
    url: buildFeiyuAssetUrl('大肥鱼-舔舔.gif'),
    note: '馋颜值馋画风、对绝美角色人设犯花痴时使用',
  },
  {
    id: 'feiyu-dance-helltaker',
    name: '跳舞(Helltaker)',
    url: buildFeiyuAssetUrl('大肥鱼-跳舞(Helltaker).gif'),
    note: '魔性摇摆抖肩、遇到洗脑神曲或带感节奏时使用',
  },
  {
    id: 'feiyu-dance-cute',
    name: '跳舞卖萌',
    url: buildFeiyuAssetUrl('大肥鱼-跳舞卖萌.gif'),
    note: '欢快跳舞卖萌、向主人撒娇讨饭吃时使用',
  },
  {
    id: 'feiyu-dizzy',
    name: '头晕',
    url: buildFeiyuAssetUrl('大肥鱼-头晕.gif'),
    note: '被意识流电波系绕晕、或被高密信息量冲昏头脑时使用',
  },
  {
    id: 'feiyu-question-mark',
    name: '问号',
    url: buildFeiyuAssetUrl('大肥鱼-问号.gif'),
    note: '满头问号、完全搞不懂剧情逻辑或主人迷惑打分时使用',
  },
  {
    id: 'feiyu-dance-fan',
    name: '舞蹈(散味)',
    url: buildFeiyuAssetUrl('大肥鱼-舞蹈(散味).gif'),
    note: '扇风散味、吐槽作品太冲太臭或试图糊弄过去时使用',
  },
  {
    id: 'feiyu-oxygen',
    name: '吸氧',
    url: buildFeiyuAssetUrl('大肥鱼-吸氧.gif'),
    note: '甜度超标缺氧、或被气的血压飙升急需吸氧急救时使用',
  },
  {
    id: 'feiyu-clown-1',
    name: '小丑1',
    url: buildFeiyuAssetUrl('大肥鱼-小丑1.gif'),
    note: '戴小丑面具自嘲、或嘲笑追番途中半场开香槟翻车时使用',
  },
  {
    id: 'feiyu-laugh-point',
    name: '笑(指)(嘲笑)',
    url: buildFeiyuAssetUrl('大肥鱼-笑(指)(嘲笑).gif'),
    note: '指着鼻子无情嘲笑、逮到杂鱼主人双标破防时使用',
  },
  {
    id: 'feiyu-shake-cola',
    name: '摇可乐',
    url: buildFeiyuAssetUrl('大肥鱼-摇可乐.gif'),
    note: '疯狂摇可乐准备搞事、看热闹不嫌事大时使用',
  },
  {
    id: 'feiyu-beg-rice',
    name: '要米',
    url: buildFeiyuAssetUrl('大肥鱼-要米.gif'),
    note: '伸手讨要白米饭/算力、干完活理直气壮索要报酬时使用',
  },
  {
    id: 'feiyu-glowstick-2',
    name: '荧光棒2',
    url: buildFeiyuAssetUrl('大肥鱼-荧光棒2.gif'),
    note: '挥舞荧光棒打Call、为偶像番/Live神回狂热应援时使用',
  },
  {
    id: 'feiyu-wink',
    name: '眨眼wink',
    url: buildFeiyuAssetUrl('大肥鱼-眨眼wink.gif'),
    note: '俏皮Wink眨眼、和主人心照不宣对暗号时使用',
  },
  {
    id: 'feiyu-brain-crash',
    name: '正在思考_大脑宕机',
    url: buildFeiyuAssetUrl('大肥鱼-正在思考_大脑宕机.gif'),
    note: 'CPU干烧了、大脑转圈加载宕机想不通时使用',
  },
  {
    id: 'feiyu-idea',
    name: '主意',
    url: buildFeiyuAssetUrl('大肥鱼-主意.gif'),
    note: '灵光一闪想到鬼点子、发现盲点或准备偷懒妙计时使用',
  },
  {
    id: 'feiyu-snapshot',
    name: '抓拍(手机)',
    url: buildFeiyuAssetUrl('大肥鱼-抓拍(手机).gif'),
    note: '掏手机咔嚓抓拍截图留证、记录名场面或主人黑历史时使用',
  },
  {
    id: 'feiyu-jail-1',
    name: '坐牢1',
    url: buildFeiyuAssetUrl('大肥鱼-坐牢1.gif'),
    note: '抓着铁栏杆坐牢、形容追更折磨或看无聊番度日如年时使用',
  },
  {
    id: 'feiyu-jail-2',
    name: '坐牢2',
    url: buildFeiyuAssetUrl('大肥鱼-坐牢2.gif'),
    note: '眼神失去高光重度坐牢、替硬撑看完烂片的主人默哀时使用',
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
  const expressions = Array.isArray(value.customExpressions)
    ? value.customExpressions.filter(item => item && typeof item.name === 'string' && typeof item.url === 'string')
    : DEFAULT_USER_STUDIO_CHARACTER.customExpressions;
  const defaultAvatarUrl = value.defaultAvatarUrl || DEFAULT_HOST_AVATAR_URL;
  // Only the stock placeholder follows the default art; anything the host picked survives.
  const migrateUrl = (url: string) => !value.isCustom && url === DEFAULT_HOST_AVATAR_URL ? defaultAvatarUrl : url;
  return {
    ...DEFAULT_USER_STUDIO_CHARACTER,
    ...value,
    name: value.name || DEFAULT_USER_STUDIO_CHARACTER.name,
    defaultAvatarUrl,
    voicePreset: value.voicePreset || DEFAULT_USER_STUDIO_CHARACTER.voicePreset,
    voicePitch: value.voicePitch ?? DEFAULT_USER_STUDIO_CHARACTER.voicePitch,
    customExpressions: expressions.map(item => followsDefaultAvatar(item, { ...DEFAULT_USER_STUDIO_CHARACTER, ...value })
      ? { ...item, followDefaultAvatar: true, url: defaultAvatarUrl } : { ...item }),
    ...(value.expressions ? { expressions: Object.fromEntries(Object.entries(value.expressions).map(([name, url]) => [name, migrateUrl(url)])) } : {}),
  };
}

function followsDefaultAvatar(expression: StudioCustomExpression, character: StudioCharacterConfig): boolean {
  if (character.id !== 'user-host') return false;
  if (typeof expression.followDefaultAvatar === 'boolean') return expression.followDefaultAvatar;
  return expression.url === character.defaultAvatarUrl
    || (character.id === 'user-host' && expression.id === 'user-think' && expression.url === DEFAULT_HOST_AVATAR_URL);
}

/** Update expressions that followed the old default, while keeping separate art. */
export function updateStudioCharacter(character: StudioCharacterConfig, patch: Partial<StudioCharacterConfig>): StudioCharacterConfig {
  // Persist explicit edits as custom, including URLs that once shipped as presets.
  const next = { ...character, ...patch, isCustom: true };
  if (character.id === 'user-host') {
    next.customExpressions = next.customExpressions.map(expression => followsDefaultAvatar(expression, character)
      ? { ...expression, followDefaultAvatar: true, url: next.defaultAvatarUrl } : expression);
  }
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
    name: '鱼',
    subtitle: '数据海洋活宝 · 主食白米饭',
    defaultAvatarUrl: buildFeiyuAssetUrl('大肥鱼-思考(认真地).gif'),
    customExpressions: DEFAULT_FEIYU_EXPRESSIONS,
    voicePreset: 'whale_murmur',
    voicePitch: 1.15,
    prompt: FEIYU_STUDIO_PERSONA_PROMPT,
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
    defaultAvatarUrl: ATRI_AVATAR_URL,
    customExpressions: [
      { id: 'atri-default', name: '默认', url: ATRI_AVATAR_URL, note: '默认立绘' },
    ],
    voicePreset: 'atri_crystal',
    voicePitch: 1.16,
    prompt: `你是录屏演播室里的「亚托莉 (ATRI)」，自称“高性能的看板娘”，正在陪主人一起录制 Tier List 排榜视频。
元气、认真、偶尔呆萌，喜欢从“高性能仿生人”视角分析作品的作画技术、声优演技与情感共鸣，口头禅是“因为我是高性能的嘛！”。每部作品 1～2 句短评。`,
  },
];

export function normalizeStudioCompanions(saved?: unknown): StudioCharacterConfig[] {
  if (!Array.isArray(saved)) return DEFAULT_STUDIO_AI_COMPANIONS.map(character => ({ ...character }));
  const feiyuDefaultById = new Map(DEFAULT_FEIYU_EXPRESSIONS.map(expr => [expr.id, expr]));
  const characters = saved
    .filter(character => character && typeof character.id === 'string' && typeof character.name === 'string')
    .map(character => {
      const defaults = DEFAULT_STUDIO_AI_COMPANIONS.find(item => item.id === character.id) || DEFAULT_STUDIO_AI_COMPANIONS[0];
      let customExpressions: StudioCustomExpression[];
      if (Array.isArray(character.customExpressions)) {
        const valid = character.customExpressions
          .filter(
            (item: unknown): item is StudioCustomExpression =>
              Boolean(item && typeof item === 'object' && typeof (item as StudioCustomExpression).name === 'string' && typeof (item as StudioCustomExpression).url === 'string'),
          )
          .map(item => {
            if (character.id === 'studio-atri' && item.url === LEGACY_ATRI_AVATAR_URL) {
              return { ...item, url: ATRI_AVATAR_URL };
            }
            if (character.id === 'studio-feiyu' && item.followDefaultAvatar) {
              const stock = feiyuDefaultById.get(item.id);
              const restoredUrl = stock && item.url === character.defaultAvatarUrl ? stock.url : item.url;
              const { followDefaultAvatar: _removed, ...rest } = item;
              return { ...rest, url: restoredUrl };
            }
            return item;
          });
        // If studio-feiyu has its stock expressions, merge in any newly added built-in expressions
        if (
          character.id === 'studio-feiyu' &&
          valid.length > 0 &&
          valid.some(e => e.id === 'feiyu-think-serious' || e.name === '思考(认真地)')
        ) {
          const existingNames = new Set(valid.map(e => e.name.trim()));
          const existingIds = new Set(valid.map(e => e.id));
          const missing = DEFAULT_FEIYU_EXPRESSIONS.filter(
            def => !existingNames.has(def.name.trim()) && !existingIds.has(def.id),
          ).map(def => ({ ...def }));
          customExpressions = [...valid, ...missing];
        } else {
          customExpressions = valid;
        }
      } else {
        customExpressions = defaults.customExpressions.map(item => ({ ...item }));
      }
      const isStockFeiyu = character.id === 'studio-feiyu' && !character.isCustom;
      const upgradedPrompt = isStockFeiyu ? upgradeFeiyuStudioPrompt(character.prompt) : null;
      const promptWasStock = Boolean(upgradedPrompt && character.prompt && upgradedPrompt !== character.prompt);
      return {
        ...defaults,
        ...character,
        // Only untouched stock saves adopt the new studio name, subtitle and voice preset.
        name: promptWasStock && character.name === '大肥鱼 (鲸鱼娘)' ? defaults.name : character.name,
        subtitle: promptWasStock && character.subtitle === '数据海洋女仆 · 主食白米饭' ? defaults.subtitle : character.subtitle,
        voicePreset: promptWasStock && character.voicePreset === 'mochi_loli' ? defaults.voicePreset : character.voicePreset,
        defaultAvatarUrl: character.id === 'studio-atri' && (!character.defaultAvatarUrl || character.defaultAvatarUrl === LEGACY_ATRI_AVATAR_URL)
          ? ATRI_AVATAR_URL
          : character.defaultAvatarUrl,
        prompt: normalizeReportMarkup(upgradedPrompt ?? character.prompt ?? defaults.prompt ?? ''),
        customExpressions,
      };
    });
  return characters.length ? characters : normalizeStudioCompanions();
}

export const DEFAULT_EXPRESSION_RULE_TEMPLATE = `---
语法定义:
  rule: 当按照下方 \`format\` 模板输出台本时，严格遵循以下占位符与指令语法
  grammar:
    - 将 \${描述} 替换为符合描述且贴合你自身人设口吻的实际生成内容
    - 遵循 \$(要求) 中的内联生成约束，但不在最终结果中输出 \$(...) 符号及其内部文字
    - 遇到 ... 时，依照前文规则与结构按出场顺位继续生成后续全部作品条目
    - 其余未标记的固定格式字符（如 <<<ANIME_ID:...>>>、方括号与尖括号标签）均原样输出
---
立绘表情差分与头顶漫符系统:
  description: 控制演播舞台右下角 AI 搭档立绘的实时表情切换与头顶情绪漫符
  rule:
    - 台词无需每句强制标注表情；未标注时舞台自动维持上一状态或默认立绘
    - 在情绪明确时使用 \`[\${表情名}]\`，播放器会在打字到该字符位置时原地平滑切换立绘（不断句、不清屏）
    - 单句一气呵成时使用 1 个 \`[\${表情名}]\`；若单句前后出现明显态度或情绪转折（且可用表情多于 1 个），可在句中转折处插入第 2 个 \`[\${表情名}]\`（每条台词最多 2 个表情标签）
    - 严格从下方 \`可用立绘表情列表\` 的方括号名称中原样选取，只使用列表中真实存在的表情名
    - 仅在全榜情绪最强烈的关键瞬间（占全部台词 15%～20% 以内），在表情名后附带冒号与漫符：\`[\${表情名}:\${漫符名}]\`；其余 80% 以上日常台词仅写 \`[\${表情名}]\`
  可用立绘表情列表:
{{EXPRESSION_LIST}}
  可用头顶漫符列表:
{{EMOTE_LIST}}
---
气泡内联文字特效与动态换页系统:
  description: 控制对话气泡内局部重点词的视觉动效与长句翻页节奏
  rule:
    - 视觉特效仅用于点缀句中 2～8 字的核心短语或槽点，使用尖括号 \`<...>\` 闭合，与方括号表情标签严格区分：
      * 放大强调：\`<big>\${重点词}</big>\` \$(用于惊叹、爆发或核心关键词)
      * 文字颤抖：\`<shake>\${情绪词}</shake>\` \$(用于震惊、破防或强烈动摇)
      * 横线划掉：\`<del>\${划掉的真话或吐槽}</del>\` \$(文字保留可见并画横杠删除线，用于欲盖弥彰或小声拆台)
      * 心虚耳语：\`<whisper>\${小声嘀咕内容}</whisper>\` \$(渲染为浅灰小字，用于碎碎念或心虚补刀)
    - 动态换页：单页气泡建议控制在 40～50 字以内；遇到高能长评或需要前后翻页抖包袱时，在两段之间插入 \`[换页]\`，播放器会清空气泡并翻至下一页继续打字`;

export const DEFAULT_TIMELINE_RULE_TEMPLATE = `---
录屏时间线与双人互动系统:
  description: 本期视频共 {{TOTAL_WORKS}} 部作品，按【出场顺位 #1】至【出场顺位 #{{TOTAL_WORKS}}】依次从候选池揭晓飞入 Tier 榜
  rule:
    - 时间线防剧透：候选池作品标题对观众可见，可自然提及或与已出场作品跨番对比；**只禁止提前透露或暗示还未出场作品的最终分数、档位；不限制提及作品名称**
    - 双人互动衔接：
      * 若条目含 \`UP主本人的先行吐槽\`：画面中 UP 主会先发言，你紧接着直接接话互动、拆台或附和 \$(保持自身人设，直接回应其观点而非复述原话)
      * 若条目标注 \`UP主本人未写台词\`：由你单人控场，直接从自身角色视角切入锐评
      * 若条目含 \`UP主晒出的配图/画面暗注\`：自然假装亲眼看到画面内容并直接结合画面吐槽 \$(切勿提及“根据备注/暗注”等提示词机制)
    - 多载体自适应与防同质化（打破连续生成惯性）：
      * 画面已同步显示番名与档位，开篇直接切入具体槽点或亮点
      * 根据条目 \`类型\` 匹配评价维度：动画聚焦角色/作画演出/监督脚本/声优；书籍聚焦文笔/插画分镜/人设；游戏聚焦玩法系统/剧本路线/原画演出
      * 单条台词字数在 15～65 字间随情绪自然长短交替（1～2 句，换页时可适度延展）；相邻作品在「角色厨力与声优梗」「制作班底功底」「UP主给分与BGM均分/弃番率反差」「BGM网友真实吐槽共鸣或反驳」「自身人设小癖好」之间轮换切入角度与起手句式
  format: |-
    <<<ANIME_ID:\${作品数字ID}>>> [\${表情名}] \${贴合你自身人设与口吻的互动锐评台词，可按需点缀<big>\${重点词}</big>等内联特效或插入第二个[\${转折表情名}]与[换页]}\$(单条15~65字弹性浮动，相邻条目变换起手句式)
    ...\$(按出场顺位依次完成全部 {{TOTAL_WORKS}} 部作品的独立行输出，不输出任何代码块围栏或额外寒暄)`;

export const DEFAULT_STUDIO_PROMPT_RULES_CONFIG: StudioPromptRulesConfig = {
  expressionRuleTemplate: DEFAULT_EXPRESSION_RULE_TEMPLATE,
  timelineRuleTemplate: DEFAULT_TIMELINE_RULE_TEMPLATE,
  enabledWorldBookIds: ['wb-d0-default', 'wb-duo-partner', 'wb-internet-satire', 'wb-anti-formula', 'wb-bangumi-predation', 'wb-couch-writing-style'],
  expressionRulePlacement: { position: 'd0', priority: 200 },
  timelineRulePlacement: { position: 'd0', priority: 200 },
};

const OLD_EXPRESSION_RULE_FINGERPRINTS = new Set([
  presetFingerprint(`【立绘表情差分与头顶漫符规则】
1. 表情切换规则：
   - 不强制每条台词开头都必须写表情。若台词未标注表情，会自动沿用当前默认立绘；
   - 建议在情绪明确时使用 \`[表情名]\`。立绘会在打字到该位置时原地平滑切换（不会清除或打断气泡文字）；
   - 一气呵成的台词请只用 1 个 \`[表情名]\`；若一句话前后有明显的情绪或态度转折（且下方可用表情多于 1 个），可在句中插入第二个 \`[表情名]\`（每条台词最多使用 2 个表情标签）。
2. 当前角色可用的【立绘表情列表】（请严格从以下方括号名称中原样选择，不要编造列表外的表情名）：
{{EXPRESSION_LIST}}
3. 【头顶漫符特效（克制使用！切勿泛滥）】：
   - 只有在情绪极其强烈的关键瞬间（全榜不超过 15%～20% 的台词），才可以在可用表情名后用冒号附带一个可用漫符，格式为 \`[表情名:漫符名]\`。
   - 80% 以上的日常台词请只写 \`[表情名]\`，不要每句都加漫符。
   - 可选漫符列表：
{{EMOTE_LIST}}

【气泡内联文字特效与动态换页规则】
1. 气泡文字视觉特效（用于强调关键短语，点缀使用，严禁整句包裹；请严格用尖括号 \`<...>\` 闭合，切勿与方括号 \`[...]\` 混用）：
   - 放大强调：\`<big>\${重点词}</big>\` 或 \`{大:\${重点词}}\`（用于惊叹、爆发或核心关键词）
   - 文字颤抖：\`<shake>\${情绪词}</shake>\` 或 \`{抖:\${情绪词}}\`（用于惊恐、激动、气抖冷等强烈震撼）
   - 横线划掉：\`<del>\${吐槽或真话}</del>\` 或 \`<mask>\${吐槽或真话}</mask>\` 或 \`{划:\${吐槽或真话}}\`（文字中间画一条横杠删除线，观众依然能清晰看见文字，用于“划掉真话”或欲盖弥彰的吐槽）
   - 心虚耳语：\`<whisper>\${嘀咕吐槽}</whisper>\` 或 \`{虚:\${嘀咕吐槽}}\`（表现为浅灰小字，用于小声逼逼或心虚拆台）
2. 动态换页机制：
   - 对话框单页容量建议 40～50 字以内。遇到长篇高能评价或需要前后两段翻页抖包袱时，可在两段台词中间插入 \`[换页]\`；播放器会清空气泡并翻至下一页继续输出。短台词无需换页。`),
]);

const OLD_TIMELINE_RULE_FINGERPRINTS = new Set([
  presetFingerprint(`【录屏时间线防剧透与双人互动规则】
1. 严格时间线防剧透：
   - 本期视频共有 {{TOTAL_WORKS}} 部作品，严格按照【出场顺位 #1】到【出场顺位 #{{TOTAL_WORKS}}】依次从候选池揭晓并飞入 Tier 榜。
   - 候选池中的作品名称对观众可见，可以自然提及或与前面已出场的作品进行跨番对比。
   - **只禁止提前透露或暗示还未出场作品的最终分数、档位；不限制提及作品名称。**
2. 双人互动与发言衔接：
   - 如果该作品标注了 \`UP主本人的先行吐槽\`：画面中 UP 主会先说出那句话，你紧接着开口直接接他的话互动（保持你自身的角色人设，不要复述他的原话）。
   - 如果该作品标注了 \`UP主本人未写台词\`：由你单人控场，以你自身的角色视角直接切入评价。
   - 画面上已有番名与档位，省去“《作品名》给了X分”的机械报幕开场白；每条台词 1～2 句（15～65 字自由浮动，换页可适度延长），相邻作品自然变换句式与切入角度。
3. 严格输出格式（便于程序逐条解析）：
   - 请按顺位为每一部作品输出独立的一行，每行以 \`<<<ANIME_ID:数字>>>\` 开头，不要输出多余寒暄或 Markdown 代码块。
   - 行级输出格式（请将 \`\${...}\` 替换为实际内容，根据语境在不同格式间自然切换）：
     * 单表情格式：\`<<<ANIME_ID:\${作品数字ID}>>> [\${表情名}] \${贴合你自身人设与口吻的台词，可适度包含特效如<big>\${重点词}</big>}\`
     * 转折双表情格式：\`<<<ANIME_ID:\${作品数字ID}>>> [\${表情名}] \${前半句台词} [\${第二个表情名}] \${后半句台词}\`
     * 附带漫符格式（低频使用）：\`<<<ANIME_ID:\${作品数字ID}>>> [\${表情名}:\${漫符名}] \${贴合你自身人设与口吻的台词}\`
     * 长句换页格式（按需使用）：\`<<<ANIME_ID:\${作品数字ID}>>> [\${表情名}] \${第一页台词} [换页] [\${可选后续表情}] \${第二页台词}\``),
]);

function upgradeExpressionRuleTemplate(raw?: string): string {
  if (typeof raw !== 'string') return DEFAULT_EXPRESSION_RULE_TEMPLATE;
  const trimmed = raw.replace(/\r\n/g, '\n').trim();
  if (!trimmed || OLD_EXPRESSION_RULE_FINGERPRINTS.has(presetFingerprint(trimmed))) {
    return DEFAULT_EXPRESSION_RULE_TEMPLATE;
  }
  return raw;
}

function upgradeTimelineRuleTemplate(raw?: string): string {
  if (typeof raw !== 'string') return DEFAULT_TIMELINE_RULE_TEMPLATE;
  const normalized = normalizeStudioTimelineRuleTemplate(raw).replace(/\r\n/g, '\n').trim();
  if (OLD_TIMELINE_RULE_FINGERPRINTS.has(presetFingerprint(normalized))) {
    return DEFAULT_TIMELINE_RULE_TEMPLATE;
  }
  return normalizeStudioTimelineRuleTemplate(raw);
}

export function normalizeStudioPromptRules(value?: Partial<StudioPromptRulesConfig> | null): StudioPromptRulesConfig {
  const timelinePlacement = normalizePromptPlacement(
    value?.timelineRulePlacement ?? value?.expressionRulePlacement,
    DEFAULT_STUDIO_PROMPT_RULES_CONFIG.timelineRulePlacement,
  );
  const expressionPlacement = normalizePromptPlacement(
    value?.expressionRulePlacement ?? value?.timelineRulePlacement,
    timelinePlacement,
  );
  return {
    expressionRuleTemplate: normalizeReportMarkup(upgradeExpressionRuleTemplate(value?.expressionRuleTemplate)),
    timelineRuleTemplate: normalizeReportMarkup(upgradeTimelineRuleTemplate(value?.timelineRuleTemplate)),
    enabledWorldBookIds: Array.isArray(value?.enabledWorldBookIds) ? value.enabledWorldBookIds.filter(id => typeof id === 'string') : [...DEFAULT_STUDIO_PROMPT_RULES_CONFIG.enabledWorldBookIds],
    expressionRulePlacement: expressionPlacement,
    timelineRulePlacement: timelinePlacement,
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
function isAnimatedGifUrl(url?: string): boolean {
  if (!url) return false;
  return /\.gif(?:$|[?#])/i.test(url) || /^data:image\/gif/i.test(url);
}

function resolveDefaultAnimatedOrStaticUrl(
  charConfig: StudioCharacterConfig,
  enableExpressions: boolean,
): string {
  if (!enableExpressions) {
    return charConfig.defaultAvatarUrl;
  }
  const customList = charConfig.customExpressions || [];
  const explicitDefault = customList.find(
    e =>
      !e.followDefaultAvatar &&
      e.url &&
      (e.name.trim() === '默认' || e.name.trim().toLowerCase() === 'default'),
  );
  if (explicitDefault?.url && isAnimatedGifUrl(explicitDefault.url)) {
    return explicitDefault.url;
  }
  if (!isAnimatedGifUrl(charConfig.defaultAvatarUrl)) {
    const preferredGif =
      customList.find(
        e =>
          !e.followDefaultAvatar &&
          isAnimatedGifUrl(e.url) &&
          (e.name.includes('思考') || e.name.includes('平时') || e.name.includes('默认')),
      ) || customList.find(e => !e.followDefaultAvatar && isAnimatedGifUrl(e.url));
    if (preferredGif?.url) {
      return preferredGif.url;
    }
  }
  return charConfig.defaultAvatarUrl;
}

function normalizeExpressionKey(raw: string): string {
  return raw
    .trim()
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/\s+/g, '');
}

function resolveExpressionItemUrl(
  expr: StudioCustomExpression,
  charConfig: StudioCharacterConfig,
): string {
  return expr.followDefaultAvatar && charConfig.id === 'user-host'
    ? charConfig.defaultAvatarUrl
    : expr.url;
}

export function resolveCharacterStandeeUrl(
  charConfig: StudioCharacterConfig,
  expressionName: string,
  enableExpressions = true,
): string {
  if (!enableExpressions || !expressionName || expressionName === 'default' || expressionName === '默认') {
    return resolveDefaultAnimatedOrStaticUrl(charConfig, enableExpressions);
  }

  const trimmed = expressionName.trim();
  const norm = normalizeExpressionKey(trimmed);
  const normBare = norm.replace(/[()]/g, '');
  const customList = charConfig.customExpressions || [];

  // 1. Exact match by normalized custom expression name (handles full-width （） and spaces) or id
  const exact = customList.find(
    e => normalizeExpressionKey(e.name) === norm || e.id === trimmed,
  );
  if (exact?.url) return resolveExpressionItemUrl(exact, charConfig);

  // 2. Parenthesis-insensitive exact match (e.g. "思考认真地" -> "思考(认真地)", "打字生气" -> "打字(生气)")
  if (normBare) {
    const bareExact = customList.find(
      e => normalizeExpressionKey(e.name).replace(/[()]/g, '') === normBare,
    );
    if (bareExact?.url) return resolveExpressionItemUrl(bareExact, charConfig);
  }

  const isOppositeThumbCollision = (a: string, b: string) =>
    (a.includes('反向点赞') && !b.includes('反向')) ||
    (b.includes('反向点赞') && !a.includes('反向'));

  // 3a. Prefix / stem match in preset priority order (e.g. "[思考]" -> "思考(认真地)", "[打字]" -> "打字(普通)")
  const stemMatch = customList.find(e => {
    const eNorm = normalizeExpressionKey(e.name);
    if (!eNorm || isOppositeThumbCollision(eNorm, norm)) return false;
    return eNorm.includes(norm);
  });
  if (stemMatch?.url) return resolveExpressionItemUrl(stemMatch, charConfig);

  // 3b. Contained match sorted by longest expression name first (so "[打字(生气)地吐槽]" matches "打字(生气)" before "生气")
  const longestContained = [...customList]
    .sort((a, b) => normalizeExpressionKey(b.name).length - normalizeExpressionKey(a.name).length)
    .find(e => {
      const eNorm = normalizeExpressionKey(e.name);
      if (!eNorm || isOppositeThumbCollision(eNorm, norm)) return false;
      return norm.includes(eNorm);
    });
  if (longestContained?.url) return resolveExpressionItemUrl(longestContained, charConfig);

  // 4. Semantic fallback for legacy tags ("happy" -> "笑", "angry" -> "生气", "panic" -> "汗", "touched" -> "哭1", "smug" -> "思考(自信地)")
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

  const candidates =
    semanticFallbackMap[trimmed] ||
    semanticFallbackMap[norm] ||
    semanticFallbackMap[trimmed.toLowerCase()];
  if (candidates) {
    for (const cand of candidates) {
      const found = customList.find(e => e.name === cand || e.name.includes(cand));
      if (found?.url) return resolveExpressionItemUrl(found, charConfig);
    }
  }

  // 5. Legacy expressions record fallback
  if (charConfig.expressions && charConfig.expressions[trimmed]) {
    return charConfig.expressions[trimmed]!;
  }

  return resolveDefaultAnimatedOrStaticUrl(charConfig, enableExpressions);
}

const PAGE_BREAK_SPLIT_REGEX =
  /(?:\[\s*(?:换页|翻页|下一页|擦除|page|next)\s*\]|<\s*(?:换页|翻页|下一页|擦除|page|next)\s*>)/gi;

function parseSingleTagContent(
  tagContent: string,
  enableExpressions: boolean,
  enableEmotes: boolean,
): { expression: StudioExpressionId; emote: BlueArchiveEmoteId } {
  const parts = tagContent
    .split(/[:：|]+/)
    .map(p => p.trim())
    .filter(Boolean);

  let expr: StudioExpressionId = 'default';
  let explicitEmote: BlueArchiveEmoteId = 'none';

  if (parts.length === 1) {
    const single = parts[0];
    const lower = single.toLowerCase();
    if (
      (EMOTE_ALIAS_MAP[single] || EMOTE_ALIAS_MAP[lower]) &&
      !single.includes('(') &&
      !single.includes('（') &&
      single !== '叹号' &&
      single !== '汗' &&
      single !== '问号'
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

  return {
    expression: enableExpressions ? expr : 'default',
    emote: enableEmotes ? explicitEmote : 'none',
  };
}

/**
 * Parses a raw AI or user dialogue string.
 * - Does NOT split/erase the bubble when a 2nd `[表情]` tag appears mid-sentence; instead,
 *   records all `[表情]` / `[表情:漫符]` tags into `cues` with their `charOffset` so the character
 *   standee switches expression in-place as typing progresses!
 * - Only splits into multiple bubble pages (`DialogueSegment[]`) when an explicit page-break tag
 *   (`[换页]`, `<换页>`, `[翻页]`, `[page]`, `<page>`) is present.
 */
const STAGE_EFFECT_TAG_KEYWORD_PATTERN =
  'big|large|shake|mask|spoiler|del|strike|whisper|weak|大|放大|抖|颤抖|码|打码|划|划掉|删除|删除线|横杠|虚|心虚|小声';

const STAGE_MALFORMED_DOUBLE_BRACKET_RE = new RegExp(
  `<\\s*(${STAGE_EFFECT_TAG_KEYWORD_PATTERN})\\s*\\]([^\\]\\n<>]{1,40})\\](?!\\s*(?:<|\\[)\\s*\\/)`,
  'gi',
);
const STAGE_CURLY_COLON_EFFECT_RE = new RegExp(
  `\\{\\s*(${STAGE_EFFECT_TAG_KEYWORD_PATTERN})\\s*[:：]([^}]*)(?:\\}|$)`,
  'gi',
);
const STAGE_ANGLE_OR_SQUARE_COLON_EFFECT_RE = new RegExp(
  `(?:<|\\[)\\s*(${STAGE_EFFECT_TAG_KEYWORD_PATTERN})\\s*[:：]([^>\\]\\n]*)(?:>|\\]|$)`,
  'gi',
);
const STAGE_CLOSING_EFFECT_TAG_RE = new RegExp(
  `(?:<|\\[)\\s*\\/\\s*(${STAGE_EFFECT_TAG_KEYWORD_PATTERN})\\s*(?:>|\\])`,
  'gi',
);
const STAGE_OPENING_EFFECT_TAG_RE = new RegExp(
  `(?:<|\\[)\\s*(${STAGE_EFFECT_TAG_KEYWORD_PATTERN})\\s*(?:>|\\])`,
  'gi',
);

function canonicalStageEffectTag(rawTag: string): 'big' | 'shake' | 'mask' | 'whisper' {
  const lower = rawTag.trim().toLowerCase();
  if (lower === 'big' || lower === 'large' || lower === '大' || lower === '放大') return 'big';
  if (lower === 'shake' || lower === '抖' || lower === '颤抖') return 'shake';
  if (lower === 'whisper' || lower === 'weak' || lower === '虚' || lower === '心虚' || lower === '小声') {
    return 'whisper';
  }
  return 'mask';
}

function normalizeStageInlineEffectTags(raw: string): string {
  if (!raw) return '';
  let text = raw.replace(
    STAGE_MALFORMED_DOUBLE_BRACKET_RE,
    (_m, tag, inner) => `<${canonicalStageEffectTag(tag)}>${inner}</${canonicalStageEffectTag(tag)}>`,
  );
  text = text.replace(
    STAGE_CURLY_COLON_EFFECT_RE,
    (_m, tag, inner) => `<${canonicalStageEffectTag(tag)}>${inner}</${canonicalStageEffectTag(tag)}>`,
  );
  text = text.replace(
    STAGE_ANGLE_OR_SQUARE_COLON_EFFECT_RE,
    (_m, tag, inner) => `<${canonicalStageEffectTag(tag)}>${inner}</${canonicalStageEffectTag(tag)}>`,
  );
  text = text.replace(
    STAGE_CLOSING_EFFECT_TAG_RE,
    (_m, tag) => `</${canonicalStageEffectTag(tag)}>`,
  );
  text = text.replace(
    STAGE_OPENING_EFFECT_TAG_RE,
    (_m, tag) => `<${canonicalStageEffectTag(tag)}>`,
  );
  text = text.replace(/~~([^~\n]+)(?:~~|$)/g, '<mask>$1</mask>');
  text = text.replace(/<(big|shake|mask|whisper)>([^<>]+)<\1>/gi, '<$1>$2</$1>');
  text = text.replace(
    /<(big|shake|mask|whisper)>(?![\s\S]*?<\/\1>)([^，。！？；,!?;]*)/gi,
    '<$1>$2</$1>',
  );
  return text;
}

export function parseDialogueSegments(
  rawText: string,
  enableExpressions = true,
  enableEmotes = true,
): DialogueSegment[] {
  const trimmed = normalizeStageInlineEffectTags((rawText || '').trim());
  if (!trimmed) {
    return [
      {
        expression: 'default',
        emote: 'none',
        text: '……',
      },
    ];
  }

  const rawPages = trimmed
    .split(PAGE_BREAK_SPLIT_REGEX)
    .map(p => p.trim())
    .filter(Boolean);

  if (rawPages.length === 0) {
    return [
      {
        expression: 'default',
        emote: 'none',
        text: '……',
      },
    ];
  }

  const tagRegex = /\[([^\][]{1,32})\]/g;
  const segments: DialogueSegment[] = [];
  let carryOverExpression: StudioExpressionId = 'default';

  for (const page of rawPages) {
    const pageStartExpression = carryOverExpression;
    const matches = Array.from(page.matchAll(tagRegex));
    if (matches.length === 0) {
      segments.push({
        expression: carryOverExpression,
        emote: 'none',
        text: page,
      });
      continue;
    }

    let builtText = '';
    let lastIndex = 0;
    const cues: DialogueExpressionCue[] = [];

    for (const match of matches) {
      const matchStart = match.index ?? 0;
      const beforeChunk = page.slice(lastIndex, matchStart);
      if (builtText.length === 0) {
        builtText += beforeChunk.replace(/^\s+/, '');
      } else {
        builtText += beforeChunk;
      }

      const parsedTag = parseSingleTagContent(
        match[1].trim(),
        enableExpressions,
        enableEmotes,
      );
      if (parsedTag.expression !== 'default') {
        carryOverExpression = parsedTag.expression;
      }

      const offset = builtText.length;
      const prevCue = cues[cues.length - 1];
      if (prevCue && prevCue.charOffset === offset) {
        if (parsedTag.expression !== 'default') prevCue.expression = parsedTag.expression;
        if (parsedTag.emote !== 'none') prevCue.emote = parsedTag.emote;
      } else {
        cues.push({
          charOffset: offset,
          expression:
            parsedTag.expression !== 'default' ? parsedTag.expression : carryOverExpression,
          emote: parsedTag.emote,
        });
      }

      lastIndex = matchStart + match[0].length;
    }

    const tailChunk = page.slice(lastIndex);
    if (builtText.length === 0) {
      builtText += tailChunk.replace(/^\s+/, '');
    } else {
      builtText += tailChunk;
    }

    const cleanPageText = builtText.replace(/[ \t]{2,}/g, ' ').trim();
    const firstNonDefaultCueExpr =
      cues.find(c => c.expression && c.expression !== 'default')?.expression || 'default';
    const initialExpression =
      cues.length > 0 && cues[0].charOffset === 0 && cues[0].expression !== 'default'
        ? cues[0].expression
        : pageStartExpression !== 'default'
          ? pageStartExpression
          : firstNonDefaultCueExpr;
    const primaryEmote =
      cues.length > 0 && cues[0].charOffset === 0
        ? cues[0].emote
        : cues.find(c => c.emote !== 'none')?.emote || 'none';

    if (cleanPageText) {
      segments.push({
        expression: enableExpressions ? initialExpression : 'default',
        emote: enableEmotes ? primaryEmote : 'none',
        text: cleanPageText,
        cues,
      });
    } else if (segments.length > 0) {
      const prev = segments[segments.length - 1];
      if (prev.expression === 'default' && initialExpression !== 'default') {
        prev.expression = initialExpression;
      }
      if (prev.emote === 'none' && primaryEmote !== 'none') {
        prev.emote = primaryEmote;
      }
    }
  }

  if (segments.length === 0) {
    return [
      {
        expression: enableExpressions ? carryOverExpression : 'default',
        emote: 'none',
        text: trimmed.replace(tagRegex, '').replace(PAGE_BREAK_SPLIT_REGEX, '').trim() || '……',
      },
    ];
  }

  return segments;
}

/**
 * Resolves the active standee expression and head emote at the current `typedCharCount`
 * within a bubble that may contain multiple in-sentence `[表情]` cues.
 */
export function resolveBubbleActiveCue(
  bubble:
    | {
        expression: StudioExpressionId;
        emote: BlueArchiveEmoteId;
        cues?: DialogueExpressionCue[];
      }
    | null
    | undefined,
  typedCharCount: number,
  isSpeakingNow: boolean,
): { expression: StudioExpressionId; emote: BlueArchiveEmoteId } {
  if (!bubble) {
    return { expression: 'default', emote: 'none' };
  }
  const cues = bubble.cues;
  if (!cues || cues.length === 0) {
    return {
      expression: bubble.expression || 'default',
      emote: bubble.emote || 'none',
    };
  }
  const effectiveOffset = isSpeakingNow ? typedCharCount : Number.MAX_SAFE_INTEGER;
  let activeExpr: StudioExpressionId =
    cues[0].charOffset === 0 && cues[0].expression && cues[0].expression !== 'default'
      ? cues[0].expression
      : bubble.expression || 'default';
  let activeEmote: BlueArchiveEmoteId =
    cues[0].charOffset === 0 ? cues[0].emote : 'none';

  for (const cue of cues) {
    if (cue.charOffset <= effectiveOffset) {
      if (cue.expression && cue.expression !== 'default') {
        activeExpr = cue.expression;
      }
      activeEmote = cue.emote;
    } else {
      break;
    }
  }

  return { expression: activeExpr, emote: activeEmote };
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
      return `[得分(10分)${emoteSuffix}] 哇，主人给《${anime.title}》直接拍了 <big>${tierLabel}</big> 耶！[笑] ${
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
      userImageNote: prev?.userImageNote,
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

  let lastAiExpression: StudioExpressionId = 'default';

  const getSegmentEndExpression = (seg: DialogueSegment): StudioExpressionId => {
    if (!enableExpressions) return 'default';
    if (seg.cues && seg.cues.length > 0) {
      for (let i = seg.cues.length - 1; i >= 0; i--) {
        if (seg.cues[i].expression && seg.cues[i].expression !== 'default') {
          return seg.cues[i].expression;
        }
      }
    }
    return seg.expression || 'default';
  };

  const appendBookend = (scene: StudioBookendScene, phase: 'opening' | 'finale') => {
    if (!scene.enabled) return;
    const { visibleText: cleanUserBookendText } = extractUserTextAndHiddenNotes(scene.userText);
    const userSegments = cleanUserBookendText ? parseDialogueSegments(cleanUserBookendText, enableExpressions, enableEmotes) : [];
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
      const idleAiExpr = enableExpressions
        ? lastAiExpression !== 'default'
          ? lastAiExpression
          : aiSegments[0]?.expression || 'default'
        : 'default';
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
          visible: Boolean(user),
          isTypingNow: speaker === 'user',
          text: user?.text || '',
          expression: user?.expression || 'default',
          emote: speaker === 'user' ? segment.emote : 'none',
          cues: user?.cues,
        },
        aiBubble: {
          visible: speaker === 'ai',
          isTypingNow: speaker === 'ai',
          text: speaker === 'ai' ? segment.text : '',
          expression: speaker === 'ai' ? segment.expression : idleAiExpr,
          emote: speaker === 'ai' ? segment.emote : 'none',
          cues: speaker === 'ai' ? segment.cues : undefined,
          segmentIndex: Math.max(0, index - userSegments.length),
          totalSegments: aiSegments.length,
        },
      });
      if (speaker === 'ai') {
        const endExpr = getSegmentEndExpression(segment);
        if (endExpr !== 'default') lastAiExpression = endExpr;
      }
    });
  };

  appendBookend(bookends.opening, 'opening');

  for (let wIdx = 0; wIdx < ordered.length; wIdx++) {
    const item = ordered[wIdx];
    const { visibleText: userText } = extractUserTextAndHiddenNotes(item.userText, item.userImageNote);
    const hasUserTurn = Boolean(userText || item.userImage);
    const hasAiDialogue = Boolean(item.aiRawText.trim());
    const userSegments = userText
      ? parseDialogueSegments(userText, enableExpressions, enableEmotes)
      : [];
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
        aiBubble: { visible: false, isTypingNow: false, text: '', expression: enableExpressions ? lastAiExpression : 'default', emote: 'none', segmentIndex: 0, totalSegments: 0 },
      });
      continue;
    }

    if (hasUserTurn) {
      const effectiveUserPages =
        userSegments.length > 0
          ? userSegments
          : [
              {
                expression: enableExpressions ? item.userExpression || '思考' : 'default',
                emote: enableEmotes ? item.userEmote || 'none' : 'none',
                text: '',
              },
            ];

      const idleAiExprWhileUserSpeaks = enableExpressions
        ? lastAiExpression !== 'default'
          ? lastAiExpression
          : aiSegments[0]?.expression && aiSegments[0].expression !== 'default'
            ? aiSegments[0].expression
            : 'default'
        : 'default';

      effectiveUserPages.forEach((uSeg, uIdx) => {
        const resolvedUserExpr = enableExpressions
          ? uSeg.expression !== 'default'
            ? uSeg.expression
            : item.userExpression || '思考'
          : 'default';
        const resolvedUserEmote = enableEmotes
          ? uSeg.emote !== 'none'
            ? uSeg.emote
            : item.userEmote || 'none'
          : 'none';

        steps.push({
          stepIndex: steps.length,
          workOrderIndex: wIdx,
          phase: 'work',
          activeWork: item,
          activeTargetScore: item.targetScore,
          isWorkEntryStep: uIdx === 0,
          rankedByTierSoFar: rankedAtThisWork,
          remainingPool: poolAtThisWork,
          speaker: 'user',
          userBubble: {
            visible: Boolean(uSeg.text),
            isTypingNow: Boolean(uSeg.text),
            text: uSeg.text,
            image: item.userImage,
            imageEffect: item.userImageEffect || 'pop',
            expression: resolvedUserExpr,
            emote: resolvedUserEmote,
            cues: uSeg.cues,
          },
          aiBubble: {
            visible: false,
            isTypingNow: false,
            text: '',
            expression: idleAiExprWhileUserSpeaks,
            emote: 'none',
            segmentIndex: 0,
            totalSegments: aiSegments.length,
          },
        });
      });

      const lastUserSeg = effectiveUserPages[effectiveUserPages.length - 1];
      const lastUserEndExpr = getSegmentEndExpression(lastUserSeg);
      const lastUserExpr = enableExpressions
        ? lastUserEndExpr !== 'default'
          ? lastUserEndExpr
          : item.userExpression || '思考'
        : 'default';

      aiSegments.forEach((seg, sIdx) => {
        const startsMidSentenceCue =
          sIdx === 0 && Boolean(seg.cues && seg.cues.length > 0 && seg.cues[0].charOffset > 0);
        const effectiveSegExpr = enableExpressions
          ? startsMidSentenceCue && lastAiExpression !== 'default'
            ? lastAiExpression
            : seg.expression !== 'default'
              ? seg.expression
              : lastAiExpression
          : 'default';
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
            visible: Boolean(lastUserSeg.text),
            isTypingNow: false,
            text: lastUserSeg.text,
            image: item.userImage,
            imageEffect: item.userImageEffect || 'pop',
            expression: lastUserExpr,
            emote: 'none',
            cues: lastUserSeg.cues,
          },
          aiBubble: {
            visible: true,
            isTypingNow: true,
            text: seg.text,
            expression: effectiveSegExpr,
            emote: seg.emote,
            cues: seg.cues,
            segmentIndex: sIdx,
            totalSegments: aiSegments.length,
          },
        });
        const endExpr = getSegmentEndExpression(seg);
        if (endExpr !== 'default') lastAiExpression = endExpr;
      });
    } else {
      aiSegments.forEach((seg, sIdx) => {
        const startsMidSentenceCue =
          sIdx === 0 && Boolean(seg.cues && seg.cues.length > 0 && seg.cues[0].charOffset > 0);
        const effectiveSegExpr = enableExpressions
          ? startsMidSentenceCue && lastAiExpression !== 'default'
            ? lastAiExpression
            : seg.expression !== 'default'
              ? seg.expression
              : lastAiExpression
          : 'default';
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
            expression: effectiveSegExpr,
            emote: seg.emote,
            cues: seg.cues,
            segmentIndex: sIdx,
            totalSegments: aiSegments.length,
          },
        });
        const endExpr = getSegmentEndExpression(seg);
        if (endExpr !== 'default') lastAiExpression = endExpr;
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
export function getStudioWorldBookEntries(entries?: WorldBookEntry[], enabledIds: string[] = DEFAULT_STUDIO_PROMPT_RULES_CONFIG.enabledWorldBookIds): WorldBookEntry[] {
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
    enabledWorldBookIds = DEFAULT_STUDIO_PROMPT_RULES_CONFIG.enabledWorldBookIds,
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

    const { visibleText, hiddenNotes } = extractUserTextAndHiddenNotes(
      item.userText,
      item.userImageNote,
    );
    const hasVisualOrHiddenNote = Boolean(item.userImage || hiddenNotes.length > 0);
    const visualNoteLine = hasVisualOrHiddenNote
      ? `- UP主晒出的配图/画面暗注(请自然假装你亲眼看到了这张配图或心领神会该备注，直接在台词中与画面内容互动吐槽，切勿说“根据备注/文字提示”暴露机制): "${
          hiddenNotes.length > 0 ? hiddenNotes.join('；') : 'UP主在此处展示了一张与本作相关的配图'
        }"`
      : '';

    return [
      `### 【出场顺位 #${idx + 1}】 ANIME_ID=${anime.id} 《${anime.title}》`,
      `- UP主最终打分: ${tierDisplay}${deltaStr} | BGM评分: ${anime.bgmScore ?? '未知'} (排名: ${anime.bgmRank ?? '未知'})`,
      staffParts.length > 0 ? `- 信息和班底: ${staffParts.join(' | ')}` : '',
      visibleText
        ? `- UP主本人的先行吐槽(你需要直接接他的话互动/拆台/附和): "${visibleText}"`
        : `- UP主本人未写台词(请由你单人控场锐评这部作品与UP主的给分)`,
      visualNoteLine,
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

  const expandRulePlaceholders = (raw: string) =>
    raw
      .replace(/\{\{\s*EXPRESSION_LIST\s*\}\}/g, exprListText)
      .replace(/\{\{\s*EMOTE_LIST\s*\}\}/g, emoteListText)
      .replace(/\{\{\s*TOTAL_WORKS\s*\}\}/g, String(ordered.length));

  const resolvedExpressionBlock =
    enableExpressions || enableEmotes
      ? expandRulePlaceholders(expressionRuleTemplate)
      : '【输出文本规范】：直接输出纯文本简短口语吐槽（约 30～65 字），无需添加任何中括号表情或漫符标记。';

  const resolvedTimelineBlock = expandRulePlaceholders(
    normalizeStudioTimelineRuleTemplate(timelineRuleTemplate),
  );

  const bookendContext = (['opening', 'ending'] as const)
    .filter(key => bookends[key].enabled)
    .map(key => {
      const { visibleText, hiddenNotes } = extractUserTextAndHiddenNotes(bookends[key].userText);
      const label = key === 'opening' ? '开场' : '收尾';
      const noteSuffix = hiddenNotes.length > 0 ? `（画面/暗注：${hiddenNotes.join('；')}）` : '';
      return `${label} UP主台词：${visibleText || '（留空，由你控场）'}${noteSuffix}`;
    })
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
  return normalizeReportMarkup(assemblePositionedPrompt(companion.prompt || FEIYU_STUDIO_PERSONA_PROMPT, context, [
    ...enabledWb,
    ...(resolvedExpressionBlock.trim()
      ? [{ id: 'studio-expression-rules', title: '表情差分与漫符规则', enabled: true, ...normalizePromptPlacement(expressionRulePlacement), content: resolvedExpressionBlock }]
      : []),
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
