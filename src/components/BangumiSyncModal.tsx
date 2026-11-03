import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  RefreshCw,
  Check,
  KeyRound,
  UserCheck,
  Tv,
  BookOpen,
  Gamepad2,
  Inbox,
  Sparkles,
  Loader2,
  CheckSquare,
  Square,
  Clock,
  CloudUpload,
  CloudDownload,
  User,
  MessageSquareText,
} from 'lucide-react';
import type {
  AnimeItem,
  BangumiSyncConfig,
  CommentItem,
  SubjectCategory,
  TierGradingSystem,
  TierMap,
  TierScore,
} from '../types';
import {
  DEFAULT_USER_BGM_TOKEN,
  fetchBangumiUserCollections,
  pushBangumiUserCollection,
  type BangumiCollectionStatusType,
} from '../lib/bangumiApi';
import { ALL_TIER_SCORES, formatTierBadgeText } from '../lib/tierLogic';

export type BgmSyncTabMode = 'pull' | 'push';

interface BangumiSyncModalProps {
  isOpen: boolean;
  initialTab?: BgmSyncTabMode;
  syncConfig: BangumiSyncConfig;
  onUpdateSyncConfig: (updater: (prev: BangumiSyncConfig) => BangumiSyncConfig) => void;
  existingIds: Set<number>;
  tiers?: TierMap;
  comments?: CommentItem[];
  gradingSystem?: TierGradingSystem;
  onImportToPool: (
    items: AnimeItem[],
    options: { autoPlaceByBgmRate: boolean; importBgmComments: boolean },
  ) => void;
  onPushSuccess?: (message: string) => void;
  onClose: () => void;
}

const SUBJECT_TYPE_OPTIONS: Array<{
  type: 2 | 1 | 4;
  category: SubjectCategory;
  label: string;
  icon: React.ReactNode;
}> = [
  { type: 2, category: 'anime', label: '动画 (Anime)', icon: <Tv className="w-3.5 h-3.5" /> },
  { type: 1, category: 'book', label: '书籍/轻小说/漫画', icon: <BookOpen className="w-3.5 h-3.5" /> },
  { type: 4, category: 'game', label: '游戏 (Game)', icon: <Gamepad2 className="w-3.5 h-3.5" /> },
];

const COLLECTION_TYPE_OPTIONS: Array<{
  type: 3 | 2 | 1;
  label: string;
  desc: string;
}> = [
  { type: 3, label: '在看 / 在玩 / 在读', desc: '正在追的番剧、阅读的书籍或正在玩的游戏' },
  { type: 2, label: '看过 / 玩过 / 读过', desc: '已看完、读完或通关的作品' },
  { type: 1, label: '想看 / 想玩 / 想读', desc: '计划列表中的作品' },
];

const PUSH_STATUS_OPTIONS: Array<{
  type: BangumiCollectionStatusType;
  label: string;
  shortLabel: string;
  desc: string;
}> = [
  { type: 2, label: '看过 / 玩过 / 读过', shortLabel: '看过/玩过/读过', desc: '标记为已完成并同步打分' },
  { type: 3, label: '在看 / 在玩 / 在读', shortLabel: '在看/在玩/在读', desc: '标记为正在追并同步打分' },
  { type: 1, label: '想看 / 想玩 / 想读', shortLabel: '想看/想玩/想读', desc: '标记为想看/想玩/想读' },
  { type: 4, label: '搁置', shortLabel: '搁置', desc: '标记为暂时搁置' },
  { type: 5, label: '抛弃', shortLabel: '抛弃', desc: '标记为弃番/弃坑' },
];

const DAYS_PRESETS: Array<{ days: number; label: string }> = [
  { days: 30, label: '最近 30 天' },
  { days: 100, label: '最近 100 天 (一季)' },
  { days: 180, label: '最近半年' },
  { days: 365, label: '最近一年' },
  { days: 0, label: '不限时间' },
];

function getItemStatusActionLabel(category: SubjectCategory | undefined, type: BangumiCollectionStatusType): string {
  const verb = category === 'game' ? '玩' : category === 'book' ? '读' : '看';
  if (type === 2) return `${verb}过`;
  if (type === 3) return `在${verb}`;
  if (type === 1) return `想${verb}`;
  if (type === 4) return '搁置';
  return '抛弃';
}

export const BangumiSyncModal: React.FC<BangumiSyncModalProps> = ({
  isOpen,
  initialTab = 'pull',
  syncConfig,
  onUpdateSyncConfig,
  existingIds,
  tiers = {},
  comments = [],
  gradingSystem = 'numeric',
  onImportToPool,
  onPushSuccess,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<BgmSyncTabMode>(initialTab);

  // Pull state
  const [customUsernameInput, setCustomUsernameInput] = useState<string>('');
  const [selectedSubjectTypes, setSelectedSubjectTypes] = useState<Array<2 | 1 | 4>>([2]);
  const [selectedCollectionTypes, setSelectedCollectionTypes] = useState<Array<3 | 2 | 1>>([3, 2]);
  const [daysLimit, setDaysLimit] = useState<number>(100);
  const [limitPerType, setLimitPerType] = useState<number>(36);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedItems, setFetchedItems] = useState<AnimeItem[]>([]);
  const [totalBeforeDateFilter, setTotalBeforeDateFilter] = useState<number>(0);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set());
  const [autoPlaceByBgmRate, setAutoPlaceByBgmRate] = useState<boolean>(false);
  const [importBgmComments, setImportBgmComments] = useState<boolean>(true);

  // Push (Tier List -> Bangumi) state
  const [defaultPushType, setDefaultPushType] = useState<BangumiCollectionStatusType>(2);
  const [perItemPushType, setPerItemPushType] = useState<Record<number, BangumiCollectionStatusType>>({});
  const [pushSelectedIds, setPushSelectedIds] = useState<Set<number>>(new Set());
  const [syncRateToBgm, setSyncRateToBgm] = useState<boolean>(true);
  const [halfScoreMode, setHalfScoreMode] = useState<'round' | 'floor'>('round');
  const [syncCommentToBgm, setSyncCommentToBgm] = useState<boolean>(true);
  const [isPushingBatch, setIsPushingBatch] = useState<boolean>(false);
  const [pushProgress, setPushProgress] = useState<{ done: number; total: number } | null>(null);
  const [itemPushResults, setItemPushResults] = useState<
    Record<number, { status: 'ok' | 'err'; text: string }>
  >({});

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Collect all valid Bangumi items currently ranked on the Tier List
  const rankedBoardItems = useMemo(() => {
    const commentMap = new Map<number, string>();
    for (const c of comments) {
      if (
        c &&
        c.animeId > 0 &&
        c.text?.trim() &&
        !String(c.id || '').startsWith('demo-c-')
      ) {
        commentMap.set(c.animeId, c.text.trim());
      }
    }

    const list: Array<{
      anime: AnimeItem;
      tierScore: TierScore;
      bgmIntRate: number;
      userComment?: string;
    }> = [];

    for (const score of ALL_TIER_SCORES) {
      const rowItems = tiers[String(score)] || [];
      for (const anime of rowItems) {
        if (!anime || anime.isCustom || !anime.id || anime.id <= 0) continue;
        const intRate =
          halfScoreMode === 'floor'
            ? Math.max(1, Math.min(10, Math.floor(score)))
            : Math.max(1, Math.min(10, Math.round(score)));
        list.push({
          anime,
          tierScore: score,
          bgmIntRate: intRate,
          userComment: commentMap.get(anime.id) || anime.userBgmComment,
        });
      }
    }
    return list;
  }, [tiers, comments, halfScoreMode]);

  // Initialize selection when opening Push tab
  useEffect(() => {
    if (isOpen && rankedBoardItems.length > 0 && pushSelectedIds.size === 0) {
      setPushSelectedIds(new Set(rankedBoardItems.map(entry => entry.anime.id)));
    }
  }, [isOpen, rankedBoardItems.length]);

  useEffect(() => {
    if (isOpen && activeTab === 'pull' && fetchedItems.length === 0 && syncConfig.token.trim()) {
      handleFetchCollections(selectedSubjectTypes, selectedCollectionTypes, daysLimit);
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const toggleSubjectType = (t: 2 | 1 | 4) => {
    setSelectedSubjectTypes(prev =>
      prev.includes(t) ? (prev.length > 1 ? prev.filter(x => x !== t) : prev) : [...prev, t],
    );
  };

  const toggleCollectionType = (t: 3 | 2 | 1) => {
    setSelectedCollectionTypes(prev =>
      prev.includes(t) ? (prev.length > 1 ? prev.filter(x => x !== t) : prev) : [...prev, t],
    );
  };

  const handleFetchCollections = async (
    sTypes = selectedSubjectTypes,
    cTypes = selectedCollectionTypes,
    dLimit = daysLimit,
  ) => {
    const token = syncConfig.token.trim();
    const explicitUser = customUsernameInput.trim();
    if (!token && !explicitUser) {
      setError('请填写 Bangumi Access Token 或输入 Bangumi 用户名/UID');
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      const res = await fetchBangumiUserCollections({
        token,
        username: explicitUser || undefined,
        subjectTypes: sTypes,
        collectionTypes: cTypes,
        limit: limitPerType,
        daysLimit: dLimit,
      });

      onUpdateSyncConfig(prev => ({
        ...prev,
        username: res.user.username,
        nickname: res.user.nickname,
        avatar: res.user.avatar,
        lastSyncedAt: Date.now(),
      }));

      setFetchedItems(res.data);
      setTotalBeforeDateFilter(res.totalBeforeDateFilter);
      const freshIds = res.data.filter(i => !existingIds.has(i.id)).map(i => i.id);
      setSelectedItemIds(new Set(freshIds.length > 0 ? freshIds : res.data.map(i => i.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : '拉取 Bangumi 收藏失败');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelectItem = (id: number) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedItemIds.size === fetchedItems.length) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(fetchedItems.map(i => i.id)));
    }
  };

  const handleConfirmImport = () => {
    const chosen = fetchedItems.filter(i => selectedItemIds.has(i.id));
    if (chosen.length === 0) return;
    onImportToPool(chosen, { autoPlaceByBgmRate, importBgmComments });
    onClose();
  };

  // Push Tab Helpers
  const getEffectivePushType = (animeId: number): BangumiCollectionStatusType => {
    return perItemPushType[animeId] ?? defaultPushType;
  };

  const handleApplyGlobalPushType = (newType: BangumiCollectionStatusType) => {
    setDefaultPushType(newType);
    setPerItemPushType({});
  };

  const handleToggleItemPushSelection = (animeId: number) => {
    setPushSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(animeId)) next.delete(animeId);
      else next.add(animeId);
      return next;
    });
  };

  const handleToggleAllPushSelection = () => {
    if (pushSelectedIds.size === rankedBoardItems.length) {
      setPushSelectedIds(new Set());
    } else {
      setPushSelectedIds(new Set(rankedBoardItems.map(x => x.anime.id)));
    }
  };

  const handleBatchPushToBangumi = async () => {
    const token = syncConfig.token.trim();
    if (!token) {
      setError('同步回写到 Bangumi 需要填写你的个人 Access Token（可在 next.bgm.tv/demo/access-token 生成）');
      return;
    }

    const targets = rankedBoardItems.filter(entry => pushSelectedIds.has(entry.anime.id));
    if (targets.length === 0 || isPushingBatch) return;

    setError(null);
    setIsPushingBatch(true);
    setPushProgress({ done: 0, total: targets.length });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < targets.length; i++) {
      const entry = targets[i];
      const statusType = getEffectivePushType(entry.anime.id);
      const statusLabel = getItemStatusActionLabel(entry.anime.category, statusType);

      try {
        await pushBangumiUserCollection({
          token,
          subjectId: entry.anime.id,
          type: statusType,
          rate: syncRateToBgm ? entry.bgmIntRate : undefined,
          comment: syncCommentToBgm && entry.userComment ? entry.userComment : undefined,
        });
        successCount++;
        setItemPushResults(prev => ({
          ...prev,
          [entry.anime.id]: {
            status: 'ok',
            text: `✓ 已标记「${statusLabel}」${syncRateToBgm ? ` · ${entry.bgmIntRate}分` : ''}`,
          },
        }));
      } catch (err) {
        failCount++;
        setItemPushResults(prev => ({
          ...prev,
          [entry.anime.id]: {
            status: 'err',
            text: err instanceof Error ? err.message.slice(0, 32) : '同步失败',
          },
        }));
      }

      setPushProgress({ done: i + 1, total: targets.length });
      if (i + 1 < targets.length) {
        await new Promise(r => setTimeout(r, 180));
      }
    }

    setIsPushingBatch(false);
    if (successCount > 0) {
      onPushSuccess?.(
        `已成功将 ${successCount} 部作品的排榜评分与点格子状态同步到 Bangumi${
          failCount > 0 ? `（${failCount} 部失败）` : '！'
        }`,
      );
    }
  };

  return (
    <div
      role="dialog"
      data-testid="bgm-sync-modal"
      aria-modal="true"
      aria-labelledby="bgm-sync-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-[24px] bg-[#111114] border border-white/[0.1] shadow-[0_24px_80px_rgba(0,0,0,0.85)] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header with Two-Way Sync Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-white/[0.07] bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/[0.07] border border-white/[0.1] flex items-center justify-center text-white">
              <RefreshCw className="w-4 h-4" />
            </div>
            <div>
              <h2 id="bgm-sync-modal-title" className="text-base font-bold text-white tracking-tight">
                Bangumi 双向同步中心
              </h2>
              <p className="text-xs text-white/45">
                支持从 BGM 拉取追番表，或将排好的 Tier List 批量回写到 BGM 自动打分与点格子
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Segmented Pull / Push Mode Switcher */}
            <div className="inline-flex p-1 rounded-xl bg-black/60 border border-white/[0.09]">
              <button
                type="button"
                data-testid="bgm-tab-pull"
                onClick={() => {
                  setActiveTab('pull');
                  setError(null);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'pull'
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-white/65 hover:text-white'
                }`}
              >
                <CloudDownload className="w-3.5 h-3.5" />
                <span>从 BGM 拉取</span>
              </button>

              <button
                type="button"
                data-testid="bgm-tab-push"
                onClick={() => {
                  setActiveTab('push');
                  setError(null);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'push'
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-white/65 hover:text-white'
                }`}
              >
                <CloudUpload className="w-3.5 h-3.5" />
                <span>排榜同步回 BGM ({rankedBoardItems.length})</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="关闭同步窗口"
              className="p-1.5 text-white/50 hover:text-white hover:bg-white/[0.08] rounded-full cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Account & Token Card (Shared across Pull & Push) */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {syncConfig.avatar ? (
                  <img
                    src={syncConfig.avatar}
                    alt={syncConfig.nickname || 'BGM User'}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-full object-cover border border-white/20"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-white/[0.08] border border-white/[0.12] flex items-center justify-center text-white/70">
                    <UserCheck className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <span className="text-sm font-bold text-white block">
                    {syncConfig.nickname
                      ? `${syncConfig.nickname} (@${syncConfig.username})`
                      : 'Bangumi 个人账号授权'}
                  </span>
                  <p className="text-xs text-white/45 mt-0.5">
                    {activeTab === 'push'
                      ? '回写打分与点格子需使用你本人的 Bangumi Access Token'
                      : '支持使用 Token（含 R18 权限）或直接输入任意用户名/UID 拉取'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-start sm:self-auto">
                <a
                  href="https://next.bgm.tv/demo/access-token"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-white/55 hover:text-white underline"
                >
                  获取个人 Token
                </a>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSyncConfig(prev => ({
                      ...prev,
                      token: DEFAULT_USER_BGM_TOKEN,
                    }))
                  }
                  className="text-xs text-white/50 hover:text-white underline cursor-pointer"
                >
                  重置为默认 Token
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <KeyRound className="w-3.5 h-3.5 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  aria-label="Bangumi Access Token"
                  value={syncConfig.token}
                  onChange={e =>
                    onUpdateSyncConfig(prev => ({ ...prev, token: e.target.value }))
                  }
                  placeholder="粘贴你的 Bangumi Access Token..."
                  className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-black/50 border border-white/[0.1] text-xs font-mono text-white placeholder:text-white/30 focus:outline-none focus:border-white/35"
                />
              </div>

              {activeTab === 'pull' && (
                <div className="relative sm:w-56">
                  <User className="w-3.5 h-3.5 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    aria-label="指定 Bangumi 用户名或 UID"
                    value={customUsernameInput}
                    onChange={e => setCustomUsernameInput(e.target.value)}
                    placeholder="指定用户名/UID (朋友免Token)"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/50 border border-white/[0.1] text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-white/35"
                  />
                </div>
              )}

              {activeTab === 'pull' && (
                <button
                  type="button"
                  data-testid="fetch-bgm-collections-btn"
                  onClick={() => handleFetchCollections()}
                  disabled={isLoading}
                  className="inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>正在同步...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>拉取点格子记录</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Pull-specific Filters */}
            {activeTab === 'pull' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-3 border-t border-white/[0.06]">
                  <div className="md:col-span-6">
                    <span className="block text-[11px] font-medium text-white/50 mb-1.5">
                      条目类型 (可多选):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {SUBJECT_TYPE_OPTIONS.map(opt => {
                        const active = selectedSubjectTypes.includes(opt.type);
                        return (
                          <button
                            key={opt.type}
                            type="button"
                            onClick={() => toggleSubjectType(opt.type)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                              active
                                ? 'bg-white text-zinc-950 border-white shadow-xs'
                                : 'bg-white/[0.04] text-white/70 border-white/[0.08] hover:bg-white/[0.09]'
                            }`}
                          >
                            {opt.icon}
                            <span>{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="md:col-span-6">
                    <span className="block text-[11px] font-medium text-white/50 mb-1.5">
                      收藏状态 (可多选):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {COLLECTION_TYPE_OPTIONS.map(opt => {
                        const active = selectedCollectionTypes.includes(opt.type);
                        return (
                          <button
                            key={opt.type}
                            type="button"
                            onClick={() => toggleCollectionType(opt.type)}
                            title={opt.desc}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                              active
                                ? 'bg-white text-zinc-950 border-white shadow-xs'
                                : 'bg-white/[0.04] text-white/70 border-white/[0.08] hover:bg-white/[0.09]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 点格子时间范围 (updated_at) Filter Row */}
                <div className="pt-3 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-white/50 mr-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>点格子时间:</span>
                    </span>
                    {DAYS_PRESETS.map(preset => {
                      const active = daysLimit === preset.days;
                      return (
                        <button
                          key={preset.days}
                          type="button"
                          onClick={() => {
                            setDaysLimit(preset.days);
                            handleFetchCollections(selectedSubjectTypes, selectedCollectionTypes, preset.days);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                            active
                              ? 'bg-white text-zinc-950 border-white'
                              : 'bg-white/[0.04] text-white/65 border-white/[0.08] hover:bg-white/[0.09]'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2">
                    <label htmlFor="custom-days-input" className="text-[11px] text-white/45 whitespace-nowrap">
                      自定义天数:
                    </label>
                    <input
                      id="custom-days-input"
                      type="number"
                      min={0}
                      max={3650}
                      value={daysLimit}
                      onChange={e => setDaysLimit(Math.max(0, Number(e.target.value) || 0))}
                      className="w-20 px-2.5 py-1 rounded-lg bg-black/50 border border-white/[0.1] text-xs font-mono text-white text-center focus:outline-none focus:border-white/35"
                    />
                    <span className="text-[11px] text-white/40">天内 (0=不限)</span>
                  </div>
                </div>
              </>
            )}

            {/* Push-specific Controls: Choose 在看/在玩/在读 vs 看过/玩过/读过 + Score/Comment Options */}
            {activeTab === 'push' && (
              <div className="pt-3 border-t border-white/[0.06] space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div>
                    <span className="block text-xs font-bold text-white">
                      1. 选择批量同步到 BGM 的点格子状态（也可在下方卡片上单独修改某部作品）：
                    </span>
                    <span className="text-[11px] text-white/45">
                      例如：已完结作品选「看过 / 玩过 / 读过」，当季连载新番选「在看 / 在玩 / 在读」
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {PUSH_STATUS_OPTIONS.map(opt => {
                      const active =
                        defaultPushType === opt.type && Object.keys(perItemPushType).length === 0;
                      return (
                        <button
                          key={opt.type}
                          type="button"
                          data-testid={`push-status-preset-${opt.type}`}
                          onClick={() => handleApplyGlobalPushType(opt.type)}
                          title={opt.desc}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                            active
                              ? 'bg-white text-zinc-950 border-white shadow-xs'
                              : 'bg-white/[0.05] text-white/75 border-white/[0.1] hover:bg-white/[0.1]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2.5 border-t border-white/[0.05] flex flex-wrap items-center justify-between gap-3 text-xs text-white/80">
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={syncRateToBgm}
                        onChange={e => setSyncRateToBgm(e.target.checked)}
                        className="rounded border-white/20"
                      />
                      <span className="font-semibold text-white">
                        同步当前 Tier 分数作为 BGM 打分 (1-10分)
                      </span>
                    </label>

                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={syncCommentToBgm}
                        onChange={e => setSyncCommentToBgm(e.target.checked)}
                        className="rounded border-white/20"
                      />
                      <span>同时同步我在榜单撰写的个人短评到 BGM 吐槽</span>
                    </label>
                  </div>

                  {syncRateToBgm && (
                    <div className="flex items-center gap-1.5 text-[11px] text-white/55">
                      <span>0.5 半分档折算:</span>
                      <button
                        type="button"
                        onClick={() => setHalfScoreMode('round')}
                        className={`px-2 py-0.5 rounded-md border cursor-pointer ${
                          halfScoreMode === 'round'
                            ? 'bg-white/15 text-white border-white/30 font-semibold'
                            : 'border-white/10 text-white/50 hover:text-white/80'
                        }`}
                      >
                        四舍五入 (9.5→10)
                      </button>
                      <button
                        type="button"
                        onClick={() => setHalfScoreMode('floor')}
                        className={`px-2 py-0.5 rounded-md border cursor-pointer ${
                          halfScoreMode === 'floor'
                            ? 'bg-white/15 text-white border-white/30 font-semibold'
                            : 'border-white/10 text-white/50 hover:text-white/80'
                        }`}
                      >
                        向下取整 (9.5→9)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200">
              {error}
            </div>
          )}

          {/* TAB 1: PULL FROM BANGUMI */}
          {activeTab === 'pull' && (
            <>
              {isLoading ? (
                <div className="py-16 flex flex-col items-center justify-center gap-3 text-white/55">
                  <Loader2 className="w-7 h-7 animate-spin text-white" />
                  <p className="text-sm">正在拉取你在 Bangumi 的点格子记录...</p>
                </div>
              ) : fetchedItems.length === 0 ? (
                <div className="py-14 px-4 text-center rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.015] space-y-3">
                  <Sparkles className="w-7 h-7 text-white/30 mx-auto" />
                  {daysLimit > 0 && totalBeforeDateFilter > 0 ? (
                    <>
                      <p className="text-sm text-white/80 font-medium">
                        最近 {daysLimit} 天内没有符合条件的点格子记录
                      </p>
                      <p className="text-xs text-white/45">
                        但在更早的时间里找到了 {totalBeforeDateFilter} 部记录（例如你之前标记过的作品）
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setDaysLimit(0);
                          handleFetchCollections(selectedSubjectTypes, selectedCollectionTypes, 0);
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-zinc-950 text-xs font-bold cursor-pointer hover:bg-zinc-200 transition-colors"
                      >
                        <span>切换为「不限时间」查看全部 {totalBeforeDateFilter} 部作品</span>
                      </button>
                    </>
                  ) : (
                    <p className="text-sm text-white/75 font-medium">
                      点击上方「拉取点格子记录」获取你的追番 / 读书 / 游戏列表
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleSelectAll}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/85 hover:text-white cursor-pointer"
                      >
                        {selectedItemIds.size === fetchedItems.length ? (
                          <CheckSquare className="w-4 h-4 text-white" />
                        ) : (
                          <Square className="w-4 h-4 text-white/50" />
                        )}
                        <span>
                          全选 / 反选 ({selectedItemIds.size} / {fetchedItems.length})
                        </span>
                      </button>
                      {daysLimit > 0 && totalBeforeDateFilter > fetchedItems.length && (
                        <button
                          type="button"
                          onClick={() => {
                            setDaysLimit(0);
                            handleFetchCollections(selectedSubjectTypes, selectedCollectionTypes, 0);
                          }}
                          className="text-[11px] text-white/45 hover:text-white underline cursor-pointer"
                        >
                          已过滤掉 {totalBeforeDateFilter - fetchedItems.length} 部超过 {daysLimit}{' '}
                          天的旧记录 · 点击显示全部
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-white/75">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={autoPlaceByBgmRate}
                          onChange={e => setAutoPlaceByBgmRate(e.target.checked)}
                          className="rounded border-white/20"
                        />
                        <span>若在 BGM 已打分，直接排入对应分档（未打分入候选池）</span>
                      </label>

                      <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={importBgmComments}
                          onChange={e => setImportBgmComments(e.target.checked)}
                          className="rounded border-white/20"
                        />
                        <span>同时导入我在 BGM 写的吐槽短评</span>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-4 pt-1">
                    {fetchedItems.map(item => {
                      const isSelected = selectedItemIds.has(item.id);
                      const alreadyInBoard = existingIds.has(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggleSelectItem(item.id)}
                          className={`group relative flex flex-col items-center text-center transition-all duration-200 cursor-pointer ${
                            isSelected
                              ? 'opacity-100'
                              : 'opacity-40 hover:opacity-75 scale-[0.97]'
                          }`}
                        >
                          <div
                            className={`relative w-full aspect-[5/7] rounded-[10px] bg-zinc-900 overflow-hidden shadow-[0_8px_20px_rgba(0,0,0,0.5)] transition-all ${
                              isSelected
                                ? 'ring-2 ring-white border border-white/20'
                                : 'border border-white/[0.07]'
                            }`}
                          >
                            <img
                              src={item.cover}
                              alt={item.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />

                            <div
                              className={`absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                                isSelected
                                  ? 'bg-white text-zinc-950 shadow-md scale-100'
                                  : 'bg-black/55 text-transparent border border-white/30 scale-90'
                              }`}
                            >
                              <Check className="w-3 h-3 stroke-[3]" />
                            </div>

                            {(item.userBgmRate || item.bgmScore) && (
                              <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-md border border-white/10 text-[10px] font-mono text-white/85 tabular-nums">
                                {item.userBgmRate ? `${item.userBgmRate}分` : item.bgmScore}
                              </div>
                            )}
                          </div>

                          <p
                            className="mt-2 w-full text-xs font-medium text-white/90 text-center truncate px-0.5"
                            title={item.title}
                          >
                            {item.title}
                          </p>
                          <span className="text-[10.5px] text-white/40 font-mono mt-0.5">
                            {alreadyInBoard
                              ? '已在列表中'
                              : item.bgmUpdatedAt
                              ? item.bgmUpdatedAt.slice(0, 10)
                              : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* TAB 2: PUSH TIER LIST TO BANGUMI (打分 + 点格子) */}
          {activeTab === 'push' && (
            <>
              {rankedBoardItems.length === 0 ? (
                <div className="py-14 px-4 text-center rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.015] space-y-2">
                  <CloudUpload className="w-7 h-7 text-white/30 mx-auto" />
                  <p className="text-sm text-white/80 font-medium">
                    当前 Tier List 榜单上还没有可同步的 Bangumi 作品
                  </p>
                  <p className="text-xs text-white/45">
                    请先将待排候选池或搜索到的作品拖入 10–1 分档位，再来一键回写打分与点格子
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={handleToggleAllPushSelection}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/85 hover:text-white cursor-pointer"
                    >
                      {pushSelectedIds.size === rankedBoardItems.length ? (
                        <CheckSquare className="w-4 h-4 text-white" />
                      ) : (
                        <Square className="w-4 h-4 text-white/50" />
                      )}
                      <span>
                        全选 / 反选 ({pushSelectedIds.size} / {rankedBoardItems.length} 部上榜作品)
                      </span>
                    </button>

                    <span className="text-[11px] text-white/45">
                      提示：点击卡片下方「看过 / 在看」按钮可单独切换某一部作品的点格子状态
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3.5 pt-1">
                    {rankedBoardItems.map(({ anime, tierScore, bgmIntRate, userComment }) => {
                      const isSelected = pushSelectedIds.has(anime.id);
                      const itemType = getEffectivePushType(anime.id);
                      const verb =
                        anime.category === 'game' ? '玩' : anime.category === 'book' ? '读' : '看';
                      const pushResult = itemPushResults[anime.id];

                      return (
                        <div
                          key={anime.id}
                          className={`flex flex-col rounded-2xl p-2.5 bg-white/[0.025] border transition-all ${
                            isSelected
                              ? 'border-white/25 opacity-100'
                              : 'border-white/[0.06] opacity-45 hover:opacity-75'
                          }`}
                        >
                          {/* Poster Clickable Selection Area */}
                          <div
                            onClick={() => handleToggleItemPushSelection(anime.id)}
                            className="relative w-full aspect-[3/4] rounded-xl overflow-hidden bg-zinc-900 cursor-pointer group"
                          >
                            <img
                              src={anime.cover}
                              alt={anime.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />

                            {/* Top-Left Tier & BGM Score Badge */}
                            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-black/80 backdrop-blur-md border border-white/15 text-[11px] font-mono font-bold text-white shadow-md">
                              {formatTierBadgeText(tierScore, gradingSystem)}
                              {syncRateToBgm ? ` → ★${bgmIntRate}` : ''}
                            </div>

                            {/* Top-Right Selection Check */}
                            <div
                              className={`absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                                isSelected
                                  ? 'bg-white text-zinc-950 shadow-md scale-100'
                                  : 'bg-black/55 text-transparent border border-white/30 scale-90'
                              }`}
                            >
                              <Check className="w-3 h-3 stroke-[3]" />
                            </div>

                            {/* User Comment Indicator */}
                            {syncCommentToBgm && userComment && (
                              <div
                                title={`将同步短评：${userComment}`}
                                className="absolute bottom-1.5 left-1.5 right-1.5 px-2 py-1 rounded-md bg-black/80 backdrop-blur-md border border-white/10 flex items-center gap-1 text-[10px] text-white/85 truncate"
                              >
                                <MessageSquareText className="w-3 h-3 shrink-0 text-amber-300" />
                                <span className="truncate">{userComment}</span>
                              </div>
                            )}
                          </div>

                          <p
                            className="mt-2 text-xs font-semibold text-white truncate"
                            title={anime.title}
                          >
                            {anime.title}
                          </p>

                          {/* Per-Item Quick Status Switcher: 在看/玩/读 vs 看/玩/读过 */}
                          <div className="mt-2 grid grid-cols-2 gap-1 bg-black/50 p-1 rounded-lg border border-white/[0.07]">
                            <button
                              type="button"
                              onClick={() => {
                                setPerItemPushType(prev => ({ ...prev, [anime.id]: 3 }));
                                if (!isSelected) handleToggleItemPushSelection(anime.id);
                              }}
                              className={`py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                                itemType === 3
                                  ? 'bg-white text-zinc-950 shadow-xs'
                                  : 'text-white/55 hover:text-white'
                              }`}
                            >
                              在{verb}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setPerItemPushType(prev => ({ ...prev, [anime.id]: 2 }));
                                if (!isSelected) handleToggleItemPushSelection(anime.id);
                              }}
                              className={`py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                                itemType === 2
                                  ? 'bg-white text-zinc-950 shadow-xs'
                                  : 'text-white/55 hover:text-white'
                              }`}
                            >
                              {verb}过
                            </button>
                          </div>

                          {itemType !== 2 && itemType !== 3 && (
                            <span className="mt-1 text-[10px] text-amber-300/90 text-center font-medium">
                              当前状态：{getItemStatusActionLabel(anime.category, itemType)}
                            </span>
                          )}

                          {pushResult && (
                            <span
                              className={`mt-1.5 text-[10.5px] font-medium truncate text-center ${
                                pushResult.status === 'ok' ? 'text-emerald-300' : 'text-rose-300'
                              }`}
                              title={pushResult.text}
                            >
                              {pushResult.text}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/[0.07] bg-white/[0.02] flex flex-wrap items-center justify-between gap-4">
          {activeTab === 'pull' ? (
            <>
              <span className="text-xs text-white/50">
                已选中 <strong className="text-white">{selectedItemIds.size}</strong> 部作品
              </span>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-full text-xs font-medium text-white/70 hover:bg-white/[0.08] cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  data-testid="confirm-bgm-import-btn"
                  onClick={handleConfirmImport}
                  disabled={selectedItemIds.size === 0}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-40"
                >
                  <Inbox className="w-3.5 h-3.5" />
                  <span>
                    一键导入 {selectedItemIds.size} 部作品至
                    {autoPlaceByBgmRate ? '榜单/候选池' : '待排候选池'}
                  </span>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-xs text-white/60">
                {pushProgress ? (
                  <span>
                    同步进度：<strong className="text-white">{pushProgress.done}</strong> /{' '}
                    {pushProgress.total} 部
                  </span>
                ) : (
                  <span>
                    已选 <strong className="text-white">{pushSelectedIds.size}</strong> 部上榜作品 ·
                    默认标记为「
                    <strong className="text-white">
                      {PUSH_STATUS_OPTIONS.find(o => o.type === defaultPushType)?.shortLabel}
                    </strong>
                    」{syncRateToBgm ? ' + 自动写入 1-10 评分' : ''}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-full text-xs font-medium text-white/70 hover:bg-white/[0.08] cursor-pointer"
                >
                  关闭
                </button>
                <button
                  type="button"
                  data-testid="confirm-bgm-push-btn"
                  onClick={handleBatchPushToBangumi}
                  disabled={pushSelectedIds.size === 0 || isPushingBatch}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-40"
                >
                  {isPushingBatch ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>
                        正在同步到 BGM ({pushProgress?.done || 0}/{pushProgress?.total || 0})...
                      </span>
                    </>
                  ) : (
                    <>
                      <CloudUpload className="w-3.5 h-3.5" />
                      <span>一键同步 {pushSelectedIds.size} 部作品到 Bangumi（点格子+打分）</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
