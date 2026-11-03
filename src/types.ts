export type TierScore =
  | 10
  | 9.5
  | 9
  | 8.5
  | 8
  | 7.5
  | 7
  | 6.5
  | 6
  | 5.5
  | 5
  | 4.5
  | 4
  | 3.5
  | 3
  | 2.5
  | 2
  | 1.5
  | 1;

export type TierGradingSystem = 'numeric' | 'letter';

export type SubjectCategory = 'anime' | 'book' | 'game';

export interface AnimeCharacterInfo {
  id: number;
  name: string;
  nameCn?: string;
  relation?: string; // 主角 / 配角
  cv?: string;
  avatar?: string;
  summary?: string;
  collects?: number; // 角色被收藏人数
  commentCount?: number; // 角色评论数
  topComments?: string[]; // 角色页面下的网友热评
}

export interface BgmNetizenComment {
  user: string;
  rate?: number;
  status?: string; // 看过 / 抛弃 / 在看
  comment: string;
}

export interface AnimeItem {
  id: number;
  title: string;
  originalTitle?: string;
  cover: string;
  airDate?: string;
  bgmScore?: number;
  bgmRank?: number;
  eps?: number;
  volumes?: number;
  summary?: string;
  tags?: string[];
  tagsWithCount?: Array<{ name: string; count: number }>;
  studio?: string;
  director?: string;
  scriptWriter?: string;
  originalWork?: string;
  author?: string;
  illustrator?: string;
  publisher?: string;
  platform?: string;
  collectionStats?: {
    wish?: number;
    collect?: number;
    doing?: number;
    on_hold?: number;
    dropped?: number;
  };
  ratingTotal?: number;
  ratingCounts?: Record<string, number>;
  characters?: AnimeCharacterInfo[];
  bgmNetizenComments?: BgmNetizenComment[];
  deepEnriched?: boolean;
  deepDataVersion?: number;
  discussionStatus?: {
    subject: 'ok' | 'unavailable';
    charactersRequested: number;
    charactersFetched: number;
    updatedAt: number;
  };
  isCustom?: boolean;
  category?: SubjectCategory;
  userBgmRate?: number;
  userBgmComment?: string;
  bgmUpdatedAt?: string;
  originalNumericScore?: TierScore;
}

export type TierMap = Record<string, AnimeItem[]>;

export type CommentCardStyle = 1 | 2 | 3 | 4 | 5 | 6;

export interface CommentItem {
  id: string;
  animeId: number;
  animeTitle: string;
  animeCover: string;
  tierScore: TierScore;
  text: string;
  cardStyle: CommentCardStyle;
  updatedAt: number;
}

export type BuiltInAIRoleId = 'mesugaki' | 'cat_girl' | 'atri' | 'patrick_star' | 'feiyu';

export type AIRoleId = string;

export type AIKnowledgePackId = 'studios' | 'creators' | 'memes' | 'seiyuu';

export interface AIRoleConfig {
  id: AIRoleId;
  displayName: string;
  avatarUrl: string;
  prompt: string;
  isCustom?: boolean;
}

export type PromptPosition = 'before-character' | 'after-character' | 'd0';
export type WorldBookScope = 'all' | 'report' | 'studio';

export interface PromptPlacement {
  position: PromptPosition;
  priority: number;
}

export interface WorldBookEntry {
  id: string;
  title: string;
  shortDesc?: string;
  content: string;
  enabled: boolean;
  position?: PromptPosition;
  /** Ascending within each position; larger values appear later. */
  priority?: number;
  scope?: WorldBookScope;
  /** Read only when migrating old backups. No entry is locked. */
  isLockedD0?: boolean;
}

export interface AIConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  availableModels?: string[];
  selectedPersonaId?: string;
  personas?: AIRoleConfig[];
  worldBookEntries?: WorldBookEntry[];
  d0Prompt?: string;
}

export type TierRowStyle = 'ambient-glass' | 'minimal-blur' | 'floating-split' | 'pure-transparent';

export interface BangumiSyncConfig {
  token: string;
  username?: string;
  nickname?: string;
  avatar?: string;
  avatarUrl?: string;
  lastSyncedAt?: number;
}

export interface ThemeOption {
  id: string;
  name: string;
  previewGradient: string;
  backgroundCss: string;
  orbs?: [string, string, string, string];
}
