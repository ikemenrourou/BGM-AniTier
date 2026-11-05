import React, { useState, useRef, useMemo } from 'react';
import {
  X,
  Download,
  Sparkles,
  Tv,
  BookOpen,
  Gamepad2,
  LayoutGrid,
  Columns,
  Dices,
  Loader2,
  EyeOff,
  CircleDot,
} from 'lucide-react';
import { toPng } from 'html-to-image';
import type {
  AnimeItem,
  CommentItem,
  SubjectCategory,
  TierGradingSystem,
  TierMap,
} from '../types';
import {
  ALL_TIER_SCORES,
  choosePosterCardVariant,
  formatTierLabel,
  getPosterExtremeScoreType,
  shufflePosterEntries,
} from '../lib/tierLogic';

interface PosterWallModalProps {
  isOpen: boolean;
  boardTitle: string;
  tiers: TierMap;
  gradingSystem?: TierGradingSystem;
  unrankedPool: AnimeItem[];
  comments: CommentItem[];
  bgmNickname?: string;
  onClose: () => void;
}

type PosterLayoutStyle = 'mixed-collage' | 'asym-masonry' | 'compact-matrix';
type CategoryFilter = 'all' | SubjectCategory;
export type PosterBadgeMode = 'score-ring' | 'category-icon' | 'none';

interface PosterEntry {
  anime: AnimeItem;
  score: number | null;
  comment?: string;
}

// Unified Corner Badge (图3/图4 1号位置): Supports Circular Score Ring, Category Icon (Game/Anime/Book), or Off
const CardCornerBadge: React.FC<{
  mode: PosterBadgeMode;
  score: number | null;
  category?: SubjectCategory;
  gradingSystem?: TierGradingSystem;
  size?: 'sm' | 'md' | 'lg';
}> = ({ mode, score, category = 'anime', gradingSystem = 'numeric', size = 'sm' }) => {
  if (mode === 'none') return null;

  const dims =
    size === 'lg'
      ? 'w-10 h-10 text-[12.5px]'
      : size === 'md'
      ? 'w-8 h-8 text-[11px]'
      : 'w-7 h-7 text-[10px]';

  if (mode === 'category-icon') {
    const iconClass = size === 'lg' ? 'w-4 h-4' : 'w-3.5 h-3.5';
    return (
      <div
        data-testid="poster-badge-category-icon"
        className={`relative ${dims} rounded-full bg-black/55 border border-white/25 flex items-center justify-center shrink-0 text-white/90 select-none shadow-sm`}
        title={category === 'game' ? '游戏' : category === 'book' ? '书籍' : '动画'}
      >
        {category === 'game' ? (
          <Gamepad2 className={iconClass} />
        ) : category === 'book' ? (
          <BookOpen className={iconClass} />
        ) : (
          <Tv className={iconClass} />
        )}
      </div>
    );
  }

  const numeric = typeof score === 'number' && score > 0 ? score : null;
  const pct = numeric ? Math.min(100, Math.max(10, Math.round(numeric * 10))) : 75;
  const label =
    numeric !== null
      ? gradingSystem === 'letter'
        ? formatTierLabel(numeric, 'letter')
        : String(numeric)
      : '—';

  return (
    <div
      data-testid="poster-badge-score-ring"
      className={`relative ${dims} flex items-center justify-center shrink-0 select-none`}
    >
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <path
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth="3.2"
          fill="rgba(0, 0, 0, 0.45)"
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
        />
        <path
          stroke="#ffffff"
          strokeWidth="3.2"
          strokeDasharray={`${pct}, 100`}
          strokeLinecap="round"
          fill="none"
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-extrabold text-white tracking-tight tabular-nums">
        {label}
      </span>
    </div>
  );
};

export const PosterWallModal: React.FC<PosterWallModalProps> = ({
  isOpen,
  boardTitle,
  tiers,
  gradingSystem = 'numeric',
  unrankedPool,
  comments,
  bgmNickname,
  onClose,
}) => {
  const posterRef = useRef<HTMLDivElement>(null);
  const [posterTitle, setPosterTitle] = useState<string>('2026 季度 ACGN 鉴赏档案');
  const [posterSubtitle] = useState<string>(
    'SEASONAL ARCHIVE · ANIME / BOOKS / GAMES',
  );
  const [curatorName, setCuratorName] = useState<string>(bgmNickname || '肉肉肉肥肉');
  const [layoutStyle, setLayoutStyle] = useState<PosterLayoutStyle>('mixed-collage');
  const [badgeMode, setBadgeMode] = useState<PosterBadgeMode>('score-ring');
  const [shuffleScores, setShuffleScores] = useState<boolean>(true);
  const [layoutSeed, setLayoutSeed] = useState<number>(1);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [includeUnrankedPool, setIncludeUnrankedPool] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const commentMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of comments) {
      if (c.text?.trim()) {
        map.set(c.animeId, c.text.trim());
      }
    }
    return map;
  }, [comments]);

  const rawEntries = useMemo<PosterEntry[]>(() => {
    const list: PosterEntry[] = [];
    const seen = new Set<number>();

    for (const score of ALL_TIER_SCORES) {
      for (const item of tiers[String(score)] || []) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        const effectiveScore = item.originalNumericScore ?? score;
        list.push({
          anime: item,
          score: effectiveScore,
          comment: commentMap.get(item.id) || item.userBgmComment?.trim(),
        });
      }
    }

    if (includeUnrankedPool) {
      for (const item of unrankedPool) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        list.push({
          anime: item,
          score: item.userBgmRate || item.bgmScore || null,
          comment: commentMap.get(item.id) || item.userBgmComment?.trim(),
        });
      }
    }

    const filtered =
      categoryFilter === 'all'
        ? list
        : list.filter(e => (e.anime.category || 'anime') === categoryFilter);

    return filtered;
  }, [tiers, unrankedPool, commentMap, includeUnrankedPool, categoryFilter]);

  // Shuffle high-score and low-score works together by default so they don't cluster monotonically
  const allEntries = useMemo<PosterEntry[]>(() => {
    if (!shuffleScores) return rawEntries;
    return shufflePosterEntries(rawEntries, layoutSeed);
  }, [rawEntries, shuffleScores, layoutSeed]);

  const categoryCounts = useMemo(() => {
    let anime = 0;
    let book = 0;
    let game = 0;
    let scoredSum = 0;
    let scoredCount = 0;
    for (const entry of rawEntries) {
      const cat = entry.anime.category || 'anime';
      if (cat === 'book') book++;
      else if (cat === 'game') game++;
      else anime++;
      if (typeof entry.score === 'number' && entry.score > 0) {
        scoredSum += entry.score;
        scoredCount++;
      }
    }
    const avg = scoredCount > 0 ? (scoredSum / scoredCount).toFixed(1) : '—';
    return { anime, book, game, total: rawEntries.length, avg };
  }, [rawEntries]);

  // Distribute entries into 4 asymmetric masonry columns when in 'asym-masonry' mode
  const masonryColumns = useMemo(() => {
    const cols: Array<Array<{ entry: PosterEntry; idx: number }>> = [[], [], [], []];
    const heights = [0, 0, 0, 0];
    allEntries.forEach((entry, idx) => {
      const extreme = getPosterExtremeScoreType(entry.score);
      const hasComment = Boolean(entry.comment);
      const estH = extreme
        ? 355
        : hasComment
        ? 315
        : (idx + layoutSeed) % 2 === 0
        ? 280
        : 245;
      let shortest = 0;
      for (let i = 1; i < 4; i++) {
        if (heights[i] < heights[shortest]) shortest = i;
      }
      cols[shortest].push({ entry, idx });
      heights[shortest] += estH;
    });
    return cols;
  }, [allEntries, layoutSeed]);

  if (!isOpen) return null;

  const handleDownloadPoster = async () => {
    if (!posterRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const el = posterRef.current;
      const dataUrl = await toPng(el, {
        cacheBust: true,
        pixelRatio: 2,
        width: el.scrollWidth,
        height: el.scrollHeight,
        backgroundColor: '#090a0f',
      });
      const link = document.createElement('a');
      link.download = `${posterTitle || 'ACGN-Seasonal-Poster'}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to export poster wall:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const formatMetaStamp = (anime: AnimeItem) => {
    const catLabel =
      anime.category === 'book' ? 'BOOK' : anime.category === 'game' ? 'GAME' : 'ANIME';
    const datePart = anime.airDate
      ? anime.airDate.slice(0, 7).replace('-', '.')
      : anime.bgmUpdatedAt
      ? anime.bgmUpdatedAt.slice(0, 7).replace('-', '.')
      : '2026';
    return `${datePart} · ${catLabel}`;
  };

  const formatWatermarkDisplay = (score: number | null) => {
    if (score === null) return '—';
    return gradingSystem === 'letter' ? formatTierLabel(score, 'letter') : String(score);
  };

  const ambientHeaderCovers = allEntries.slice(0, 4);

  // Renders varied, portrait-friendly cards for the Mixed-Size Collage mode (with 7 distinct styles & extreme-score scaling)
  const renderMixedCollageCard = (entry: PosterEntry, idx: number) => {
    const hasComment = Boolean(entry.comment?.trim());
    const extremeType = getPosterExtremeScoreType(entry.score);
    const { variant, isScaledExtreme } = choosePosterCardVariant({
      animeId: entry.anime.id,
      index: idx,
      score: entry.score,
      hasComment,
      seed: layoutSeed,
    });

    const scoreDisplay = formatWatermarkDisplay(entry.score);
    const extremeRingClass =
      extremeType === 'ultra-high'
        ? 'ring-1 ring-white/20 shadow-[0_18px_42px_rgba(0,0,0,0.65)]'
        : extremeType === 'ultra-low'
        ? 'ring-1 ring-rose-400/20 shadow-[0_18px_42px_rgba(0,0,0,0.65)]'
        : 'shadow-[0_14px_32px_rgba(0,0,0,0.5)]';

    // =========================================================================
    // Variant 1 (col-span-2): 图4 #2 Style — Right Cover Feathered + Personal Comment in 2号位置 (Upper-Left Blank Area in Small Gray Font!)
    // =========================================================================
    if (variant === 'wide-feather') {
      return (
        <div
          key={entry.anime.id}
          data-testid={`poster-card-${entry.anime.id}`}
          data-card-variant="wide-feather"
          data-extreme-score={extremeType || 'normal'}
          className={`col-span-2 relative isolate rounded-[22px] overflow-hidden bg-[#10121a] ${extremeRingClass} ${
            isScaledExtreme ? 'min-h-[218px]' : 'min-h-[198px]'
          } flex flex-col justify-between p-4 sm:p-5`}
        >
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
            <img
              src={entry.anime.cover}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover scale-150 blur-[40px] saturate-[2.0] opacity-80"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(100deg, rgba(12, 13, 19, 0.92) 0%, rgba(14, 15, 22, 0.76) 46%, rgba(10, 11, 16, 0.22) 100%)',
              }}
            />
          </div>

          {/* Right 58% Feathered Cover */}
          <div className="absolute inset-y-0 right-0 w-[58%] z-0 pointer-events-none overflow-hidden">
            <img
              src={entry.anime.cover}
              alt={entry.anime.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-top mask-fade-left opacity-95"
            />
          </div>

          {/* Top-Left Giant Watermark */}
          <span
            aria-hidden="true"
            className={`absolute -top-2.5 left-3.5 ${
              isScaledExtreme ? 'text-[72px]' : 'text-[62px]'
            } font-black leading-none tracking-tighter select-none pointer-events-none tabular-nums z-10 bg-gradient-to-b from-white/[0.18] via-white/[0.06] to-transparent bg-clip-text text-transparent`}
          >
            {scoreDisplay}
          </span>

          {/* 图4 2号位置: Upper-Left Blank Space dedicated to Personal Comment in smaller gray font */}
          <div className="relative z-10 pr-[40%] pt-5 mb-2 min-h-[44px] flex items-start">
            {entry.comment ? (
              <p
                data-testid={`poster-card-comment-${entry.anime.id}`}
                className="text-[11px] text-zinc-400/90 leading-[1.58] line-clamp-3 font-normal tracking-wide"
              >
                {entry.comment}
              </p>
            ) : null}
          </div>

          {/* Bottom-Left: 1号位置 Badge + Date/Category + Title */}
          <div className="relative z-10 pr-[38%] flex flex-col justify-end">
            <div className="flex items-center gap-2 mb-1.5">
              <CardCornerBadge
                mode={badgeMode}
                score={entry.score}
                category={entry.anime.category}
                gradingSystem={gradingSystem}
                size="sm"
              />
              <span className="text-[10px] font-mono tracking-wider uppercase text-white/65">
                {formatMetaStamp(entry.anime)}
              </span>
            </div>
            <h3
              className={`${
                isScaledExtreme ? 'text-[17px] sm:text-[18px]' : 'text-[15.5px] sm:text-[16px]'
              } font-extrabold text-white leading-snug tracking-tight line-clamp-2`}
            >
              {entry.anime.title}
            </h3>
          </div>
        </div>
      );
    }

    // =========================================================================
    // Variant 2 (col-span-2): Double-Wide Flagship Card with Uncut 2:3 Vertical Cover on Left + Right Editorial & Gray Comment
    // =========================================================================
    if (variant === 'wide-split') {
      return (
        <div
          key={entry.anime.id}
          data-testid={`poster-card-${entry.anime.id}`}
          data-card-variant="wide-split"
          data-extreme-score={extremeType || 'normal'}
          className={`col-span-2 relative isolate rounded-[22px] p-3.5 overflow-hidden bg-[#10121a] ${extremeRingClass} flex items-stretch gap-4 ${
            isScaledExtreme ? 'min-h-[216px]' : 'min-h-[196px]'
          }`}
        >
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
            <img
              src={entry.anime.cover}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover scale-150 blur-[42px] saturate-[2.0] opacity-75"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(110deg, rgba(12, 13, 19, 0.58) 0%, rgba(13, 14, 21, 0.85) 45%, rgba(10, 11, 16, 0.94) 100%)',
              }}
            />
          </div>

          <span
            aria-hidden="true"
            className={`absolute -top-2.5 right-3.5 ${
              isScaledExtreme ? 'text-[72px]' : 'text-[64px]'
            } font-black leading-none tracking-tighter select-none pointer-events-none tabular-nums z-10 bg-gradient-to-b from-white/[0.22] via-white/[0.08] to-transparent bg-clip-text text-transparent`}
          >
            {scoreDisplay}
          </span>

          <div
            className={`relative z-10 ${
              isScaledExtreme ? 'w-[126px] sm:w-[136px]' : 'w-[116px] sm:w-[124px]'
            } aspect-[2/3] rounded-[14px] overflow-hidden shrink-0 shadow-[0_10px_26px_rgba(0,0,0,0.65)] bg-zinc-900`}
          >
            <img
              src={entry.anime.cover}
              alt={entry.anime.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="relative z-10 flex-1 min-w-0 flex flex-col justify-between py-1 pr-2">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <CardCornerBadge
                  mode={badgeMode}
                  score={entry.score}
                  category={entry.anime.category}
                  gradingSystem={gradingSystem}
                  size="sm"
                />
                <span className="text-[10.5px] font-mono tracking-wider uppercase text-white/65">
                  {formatMetaStamp(entry.anime)}
                </span>
              </div>
              <h3
                className={`${
                  isScaledExtreme ? 'text-[17px] sm:text-[18px]' : 'text-[16px]'
                } font-extrabold text-white leading-snug tracking-tight line-clamp-2 mb-2`}
              >
                {entry.anime.title}
              </h3>
              {entry.comment ? (
                <p
                  data-testid={`poster-card-comment-${entry.anime.id}`}
                  className="text-[11.5px] text-zinc-300/75 leading-[1.6] line-clamp-3 font-normal"
                >
                  {entry.comment}
                </p>
              ) : entry.anime.summary ? (
                <p className="text-[11.5px] text-zinc-400/65 leading-[1.55] line-clamp-3">
                  {entry.anime.summary}
                </p>
              ) : null}
            </div>

            {entry.anime.tags && entry.anime.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2 text-[10px] text-white/50 font-mono">
                {entry.anime.tags.slice(0, 3).map(tag => (
                  <span key={tag} className="px-2 py-0.5 rounded-md bg-white/[0.07]">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    // =========================================================================
    // Variant 3 (NEW Style 1, col-span-2): Wide Cinema Ticket / Editorial Polaroid Stub (画廊票根宽卡)
    // =========================================================================
    if (variant === 'wide-polaroid') {
      return (
        <div
          key={entry.anime.id}
          data-testid={`poster-card-${entry.anime.id}`}
          data-card-variant="wide-polaroid"
          data-extreme-score={extremeType || 'normal'}
          className={`col-span-2 relative isolate rounded-[22px] overflow-hidden bg-[#11131c] ${extremeRingClass} flex items-stretch ${
            isScaledExtreme ? 'min-h-[214px]' : 'min-h-[196px]'
          }`}
        >
          {/* Ambient Cover Tint */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
            <img
              src={entry.anime.cover}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover scale-150 blur-[44px] saturate-[1.9] opacity-65"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(135deg, rgba(14, 16, 24, 0.90) 0%, rgba(10, 11, 17, 0.82) 100%)',
              }}
            />
          </div>

          {/* Left Editorial Spine + Review Block */}
          <div className="relative z-10 flex-1 min-w-0 p-4 sm:p-5 flex flex-col justify-between border-r border-dashed border-white/[0.1]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CardCornerBadge
                  mode={badgeMode}
                  score={entry.score}
                  category={entry.anime.category}
                  gradingSystem={gradingSystem}
                  size="sm"
                />
                <span className="text-[10px] font-mono tracking-widest uppercase text-white/55">
                  {formatMetaStamp(entry.anime)}
                </span>
              </div>
              <span className="text-[32px] font-black leading-none tracking-tighter text-white/25 tabular-nums select-none">
                {scoreDisplay}
              </span>
            </div>

            <div className="my-2">
              <h3 className="text-[16px] sm:text-[17px] font-extrabold text-white leading-snug tracking-tight line-clamp-2 mb-1.5">
                {entry.anime.title}
              </h3>
              {entry.comment ? (
                <p
                  data-testid={`poster-card-comment-${entry.anime.id}`}
                  className="text-[11.5px] text-zinc-300/75 leading-[1.6] line-clamp-3 font-normal"
                >
                  {entry.comment}
                </p>
              ) : entry.anime.studio ? (
                <p className="text-[11px] text-zinc-400/70 font-mono">
                  STUDIO · {entry.anime.studio}
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-between text-[9.5px] font-mono tracking-widest uppercase text-white/35 pt-1">
              <span>NO. {String(entry.anime.id).slice(-5)}</span>
              <span>ARCHIVE TICKET</span>
            </div>
          </div>

          {/* Right Framed 2:3 Vertical Cover Inset */}
          <div className="relative z-10 w-[132px] sm:w-[144px] p-2.5 shrink-0 flex items-center justify-center">
            <div className="w-full aspect-[2/3] rounded-[14px] overflow-hidden bg-zinc-900 shadow-[0_10px_24px_rgba(0,0,0,0.65)]">
              <img
                src={entry.anime.cover}
                alt={entry.anime.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      );
    }

    // =========================================================================
    // Variant 4 (NEW Style 2, col-span-1): Bottom Feathered Cover + Top Gray Comment & Title (底封上羽化漫评卡)
    // =========================================================================
    if (variant === 'portrait-bottom-feather') {
      return (
        <div
          key={entry.anime.id}
          data-testid={`poster-card-${entry.anime.id}`}
          data-card-variant="portrait-bottom-feather"
          data-extreme-score={extremeType || 'normal'}
          className={`col-span-1 relative isolate aspect-[2/3] rounded-[20px] overflow-hidden bg-[#10121a] ${extremeRingClass} flex flex-col justify-between`}
        >
          {/* Diffused Cover Color Base */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
            <img
              src={entry.anime.cover}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover scale-150 blur-[36px] saturate-[2.0] opacity-80"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(180deg, rgba(12, 13, 19, 0.94) 0%, rgba(12, 13, 19, 0.80) 48%, rgba(10, 11, 16, 0.25) 100%)',
              }}
            />
          </div>

          <span
            aria-hidden="true"
            className="absolute -top-1.5 right-2.5 text-[42px] font-black leading-none tracking-tighter select-none pointer-events-none tabular-nums z-10 text-white/[0.15]"
          >
            {scoreDisplay}
          </span>

          {/* Top Editorial Block + Small Gray Personal Comment */}
          <div className="relative z-10 p-3.5 pb-1 pr-4">
            <div className="flex items-center gap-1.5 mb-1.5">
              <CardCornerBadge
                mode={badgeMode}
                score={entry.score}
                category={entry.anime.category}
                gradingSystem={gradingSystem}
                size="sm"
              />
              <span className="text-[9px] font-mono tracking-wider uppercase text-white/55 truncate">
                {formatMetaStamp(entry.anime)}
              </span>
            </div>
            <h3
              className="text-[13px] font-extrabold text-white leading-snug tracking-tight line-clamp-2 mb-1"
              title={entry.anime.title}
            >
              {entry.anime.title}
            </h3>
            {entry.comment && (
              <p
                data-testid={`poster-card-comment-${entry.anime.id}`}
                className="text-[10.5px] text-zinc-300/75 leading-[1.45] line-clamp-2 font-normal"
              >
                {entry.comment}
              </p>
            )}
          </div>

          {/* Bottom 62% Vertical Cover Feathered Smoothly Upward */}
          <div className="relative w-full h-[60%] overflow-hidden z-0 -mt-3 pointer-events-none">
            <img
              src={entry.anime.cover}
              alt={entry.anime.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-top mask-fade-top"
            />
          </div>
        </div>
      );
    }

    // =========================================================================
    // Variant 5 (NEW Style 3, col-span-1): Gallery Polaroid Frame Card (暗房拍立得竖卡)
    // =========================================================================
    if (variant === 'portrait-polaroid') {
      return (
        <div
          key={entry.anime.id}
          data-testid={`poster-card-${entry.anime.id}`}
          data-card-variant="portrait-polaroid"
          data-extreme-score={extremeType || 'normal'}
          className={`col-span-1 relative isolate aspect-[2/3] rounded-[20px] p-2.5 overflow-hidden bg-[#12131c] ${extremeRingClass} flex flex-col justify-between`}
        >
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
            <img
              src={entry.anime.cover}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover scale-150 blur-[38px] saturate-[1.8] opacity-55"
            />
            <div className="absolute inset-0 bg-[#0d0e15]/80" />
          </div>

          {/* Framed Vertical Cover Window */}
          <div className="relative z-10 w-full flex-1 rounded-[13px] overflow-hidden bg-zinc-900 shadow-md">
            <img
              src={entry.anime.cover}
              alt={entry.anime.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-top"
            />
            <div className="absolute top-2 left-2 z-10">
              <CardCornerBadge
                mode={badgeMode}
                score={entry.score}
                category={entry.anime.category}
                gradingSystem={gradingSystem}
                size="sm"
              />
            </div>
            <span className="absolute bottom-1.5 right-2 text-[28px] font-black leading-none tracking-tighter text-white/45 drop-shadow select-none tabular-nums">
              {scoreDisplay}
            </span>
          </div>

          {/* Bottom Polaroid Caption & Optional Gray Comment */}
          <div className="relative z-10 pt-2.5 px-1">
            <h3
              className="text-[12.5px] font-extrabold text-white leading-tight tracking-tight truncate"
              title={entry.anime.title}
            >
              {entry.anime.title}
            </h3>
            {entry.comment ? (
              <p
                data-testid={`poster-card-comment-${entry.anime.id}`}
                className="text-[10.5px] text-zinc-400 leading-snug line-clamp-1 mt-0.5 font-normal"
              >
                {entry.comment}
              </p>
            ) : (
              <p className="text-[9px] font-mono tracking-wider uppercase text-white/45 mt-0.5 truncate">
                {formatMetaStamp(entry.anime)}
              </p>
            )}
          </div>
        </div>
      );
    }

    // =========================================================================
    // Variant 6 (col-span-1): Full Uncut 2:3 Vertical Poster Card with Bottom Gradient & Top-Right Watermark
    // =========================================================================
    if (variant === 'portrait-full') {
      return (
        <div
          key={entry.anime.id}
          data-testid={`poster-card-${entry.anime.id}`}
          data-card-variant="portrait-full"
          data-extreme-score={extremeType || 'normal'}
          className={`col-span-1 relative isolate aspect-[2/3] rounded-[20px] overflow-hidden ${extremeRingClass} bg-zinc-900 flex flex-col justify-between p-3.5`}
        >
          <img
            src={entry.anime.cover}
            alt={entry.anime.title}
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover z-0"
          />
          <div
            className="absolute inset-0 z-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(8, 9, 14, 0.45) 0%, rgba(8, 9, 14, 0.05) 38%, rgba(8, 9, 14, 0.74) 72%, rgba(8, 9, 14, 0.95) 100%)',
            }}
          />

          <div className="relative z-10 flex items-start justify-between">
            <CardCornerBadge
              mode={badgeMode}
              score={entry.score}
              category={entry.anime.category}
              gradingSystem={gradingSystem}
              size="sm"
            />
            <span className="text-[36px] font-black leading-none tracking-tighter text-white/30 select-none tabular-nums drop-shadow ml-auto">
              {scoreDisplay}
            </span>
          </div>

          <div className="relative z-10">
            <p className="text-[9.5px] font-mono tracking-wider uppercase text-white/65 mb-0.5">
              {formatMetaStamp(entry.anime)}
            </p>
            <h3
              className="text-[13.5px] font-extrabold text-white leading-snug tracking-tight line-clamp-2"
              title={entry.anime.title}
            >
              {entry.anime.title}
            </h3>
            {entry.comment && (
              <p
                data-testid={`poster-card-comment-${entry.anime.id}`}
                className="text-[10.5px] text-zinc-300/75 line-clamp-1 mt-1 font-normal"
              >
                {entry.comment}
              </p>
            )}
          </div>
        </div>
      );
    }

    // =========================================================================
    // Variant 7 (col-span-1): Top Vertical Cover Feathered Downward into Cover-Diffused Base
    // =========================================================================
    if (variant === 'portrait-top-feather') {
      return (
        <div
          key={entry.anime.id}
          data-testid={`poster-card-${entry.anime.id}`}
          data-card-variant="portrait-top-feather"
          data-extreme-score={extremeType || 'normal'}
          className={`col-span-1 relative isolate aspect-[2/3] rounded-[20px] overflow-hidden bg-[#10121a] ${extremeRingClass} flex flex-col justify-between`}
        >
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
            <img
              src={entry.anime.cover}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover scale-150 blur-[36px] saturate-[2.1] opacity-85"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(180deg, rgba(12, 13, 18, 0.25) 0%, rgba(12, 13, 18, 0.82) 68%, rgba(10, 11, 16, 0.94) 100%)',
              }}
            />
          </div>

          <div className="relative w-full h-[72%] overflow-hidden z-0">
            <img
              src={entry.anime.cover}
              alt={entry.anime.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-top mask-fade-bottom"
            />
            <div className="absolute top-3 left-3 z-10">
              <CardCornerBadge
                mode={badgeMode}
                score={entry.score}
                category={entry.anime.category}
                gradingSystem={gradingSystem}
                size="sm"
              />
            </div>
          </div>

          <span
            aria-hidden="true"
            className="absolute bottom-1 right-2.5 text-[48px] font-black leading-none tracking-tighter select-none pointer-events-none tabular-nums z-10 text-white/[0.12]"
          >
            {scoreDisplay}
          </span>

          <div className="relative z-10 px-3.5 pb-3.5 -mt-6">
            <p className="text-[9.5px] font-mono tracking-wider uppercase text-white/60 mb-0.5">
              {formatMetaStamp(entry.anime)}
            </p>
            <h3
              className="text-[13.5px] font-extrabold text-white leading-snug tracking-tight line-clamp-2"
              title={entry.anime.title}
            >
              {entry.anime.title}
            </h3>
          </div>
        </div>
      );
    }

    // =========================================================================
    // Variant 8 (col-span-1): Diffused Aura Portrait Frame (Top Header + Vertical 2:3 Portrait Window below)
    // =========================================================================
    return (
      <div
        key={entry.anime.id}
        data-testid={`poster-card-${entry.anime.id}`}
        data-card-variant="portrait-aura-frame"
        data-extreme-score={extremeType || 'normal'}
        className={`col-span-1 relative isolate aspect-[2/3] rounded-[20px] p-3 overflow-hidden bg-[#10121a] ${extremeRingClass} flex flex-col justify-between`}
      >
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          <img
            src={entry.anime.cover}
            alt=""
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover scale-150 blur-[38px] saturate-[2.0] opacity-75"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(165deg, rgba(16, 17, 23, 0.55) 0%, rgba(13, 14, 20, 0.85) 100%)',
            }}
          />
        </div>

        <span
          aria-hidden="true"
          className="absolute -top-1.5 right-2.5 text-[42px] font-black leading-none tracking-tighter select-none pointer-events-none tabular-nums z-10 text-white/[0.14]"
        >
          {scoreDisplay}
        </span>

        {/* Compact Top Header */}
        <div className="relative z-10 flex items-center gap-2 mb-2 pr-5">
          <CardCornerBadge
            mode={badgeMode}
            score={entry.score}
            category={entry.anime.category}
            gradingSystem={gradingSystem}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <h3
              className="text-[12.5px] font-extrabold text-white tracking-tight truncate leading-tight"
              title={entry.anime.title}
            >
              {entry.anime.title}
            </h3>
            <p className="text-[9.5px] font-mono text-white/55 tracking-wider uppercase truncate mt-0.5">
              {formatMetaStamp(entry.anime)}
            </p>
          </div>
        </div>

        {/* Vertical Portrait Cover Window */}
        <div className="relative z-10 w-full flex-1 rounded-[13px] overflow-hidden bg-zinc-900 shadow-inner">
          <img
            src={entry.anime.cover}
            alt={entry.anime.title}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-top"
          />
        </div>
      </div>
    );
  };

  // Renders multi-style staggered cards in the 4-Column Asymmetric Waterfall mode
  const renderMasonryCard = (entry: PosterEntry, idx: number) => {
    const extremeType = getPosterExtremeScoreType(entry.score);
    const scoreDisplay = formatWatermarkDisplay(entry.score);
    const hasComment = Boolean(entry.comment?.trim());
    // Choose among 5 distinct vertical waterfall card styles (with boosted comment-card probability when commented)
    const { variant } = choosePosterCardVariant({
      animeId: entry.anime.id,
      index: idx,
      score: entry.score,
      hasComment,
      seed: layoutSeed,
    });

    const extremeAspect =
      extremeType === 'ultra-high' || extremeType === 'ultra-low'
        ? 'aspect-[2/3.35] ring-1 ring-white/20'
        : idx % 3 === 0
        ? 'aspect-[2/3.05]'
        : idx % 3 === 1
        ? 'aspect-[2/2.72]'
        : 'aspect-[2/3.18]';

    if (variant === 'portrait-bottom-feather' || (hasComment && variant === 'wide-feather')) {
      return (
        <div
          key={entry.anime.id}
          data-testid={`poster-card-${entry.anime.id}`}
          className={`relative isolate w-full ${extremeAspect} rounded-[20px] overflow-hidden bg-[#10121a] shadow-[0_14px_32px_rgba(0,0,0,0.5)] flex flex-col justify-between`}
        >
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
            <img
              src={entry.anime.cover}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover scale-150 blur-[36px] saturate-[2.0] opacity-80"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(180deg, rgba(12, 13, 19, 0.94) 0%, rgba(12, 13, 19, 0.80) 48%, rgba(10, 11, 16, 0.25) 100%)',
              }}
            />
          </div>
          <span className="absolute -top-1.5 right-3 text-[44px] font-black leading-none tracking-tighter text-white/[0.15] select-none tabular-nums z-10">
            {scoreDisplay}
          </span>
          <div className="relative z-10 p-3.5 pb-1 pr-4">
            <div className="flex items-center gap-2 mb-1.5">
              <CardCornerBadge
                mode={badgeMode}
                score={entry.score}
                category={entry.anime.category}
                gradingSystem={gradingSystem}
                size="sm"
              />
              <span className="text-[9.5px] font-mono tracking-wider uppercase text-white/60">
                {formatMetaStamp(entry.anime)}
              </span>
            </div>
            <h3 className="text-[13.5px] font-extrabold text-white leading-snug line-clamp-2 mb-1">
              {entry.anime.title}
            </h3>
            {entry.comment && (
              <p
                data-testid={`poster-card-comment-${entry.anime.id}`}
                className="text-[11px] text-zinc-300/75 line-clamp-3 leading-relaxed font-normal"
              >
                {entry.comment}
              </p>
            )}
          </div>
          <div className="relative w-full h-[58%] overflow-hidden z-0 -mt-2 pointer-events-none">
            <img
              src={entry.anime.cover}
              alt={entry.anime.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-top mask-fade-top"
            />
          </div>
        </div>
      );
    }

    if (variant === 'portrait-polaroid' || variant === 'wide-polaroid') {
      return (
        <div
          key={entry.anime.id}
          data-testid={`poster-card-${entry.anime.id}`}
          className={`relative isolate w-full ${extremeAspect} rounded-[20px] p-2.5 overflow-hidden bg-[#12131c] shadow-[0_14px_32px_rgba(0,0,0,0.5)] flex flex-col justify-between`}
        >
          <div className="relative z-10 w-full flex-1 rounded-[13px] overflow-hidden bg-zinc-900 shadow-md">
            <img
              src={entry.anime.cover}
              alt={entry.anime.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-top"
            />
            <div className="absolute top-2.5 left-2.5 z-10">
              <CardCornerBadge
                mode={badgeMode}
                score={entry.score}
                category={entry.anime.category}
                gradingSystem={gradingSystem}
                size="sm"
              />
            </div>
            <span className="absolute bottom-1.5 right-2.5 text-[32px] font-black leading-none tracking-tighter text-white/45 drop-shadow select-none tabular-nums">
              {scoreDisplay}
            </span>
          </div>
          <div className="relative z-10 pt-2.5 px-1">
            <p className="text-[9px] font-mono tracking-wider uppercase text-white/45 mb-0.5">
              {formatMetaStamp(entry.anime)}
            </p>
            <h3 className="text-[13px] font-extrabold text-white leading-snug line-clamp-2">
              {entry.anime.title}
            </h3>
            {entry.comment && (
              <p
                data-testid={`poster-card-comment-${entry.anime.id}`}
                className="text-[11px] text-zinc-400 line-clamp-2 mt-1 leading-snug font-normal"
              >
                {entry.comment}
              </p>
            )}
          </div>
        </div>
      );
    }

    return (
      <div
        key={entry.anime.id}
        data-testid={`poster-card-${entry.anime.id}`}
        className={`relative isolate w-full ${extremeAspect} rounded-[20px] overflow-hidden bg-zinc-900 shadow-[0_14px_32px_rgba(0,0,0,0.5)] flex flex-col justify-between p-3.5`}
      >
        <img
          src={entry.anime.cover}
          alt={entry.anime.title}
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover z-0"
        />
        <div
          className="absolute inset-0 z-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(8, 9, 14, 0.42) 0%, transparent 35%, rgba(8, 9, 14, 0.78) 72%, rgba(8, 9, 14, 0.95) 100%)',
          }}
        />
        <div className="relative z-10 flex items-start justify-between">
          <CardCornerBadge
            mode={badgeMode}
            score={entry.score}
            category={entry.anime.category}
            gradingSystem={gradingSystem}
            size="sm"
          />
          <span className="text-[38px] font-black leading-none tracking-tighter text-white/30 select-none tabular-nums ml-auto">
            {scoreDisplay}
          </span>
        </div>
        <div className="relative z-10">
          <p className="text-[9.5px] font-mono tracking-wider uppercase text-white/60 mb-0.5">
            {formatMetaStamp(entry.anime)}
          </p>
          <h3 className="text-[13.5px] font-extrabold text-white leading-snug line-clamp-2">
            {entry.anime.title}
          </h3>
          {entry.comment && (
            <p
              data-testid={`poster-card-comment-${entry.anime.id}`}
              className="text-[11px] text-zinc-300/75 line-clamp-2 mt-1 leading-snug font-normal"
            >
              {entry.comment}
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      role="dialog"
      data-testid="poster-wall-modal"
      aria-modal="true"
      aria-labelledby="poster-wall-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl max-h-[92vh] flex flex-col rounded-[24px] bg-[#111114] border border-white/[0.1] shadow-[0_24px_80px_rgba(0,0,0,0.9)] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Top Control Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-white/[0.07] bg-white/[0.02] shrink-0">
          <div>
            <h2 id="poster-wall-modal-title" className="text-base font-bold text-white tracking-tight">
              季度 ACGN 鉴赏画报墙（竖封紧凑混排 · 发帖分享专用）
            </h2>
            <p className="text-xs text-white/45">
              高低分乱序穿插 · 超高/超低分自动放大反差 · 有短评作品优先匹配漫评画报卡
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              data-testid="shuffle-poster-layout-btn"
              onClick={() => setLayoutSeed(prev => prev + 1)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.12] text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              <Dices className="w-3.5 h-3.5" />
              <span>随机变换顺序与样式</span>
            </button>

            <button
              type="button"
              data-testid="download-poster-wall-btn"
              onClick={handleDownloadPoster}
              disabled={isExporting || allEntries.length === 0}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-40"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>正在渲染完整长图...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>导出 2x 完整高清长图</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="关闭海报墙窗口"
              className="p-1.5 text-white/50 hover:text-white hover:bg-white/[0.08] rounded-full cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Customization Bar */}
        <div className="px-6 py-3 border-b border-white/[0.07] bg-white/[0.01] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* Layout Mode Switcher */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-black/50 border border-white/[0.08]">
              <button
                type="button"
                onClick={() => setLayoutStyle('mixed-collage')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  layoutStyle === 'mixed-collage'
                    ? 'bg-white text-zinc-950'
                    : 'text-white/65 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>多尺寸竖封紧凑混排</span>
              </button>
              <button
                type="button"
                onClick={() => setLayoutStyle('asym-masonry')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  layoutStyle === 'asym-masonry'
                    ? 'bg-white text-zinc-950'
                    : 'text-white/65 hover:text-white'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>不对称错落瀑布流</span>
              </button>
              <button
                type="button"
                onClick={() => setLayoutStyle('compact-matrix')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  layoutStyle === 'compact-matrix'
                    ? 'bg-white text-zinc-950'
                    : 'text-white/65 hover:text-white'
                }`}
              >
                <Columns className="w-3.5 h-3.5" />
                <span>6列高密全竖封墙</span>
              </button>
            </div>

            {/* 图3 & 图4 1号位置角标切换: 圆环评分 / 类别图标 / 关闭 */}
            <div
              data-testid="poster-badge-mode-group"
              className="flex items-center gap-1 p-1 rounded-xl bg-black/50 border border-white/[0.08]"
              title="切换卡片角标显示：圆环评分 / 动画·书籍·游戏图标 / 关闭"
            >
              <button
                type="button"
                data-testid="badge-mode-score-ring"
                onClick={() => setBadgeMode('score-ring')}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  badgeMode === 'score-ring'
                    ? 'bg-white/[0.16] text-white font-semibold'
                    : 'text-white/55 hover:text-white'
                }`}
              >
                <CircleDot className="w-3.5 h-3.5" />
                <span>圆环评分</span>
              </button>
              <button
                type="button"
                data-testid="badge-mode-category-icon"
                onClick={() => setBadgeMode('category-icon')}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  badgeMode === 'category-icon'
                    ? 'bg-white/[0.16] text-white font-semibold'
                    : 'text-white/55 hover:text-white'
                }`}
              >
                <Gamepad2 className="w-3.5 h-3.5" />
                <span>类型图标</span>
              </button>
              <button
                type="button"
                data-testid="badge-mode-none"
                onClick={() => setBadgeMode('none')}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  badgeMode === 'none'
                    ? 'bg-white/[0.16] text-white font-semibold'
                    : 'text-white/55 hover:text-white'
                }`}
              >
                <EyeOff className="w-3.5 h-3.5" />
                <span>关闭角标</span>
              </button>
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-black/50 border border-white/[0.08]">
              {[
                { id: 'all', label: '全部' },
                { id: 'anime', label: '动画' },
                { id: 'book', label: '书籍' },
                { id: 'game', label: '游戏' },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategoryFilter(tab.id as CategoryFilter)}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    categoryFilter === tab.id
                      ? 'bg-white/[0.16] text-white font-semibold'
                      : 'text-white/55 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <label className="inline-flex items-center gap-1.5 text-xs text-white/75 cursor-pointer select-none ml-1">
              <input
                type="checkbox"
                checked={shuffleScores}
                onChange={e => setShuffleScores(e.target.checked)}
                className="rounded border-white/20"
              />
              <span>高低分乱序穿插</span>
            </label>

            <label className="inline-flex items-center gap-1.5 text-xs text-white/75 cursor-pointer select-none ml-1">
              <input
                type="checkbox"
                checked={includeUnrankedPool}
                onChange={e => setIncludeUnrankedPool(e.target.checked)}
                className="rounded border-white/20"
              />
              <span>含候选池</span>
            </label>
          </div>

          {/* Title & Curator Quick Inputs */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={posterTitle}
              onChange={e => setPosterTitle(e.target.value)}
              placeholder="海报主标题..."
              aria-label="海报主标题"
              className="px-3 py-1.5 rounded-xl bg-black/50 border border-white/[0.1] text-xs text-white w-44 focus:outline-none focus:border-white/35"
            />
            <input
              type="text"
              value={curatorName}
              onChange={e => setCuratorName(e.target.value)}
              placeholder="署名昵称..."
              aria-label="署名昵称"
              className="px-3 py-1.5 rounded-xl bg-black/50 border border-white/[0.1] text-xs text-white w-28 focus:outline-none focus:border-white/35"
            />
          </div>
        </div>

        {/* Scrollable Poster Preview Viewport */}
        <div
          data-testid="poster-scroll-viewport"
          className="flex-1 overflow-y-auto p-5 sm:p-7 bg-[#06070b]"
        >
          <div
            ref={posterRef}
            data-testid="poster-wall-canvas"
            className="w-full max-w-[1120px] mx-auto rounded-[28px] p-7 sm:p-9 bg-[#090a10] shadow-2xl relative isolate h-auto"
            style={{
              backgroundImage:
                'radial-gradient(ellipse 70% 35% at 18% 6%, rgba(99, 102, 241, 0.20) 0%, transparent 72%), radial-gradient(ellipse 65% 35% at 85% 8%, rgba(236, 72, 153, 0.16) 0%, transparent 72%), linear-gradient(180deg, #0d0e17 0%, #08090e 100%)',
            }}
          >
            {/* Ambient Cover Glow in Top Header */}
            <div className="absolute inset-x-0 top-0 h-[260px] pointer-events-none overflow-hidden rounded-t-[28px] z-0">
              {ambientHeaderCovers.map((entry, idx) => (
                <img
                  key={entry.anime.id}
                  src={entry.anime.cover}
                  alt=""
                  referrerPolicy="no-referrer"
                  style={{ left: `${10 + idx * 24}%` }}
                  className="absolute -top-16 w-[300px] h-[240px] object-cover rounded-full blur-[68px] saturate-[2.0] opacity-28"
                />
              ))}
            </div>

            {/* Compact Editorial Magazine Header */}
            <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 mb-6 border-b border-white/[0.08]">
              <div>
                <div className="flex items-center gap-2 text-[10.5px] font-mono tracking-[0.2em] uppercase text-white/45 mb-2">
                  <span>{posterSubtitle}</span>
                  <span>·</span>
                  <span>CURATED BY {curatorName || 'ANITIER'}</span>
                </div>
                <h1 className="text-2xl sm:text-[34px] font-black tracking-tight text-white leading-none">
                  {posterTitle || boardTitle}
                </h1>
              </div>

              {/* Unified Monochrome Glass Stat Capsule */}
              <div className="inline-flex flex-wrap items-center gap-1 p-1.5 rounded-2xl bg-white/[0.05] self-start md:self-auto">
                <div className="px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-white/85">
                  <Tv className="w-3.5 h-3.5 text-white/65" />
                  <span className="text-xs text-white/55">动画</span>
                  <span className="text-sm font-extrabold text-white tabular-nums">
                    {categoryCounts.anime}
                  </span>
                </div>

                <div className="w-[1px] h-4 bg-white/[0.08]" />

                <div className="px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-white/85">
                  <BookOpen className="w-3.5 h-3.5 text-white/65" />
                  <span className="text-xs text-white/55">书籍</span>
                  <span className="text-sm font-extrabold text-white tabular-nums">
                    {categoryCounts.book}
                  </span>
                </div>

                <div className="w-[1px] h-4 bg-white/[0.08]" />

                <div className="px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-white/85">
                  <Gamepad2 className="w-3.5 h-3.5 text-white/65" />
                  <span className="text-xs text-white/55">游戏</span>
                  <span className="text-sm font-extrabold text-white tabular-nums">
                    {categoryCounts.game}
                  </span>
                </div>

                <div className="px-3.5 py-1.5 rounded-xl bg-white text-zinc-950 flex items-center gap-2 ml-1 shadow-sm">
                  <span className="text-xs font-extrabold tabular-nums">
                    TOTAL {categoryCounts.total}
                  </span>
                  <span className="text-[11px] font-mono text-zinc-600">
                    AVG {categoryCounts.avg}
                  </span>
                </div>
              </div>
            </div>

            {/* Poster Content Body */}
            <div className="relative z-10">
              {allEntries.length === 0 ? (
                <div className="py-20 text-center text-white/45">
                  当前筛选下暂无作品，请先在榜单或候选池中添加作品，或使用「BGM 追番同步」导入你的记录。
                </div>
              ) : layoutStyle === 'mixed-collage' ? (
                /* Layout 1 (Default): Compact 6-Column Dense Bento Collage with 8 Card Styles, Shuffled Scores & Extreme-Score Scaling */
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 [grid-auto-flow:dense]">
                  {allEntries.map((entry, idx) => renderMixedCollageCard(entry, idx))}
                </div>
              ) : layoutStyle === 'asym-masonry' ? (
                /* Layout 2: 4-Column Asymmetric Staggered Portrait Masonry Waterfall */
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 items-start">
                  {masonryColumns.map((col, colIdx) => (
                    <div key={colIdx} className="flex flex-col gap-3.5">
                      {col.map(({ entry, idx }) => renderMasonryCard(entry, idx))}
                    </div>
                  ))}
                </div>
              ) : (
                /* Layout 3: 6-Column High-Density Pure Vertical Poster Matrix */
                <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-3">
                  {allEntries.map(entry => (
                    <div
                      key={entry.anime.id}
                      data-testid={`poster-card-${entry.anime.id}`}
                      className="relative isolate aspect-[2/3] rounded-[16px] bg-zinc-900 overflow-hidden shadow-[0_10px_24px_rgba(0,0,0,0.45)] flex flex-col justify-between p-2.5"
                    >
                      <img
                        src={entry.anime.cover}
                        alt={entry.anime.title}
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 w-full h-full object-cover z-0"
                      />
                      <div
                        className="absolute inset-0 z-0"
                        style={{
                          background:
                            'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, transparent 40%, rgba(0,0,0,0.88) 100%)',
                        }}
                      />
                      <div className="relative z-10 flex items-center justify-between">
                        <CardCornerBadge
                          mode={badgeMode}
                          score={entry.score}
                          category={entry.anime.category}
                          gradingSystem={gradingSystem}
                          size="sm"
                        />
                        <span className="text-[28px] font-black leading-none text-white/30 tabular-nums ml-auto">
                          {formatWatermarkDisplay(entry.score)}
                        </span>
                      </div>
                      <div className="relative z-10">
                        <p className="text-xs font-bold text-white leading-tight line-clamp-2">
                          {entry.anime.title}
                        </p>
                        <p className="text-[9px] text-white/55 mt-0.5 font-mono uppercase">
                          {formatMetaStamp(entry.anime)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Poster Footer Signature */}
            <div className="relative z-10 mt-8 pt-4 border-t border-white/[0.07] flex items-center justify-between text-[11px] text-white/40 font-mono">
              <span>BGM ANITIER · github.com/ikemenrourou/BGM-AniTier</span>
              <span>
                {new Date().toISOString().slice(0, 10)} · {categoryCounts.total} WORKS ARCHIVED
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
