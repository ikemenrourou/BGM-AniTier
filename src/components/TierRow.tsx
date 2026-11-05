import React, { useState, useEffect } from 'react';
import { Plus, Trash2, MessageSquarePlus, Undo2 } from 'lucide-react';
import type { AnimeItem, TierGradingSystem, TierRowStyle, TierScore } from '../types';
import { formatTierBadgeText, formatTierLabel } from '../lib/tierLogic';
import { getAnimePalette, subscribePaletteUpdates } from '../lib/colorExtractor';

interface TierRowProps {
  score: TierScore;
  gradingSystem?: TierGradingSystem;
  items: AnimeItem[];
  showTitles: boolean;
  highlightedTag: string | null;
  commentedAnimeIds: Set<number>;
  tierRowStyle?: TierRowStyle;
  tierRowOpacity?: number;
  onAddClick: (score: TierScore) => void;
  onSelectAnimeDetail: (anime: AnimeItem, currentScore: TierScore) => void;
  onOpenCommentModal: (anime: AnimeItem, currentScore: TierScore) => void;
  onRemoveAnime: (animeId: number) => void;
  onMoveAnime: (animeId: number, targetScore: TierScore, targetIndex?: number) => void;
  onReturnToPool?: (animeId: number) => void;
  readOnlyStage?: boolean;
  activeStageAnimeId?: number | null;
  stageEntryPending?: boolean;
  activeStagePosterRef?: React.Ref<HTMLDivElement>;
}

const LETTER_RING_COLORS: Record<string, string> = {
  S: '#fb7185',
  'S-': '#f43f5e',
  A: '#fbbf24',
  'A-': '#f59e0b',
  B: '#38bdf8',
  'B-': '#0ea5e9',
  C: '#34d399',
  'C-': '#10b981',
  D: '#a78bfa',
  'D-': '#8b5cf6',
  E: '#94a3b8',
  F: '#64748b',
};

export const TierRow: React.FC<TierRowProps> = ({
  score,
  gradingSystem = 'numeric',
  items,
  showTitles,
  highlightedTag,
  commentedAnimeIds,
  tierRowStyle = 'ambient-glass',
  tierRowOpacity = 82,
  onAddClick,
  onSelectAnimeDetail,
  onOpenCommentModal,
  onRemoveAnime,
  onMoveAnime,
  onReturnToPool,
  readOnlyStage = false,
  activeStageAnimeId = null,
  stageEntryPending = false,
  activeStagePosterRef,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [, setPaletteTick] = useState(0);

  useEffect(() => {
    return subscribePaletteUpdates(() => {
      setPaletteTick(t => t + 1);
    });
  }, []);

  const radius = 33;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0.1, Math.min(1, score / 10));
  const strokeDashoffset = circumference * (1 - progress);

  const displayLabel = formatTierLabel(score, gradingSystem);
  const badgeAriaLabel = formatTierBadgeText(score, gradingSystem);
  const strokeColor =
    gradingSystem === 'letter'
      ? LETTER_RING_COLORS[displayLabel] || '#ffffff'
      : '#ffffff';

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDropOnRow = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const rawId = e.dataTransfer.getData('text/plain');
    const animeId = Number(rawId);
    if (Number.isFinite(animeId) && animeId !== 0) {
      onMoveAnime(animeId, score);
    }
  };

  const handleDropOnCard = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const rawId = e.dataTransfer.getData('text/plain');
    const animeId = Number(rawId);
    if (Number.isFinite(animeId) && animeId !== 0) {
      onMoveAnime(animeId, score, targetIndex);
    }
  };

  const alphaScale = Math.max(0, Math.min(1, tierRowOpacity / 100));
  const primaryPalette = items.length > 0 ? getAnimePalette(items[0]) : null;

  const getRowSurfaceProps = (): { className: string; style?: React.CSSProperties } => {
    if (isDragOver) {
      return {
        className: 'bg-white/[0.09] ring-1 ring-white/30',
      };
    }

    switch (tierRowStyle) {
      case 'pure-transparent':
        return {
          className: 'bg-transparent',
        };
      case 'floating-split':
        return {
          className: 'bg-transparent',
        };
      case 'minimal-blur':
        return {
          className: 'transition-colors duration-200 border border-white/[0.05]',
          style: {
            backgroundColor: `rgba(18, 20, 28, ${(0.52 * alphaScale).toFixed(2)})`,
            ...(readOnlyStage
              ? {}
              : {
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                }),
          },
        };
      case 'ambient-glass':
      default: {
        const baseAlpha = 0.18 + 0.36 * alphaScale;
        const edgeAlpha = 0.16 + 0.34 * alphaScale;
        return {
          className: readOnlyStage
            ? 'border border-white/[0.06] transition-all duration-300'
            : 'border border-white/[0.07] shadow-[0_16px_40px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.07)] transition-all duration-300',
          style: {
            ...(readOnlyStage ? { boxShadow: '0 10px 22px rgba(0,0,0,0.28)' } : {}),
            background: primaryPalette
              ? `radial-gradient(125% 155% at 18% 48%, ${primaryPalette.glowRgba(
                  0.28 * alphaScale,
                )} 0%, ${primaryPalette.glowRgba(
                  0.13 * alphaScale,
                )} 45%, rgba(20, 19, 23, ${edgeAlpha.toFixed(
                  2,
                )}) 84%), rgba(18, 17, 21, ${baseAlpha.toFixed(2)})`
              : `radial-gradient(ellipse 90% 80% at 20% 0%, rgba(255,255,255,${(
                  0.05 * alphaScale
                ).toFixed(3)}) 0%, rgba(255,255,255,0.012) 100%), rgba(18, 17, 21, ${baseAlpha.toFixed(
                  2,
                )})`,
            ...(readOnlyStage
              ? {}
              : {
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                }),
          },
        };
      }
    }
  };

  const surfaceProps = getRowSurfaceProps();

  return (
    <div
      data-empty-tier={items.length === 0 ? 'true' : 'false'}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDropOnRow}
      className={`group/row relative isolate flex flex-col sm:flex-row items-stretch rounded-[26px] min-h-[204px] overflow-hidden ${surfaceProps.className}`}
      style={surfaceProps.style}
    >
      {/* Left Score / Letter Ring Column */}
      <div
        className={`relative z-10 flex sm:flex-col items-center justify-between sm:justify-center px-5 py-3.5 sm:py-6 sm:w-[136px] shrink-0 select-none ${
          tierRowStyle === 'floating-split'
            ? 'bg-[#141620]/85 rounded-[24px] sm:mr-3 shadow-lg'
            : ''
        }`}
      >
        <button
          type="button"
          onClick={() => onAddClick(score)}
          title={`点击向 ${badgeAriaLabel} 添加动画`}
          className="relative flex items-center justify-center w-[82px] h-[82px] rounded-full transition-transform duration-200 hover:scale-105 cursor-pointer focus:outline-none"
        >
          <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
            <circle
              cx="40"
              cy="40"
              r={radius}
              fill="transparent"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="5.5"
            />
            <circle
              cx="40"
              cy="40"
              r={radius}
              fill="transparent"
              stroke={strokeColor}
              strokeWidth="5.5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
            />
          </svg>
          <span
            data-testid={`tier-ring-label-${score}`}
            className={`absolute inset-0 flex items-center justify-center font-extrabold tracking-tight tabular-nums ${
              gradingSystem === 'letter'
                ? 'text-[26px]'
                : String(score).includes('.')
                ? 'text-xl'
                : 'text-2xl'
            }`}
            style={{ color: strokeColor }}
          >
            {displayLabel}
          </span>
        </button>

        {/* Mobile Quick Add Button */}
        <button
          type="button"
          onClick={() => onAddClick(score)}
          aria-label={`向 ${badgeAriaLabel} 添加动画`}
          className="sm:hidden inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-white/80 transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>添加</span>
        </button>
      </div>

      {/* Right Anime Cards Grid Area */}
      <div className="relative z-10 flex-1 p-4 sm:py-5 sm:pr-6 sm:pl-2 flex flex-wrap items-start content-center gap-4 min-w-0">
        {items.map((anime, index) => {
          const isTagMatched =
            !highlightedTag || (Array.isArray(anime.tags) && anime.tags.includes(highlightedTag));
          const hasComment = commentedAnimeIds.has(anime.id);
          const palette = getAnimePalette(anime);

          const isStageActiveCard = readOnlyStage && activeStageAnimeId === anime.id;
          const isStageDimmedCard =
            readOnlyStage && activeStageAnimeId !== null && activeStageAnimeId !== anime.id;

          return (
            <div
              key={anime.id}
              data-testid={isStageActiveCard ? `stage-active-tier-card-${anime.id}` : undefined}
              aria-hidden={isStageActiveCard && stageEntryPending || undefined}
              style={isStageActiveCard ? { opacity: stageEntryPending ? 0 : 1, transitionProperty: 'none' } : undefined}
              draggable={!readOnlyStage}
              onDragStart={e => {
                if (readOnlyStage) return;
                e.dataTransfer.setData('text/plain', String(anime.id));
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={e => {
                if (readOnlyStage) return;
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={e => {
                if (readOnlyStage) return;
                handleDropOnCard(e, index);
              }}
              onClick={() => onSelectAnimeDetail(anime, score)}
              className={`group/card relative isolate flex flex-col w-[112px] sm:w-[128px] select-none ${
                readOnlyStage ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
              } transition-all duration-500 ${
                isStageActiveCard
                  ? stageEntryPending ? 'pointer-events-none z-30 scale-[1.14]' : 'z-30 scale-[1.14]'
                  : isStageDimmedCard
                  ? 'opacity-75 scale-[0.96]'
                  : isTagMatched
                  ? 'opacity-100 scale-100'
                  : 'opacity-20 scale-95 grayscale pointer-events-none'
              }`}
            >
              {/* 封面是光源·向周围自然均匀散发的柔和低饱和弥散光 (Soft Low-Saturation Cover Diffusion) */}
              {tierRowStyle === 'ambient-glass' && (
                <>
                  <div
                    aria-hidden="true"
                    className="absolute -inset-x-20 -inset-y-14 pointer-events-none -z-10 rounded-full"
                    style={{
                      background: `radial-gradient(ellipse 72% 72% at 50% 44%, ${palette.glowRgba(
                        (readOnlyStage ? 0.2 : 0.46) * alphaScale,
                      )} 0%, ${palette.glowRgba(
                        (readOnlyStage ? 0.1 : 0.23) * alphaScale,
                      )} 44%, transparent 80%)`,
                      filter: 'blur(26px)',
                    }}
                  />
                  {anime.cover && (
                    <img
                      src={anime.cover}
                      alt=""
                      aria-hidden="true"
                      referrerPolicy="no-referrer"
                      className="absolute -inset-8 w-[calc(100%+64px)] h-[calc(100%+48px)] object-cover rounded-[36px] pointer-events-none -z-10 select-none transition-opacity duration-300"
                      style={{
                        filter: 'blur(36px) saturate(1.2)',
                        opacity: Number(((readOnlyStage ? 0.14 : 0.32) * alphaScale).toFixed(2)),
                        transform: 'scale(1.14)',
                      }}
                    />
                  )}
                </>
              )}

              {/* Poster Image Box */}
              <div
                ref={isStageActiveCard ? activeStagePosterRef : undefined}
                data-stage-poster={isStageActiveCard ? anime.id : undefined}
                className={`relative w-full aspect-[3/4] rounded-[16px] overflow-hidden bg-zinc-900 transition-all duration-300 ${
                  isStageActiveCard
                    ? 'ring-1 ring-white/45'
                    : 'ring-1 ring-white/[0.14] group-hover/card:ring-white/40 group-hover/card:-translate-y-1'
                }`}
                style={{
                  boxShadow: isStageActiveCard
                    ? '0 10px 22px -4px rgba(0,0,0,0.5)'
                    : `0 14px 28px -4px rgba(0,0,0,0.65), 0 6px 14px -2px rgba(0,0,0,0.4), 0 14px 32px -6px ${palette.glowRgba(
                        0.22 * alphaScale,
                      )}`,
                }}
              >
                <img
                  src={anime.cover}
                  alt={anime.title}
                  loading={readOnlyStage ? 'eager' : 'lazy'}
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className={`w-full h-full object-cover ${readOnlyStage ? '' : 'transition-transform duration-300 group-hover/card:scale-105'}`}
                />

                {/* Commented Badge */}
                {hasComment && (
                  <span
                    title="已撰写主观漫评"
                    className="absolute top-2 left-2 w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]"
                  />
                )}

                {/* Hover Quick Actions Overlay */}
                {!readOnlyStage && (
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-150 flex flex-col justify-between p-2">
                    <div className="flex items-center justify-end gap-1">
                      {onReturnToPool && (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            onReturnToPool(anime.id);
                          }}
                          aria-label={`将 ${anime.title} 退回待排候选池`}
                          title="退回侧边待排候选池"
                          className="p-1.5 rounded-lg bg-black/70 hover:bg-white hover:text-zinc-950 text-white/90 transition-colors cursor-pointer"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          onOpenCommentModal(anime, score);
                        }}
                        aria-label={`为 ${anime.title} 写短评`}
                        title="写短评"
                        className="p-1.5 rounded-lg bg-black/70 hover:bg-white hover:text-zinc-950 text-white/90 transition-colors cursor-pointer"
                      >
                        <MessageSquarePlus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          onRemoveAnime(anime.id);
                        }}
                        aria-label={`移除 ${anime.title}`}
                        title="从榜单移除"
                        className="p-1.5 rounded-lg bg-black/70 hover:bg-rose-500 text-white/90 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {anime.bgmScore && (
                      <span className="self-start px-1.5 py-0.5 rounded bg-black/70 text-[10px] font-mono text-white/90">
                        BGM {anime.bgmScore}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Below-card Title */}
              {showTitles && (
                <p
                  title={anime.title}
                  className="mt-2 text-center text-xs sm:text-[13px] font-medium text-white/90 group-hover/card:text-white line-clamp-2 leading-snug px-0.5 transition-colors"
                >
                  {anime.title}
                </p>
              )}
            </div>
          );
        })}

        {/* Empty Row Prompt */}
        {items.length === 0 &&
          (readOnlyStage ? (
            <div className="w-full self-stretch min-h-[132px]" />
          ) : (
            <button
              type="button"
              onClick={() => onAddClick(score)}
              className="flex items-center justify-center w-full self-stretch min-h-[148px] text-white/25 hover:text-white/60 transition-colors text-xs font-medium cursor-pointer"
            >
              + 点击添加动画，或从侧边「待排候选池」拖拽至此行 ({badgeAriaLabel})
            </button>
          ))}
      </div>
    </div>
  );
};
