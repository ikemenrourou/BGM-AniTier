import React, { useEffect, useState } from 'react';
import {
  X,
  ExternalLink,
  MessageSquarePlus,
  Trash2,
  Loader2,
  CloudUpload,
  Check,
} from 'lucide-react';
import type { AnimeItem, TierGradingSystem, TierScore } from '../types';
import {
  fetchBangumiSubjectDetail,
  pushBangumiUserCollection,
  type BangumiCollectionStatusType,
} from '../lib/bangumiApi';
import { ALL_TIER_SCORES, LETTER_TIER_SCORES, formatTierBadgeText } from '../lib/tierLogic';
import type { SearchTargetDestination } from './SearchModal';

interface AnimeDetailModalProps {
  anime: AnimeItem | null;
  currentScore: SearchTargetDestination | null;
  visibleTiers: TierScore[];
  gradingSystem?: TierGradingSystem;
  bgmToken?: string;
  userCommentText?: string;
  onSyncSuccess?: (message: string) => void;
  onClose: () => void;
  onChangeDestination: (animeId: number, destination: SearchTargetDestination) => void;
  onOpenComment: (anime: AnimeItem, score: TierScore) => void;
  onRemoveAnime: (animeId: number) => void;
  onUpdateAnimeMetadata: (updated: AnimeItem) => void;
}

function getCategoryVerb(category?: string): string {
  if (category === 'game') return '玩';
  if (category === 'book') return '读';
  return '看';
}

export const AnimeDetailModal: React.FC<AnimeDetailModalProps> = ({
  anime,
  currentScore,
  visibleTiers,
  gradingSystem = 'numeric',
  bgmToken,
  userCommentText,
  onSyncSuccess,
  onClose,
  onChangeDestination,
  onOpenComment,
  onRemoveAnime,
  onUpdateAnimeMetadata,
}) => {
  const [detailedAnime, setDetailedAnime] = useState<AnimeItem | null>(anime);
  const [isLoading, setIsLoading] = useState(false);
  const [isPushingStatus, setIsPushingStatus] = useState<BangumiCollectionStatusType | null>(null);
  const [pushedResult, setPushedResult] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  useEffect(() => {
    setDetailedAnime(anime);
    setPushedResult(null);
    setPushError(null);
    if (!anime || anime.isCustom) return;

    let cancelled = false;
    setIsLoading(true);
    fetchBangumiSubjectDetail(anime.id)
      .then(fetched => {
        if (!cancelled && fetched) {
          const merged: AnimeItem = {
            ...anime,
            ...fetched,
            tags: fetched.tags?.length ? fetched.tags : anime.tags,
          };
          setDetailedAnime(merged);
          onUpdateAnimeMetadata(merged);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [anime?.id]);

  if (!anime || !detailedAnime || currentScore === null) return null;

  const availableScores =
    visibleTiers.length > 0
      ? visibleTiers
      : gradingSystem === 'letter'
      ? LETTER_TIER_SCORES
      : ALL_TIER_SCORES;

  const verb = getCategoryVerb(detailedAnime.category);
  const numericRate =
    typeof currentScore === 'number' ? Math.max(1, Math.min(10, Math.round(currentScore))) : undefined;

  const handleQuickPushToBgm = async (statusType: BangumiCollectionStatusType) => {
    if (detailedAnime.isCustom || isPushingStatus !== null) return;
    setIsPushingStatus(statusType);
    setPushError(null);
    setPushedResult(null);

    const statusLabel =
      statusType === 3 ? `在${verb}` : statusType === 2 ? `${verb}过` : statusType === 1 ? `想${verb}` : '搁置';

    try {
      await pushBangumiUserCollection({
        token: bgmToken,
        subjectId: detailedAnime.id,
        type: statusType,
        rate: numericRate,
        comment: userCommentText?.trim() || undefined,
      });
      const summary = `已同步到 BGM：「${statusLabel}」${numericRate ? ` · ${numericRate}分` : ''}`;
      setPushedResult(summary);
      onSyncSuccess?.(`《${detailedAnime.title}》${summary}`);
    } catch (err) {
      setPushError(err instanceof Error ? err.message : '同步到 Bangumi 失败');
    } finally {
      setIsPushingStatus(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-[24px] bg-[#111218] border border-white/[0.12] shadow-[0_24px_80px_rgba(0,0,0,0.85)] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-white/[0.02]">
          <h3 id="detail-modal-title" className="text-base font-bold text-white truncate">
            作品详情与分级调整
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭详情窗口"
            className="p-1.5 text-white/50 hover:text-white hover:bg-white/[0.08] rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex flex-col sm:flex-row gap-5">
            <img
              src={detailedAnime.cover}
              alt={detailedAnime.title}
              referrerPolicy="no-referrer"
              className="w-36 sm:w-40 aspect-[3/4] object-cover rounded-xl border border-white/10 shrink-0 mx-auto sm:mx-0 shadow-lg"
            />

            <div className="flex-1 space-y-3">
              <div>
                <h4 className="text-xl font-bold text-white">{detailedAnime.title}</h4>
                {detailedAnime.originalTitle && detailedAnime.originalTitle !== detailedAnime.title && (
                  <p className="text-xs text-white/50 mt-0.5">{detailedAnime.originalTitle}</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-white/75 tabular-nums">
                {detailedAnime.airDate && <span>放送/发售: {detailedAnime.airDate}</span>}
                {detailedAnime.bgmScore && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-white font-semibold">BGM 评分: {detailedAnime.bgmScore}</span>
                  </>
                )}
                {detailedAnime.bgmRank && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>排名: #{detailedAnime.bgmRank}</span>
                  </>
                )}
                {detailedAnime.eps && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>话数: {detailedAnime.eps}话</span>
                  </>
                )}
              </div>

              {(detailedAnime.studio || detailedAnime.director) && (
                <div className="text-xs text-white/75 space-y-1">
                  {detailedAnime.studio && <p>制作/开发：{detailedAnime.studio}</p>}
                  {detailedAnime.director && <p>监督/导演：{detailedAnime.director}</p>}
                </div>
              )}

              {detailedAnime.tags && detailedAnime.tags.length > 0 && (
                <div className="text-xs text-white/50">
                  <span>标签：</span>
                  <span className="text-white/85">{detailedAnime.tags.join(' · ')}</span>
                </div>
              )}

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <label htmlFor="detail-tier-select" className="text-xs font-medium text-white/75">
                  当前所在位置 / 评分:
                </label>
                <select
                  id="detail-tier-select"
                  value={String(currentScore)}
                  onChange={e => {
                    const val = e.target.value;
                    onChangeDestination(
                      detailedAnime.id,
                      val === 'pool' ? 'pool' : (Number(val) as TierScore),
                    );
                  }}
                  className="px-3.5 py-1.5 text-xs font-mono font-bold text-white bg-white/[0.06] border border-white/[0.15] rounded-lg focus:outline-none focus:border-white/40 cursor-pointer"
                >
                  <option value="pool" className="bg-zinc-900 text-white">
                    待排候选池 (未打分)
                  </option>
                  {availableScores.map(s => (
                    <option key={s} value={s} className="bg-zinc-900 text-white">
                      {formatTierBadgeText(s, gradingSystem)}
                    </option>
                  ))}
                </select>
              </div>

              {/* One-Click Sync Single Work to Bangumi */}
              {!detailedAnime.isCustom && detailedAnime.id > 0 && (
                <div className="pt-2.5 border-t border-white/[0.07] space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-white/60">
                      <CloudUpload className="w-3.5 h-3.5 text-white/70" />
                      <span>一键同步到 BGM 点格子{numericRate ? ` (打 ${numericRate} 分)` : ''}:</span>
                    </span>

                    <button
                      type="button"
                      disabled={isPushingStatus !== null}
                      onClick={() => handleQuickPushToBgm(3)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/[0.07] hover:bg-white hover:text-zinc-950 text-white text-xs font-semibold border border-white/[0.12] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isPushingStatus === 3 && <Loader2 className="w-3 h-3 animate-spin" />}
                      <span>标记「在{verb}」{numericRate ? ` · ${numericRate}分` : ''}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isPushingStatus !== null}
                      onClick={() => handleQuickPushToBgm(2)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isPushingStatus === 2 && <Loader2 className="w-3 h-3 animate-spin" />}
                      <span>标记「{verb}过」{numericRate ? ` · ${numericRate}分` : ''}</span>
                    </button>
                  </div>

                  {pushedResult && (
                    <p className="inline-flex items-center gap-1 text-xs text-emerald-300 font-medium">
                      <Check className="w-3.5 h-3.5" />
                      <span>{pushedResult}</span>
                    </p>
                  )}
                  {pushError && <p className="text-xs text-rose-300">{pushError}</p>}
                </div>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-white/50">
              <Loader2 className="w-4 h-4 animate-spin text-white" />
              <span>正在同步 Bangumi 条目详情...</span>
            </div>
          ) : (
            detailedAnime.summary && (
              <div className="space-y-1.5 pt-3 border-t border-white/[0.08]">
                <h5 className="text-xs font-semibold text-white/75">剧情简介</h5>
                <p className="text-xs leading-relaxed text-white/75 whitespace-pre-line">
                  {detailedAnime.summary}
                </p>
              </div>
            )
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-white/[0.08] bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const effectiveScore = typeof currentScore === 'number' ? currentScore : 10;
                onClose();
                onOpenComment(detailedAnime, effectiveScore);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-zinc-950 bg-white hover:bg-zinc-200 rounded-full transition-colors cursor-pointer"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              <span>撰写 / 编辑短评</span>
            </button>

            {!detailedAnime.isCustom && (
              <a
                href={`https://bgm.tv/subject/${detailedAnime.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white/85 bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] rounded-full transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>在 Bangumi 查看</span>
              </a>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              onRemoveAnime(detailedAnime.id);
              onClose();
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-rose-300 hover:text-white hover:bg-rose-500/80 rounded-full transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>从榜单移除</span>
          </button>
        </div>
      </div>
    </div>
  );
};
