import React, { useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import {
  X,
  Download,
  Dices,
  Sparkles,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Layers,
  Flame,
} from 'lucide-react';
import type { TierGradingSystem } from '../types';
import {
  BLUE_ARCHIVE_EMOTE_META,
  extractUserTextAndHiddenNotes,
  generateSmartFallbackStudioComment,
  parseDialogueSegments,
  resolveCharacterStandeeUrl,
  type StudioCharacterConfig,
  type StudioScriptItem,
} from '../lib/studioDirector';
import { formatTierLabel } from '../lib/tierLogic';

export type ScrapbookCardVariant =
  | 'magazine-overlap'
  | 'diagonal-duet'
  | 'polaroid-featured'
  | 'ticket-stamp';

const ALL_SCRAPBOOK_VARIANTS: ScrapbookCardVariant[] = [
  'magazine-overlap',
  'diagonal-duet',
  'polaroid-featured',
  'ticket-stamp',
];

const VARIANT_LABELS: Record<ScrapbookCardVariant, string> = {
  'magazine-overlap': '杂志叠层拼贴',
  'diagonal-duet': '对角交错漫才',
  'polaroid-featured': '拍立得宽幅手账',
  'ticket-stamp': '复古票根印章',
};

interface StudioScrapbookModalProps {
  isOpen: boolean;
  onClose: () => void;
  boardTitle: string;
  entries: StudioScriptItem[];
  gradingSystem: TierGradingSystem;
  userPersona: StudioCharacterConfig;
  companionPersona: StudioCharacterConfig;
}

function stripInlineTags(text: string): string {
  return text
    .replace(/<\/?(?:big|shake|mask|whisper|大|抖|码|虚)>/gi, '')
    .replace(/\[(?:换页|翻页|下页|next|page)\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolvePersonaSticker(
  persona: StudioCharacterConfig,
  rawText: string,
  isUser = false,
): {
  cleanText: string;
  imageUrl: string;
  emotionName: string;
  symbol: string | null;
} {
  const sourceText = (
    isUser ? extractUserTextAndHiddenNotes(rawText || '').visibleText : rawText || ''
  ).trim();

  if (!sourceText || /^[\s.。…·]+$/.test(sourceText)) {
    const defaultEmotion = isUser ? 'default' : '默认';
    return {
      cleanText: '',
      imageUrl: resolveCharacterStandeeUrl(persona, defaultEmotion, true),
      emotionName: defaultEmotion,
      symbol: null,
    };
  }

  const segments = parseDialogueSegments(sourceText, true, true);
  const joined = stripInlineTags(segments.map(s => s.text).join(' '));
  const cleanText = /^[\s.。…·]+$/.test(joined) ? '' : joined;
  let emotionName = isUser ? 'default' : '默认';
  let emoteId = 'none';

  for (const seg of segments) {
    if (seg.expression && seg.expression !== 'default' && seg.expression !== '默认') {
      emotionName = seg.expression;
    }
    if (seg.emote && seg.emote !== 'none') {
      emoteId = seg.emote;
    }
    for (const cue of seg.cues || []) {
      if (cue.expression && cue.expression !== 'default' && cue.expression !== '默认') {
        emotionName = cue.expression;
      }
      if (cue.emote && cue.emote !== 'none') {
        emoteId = cue.emote;
      }
    }
  }

  const imageUrl = resolveCharacterStandeeUrl(persona, emotionName, true);
  const emoteMeta = BLUE_ARCHIVE_EMOTE_META.find(e => e.id === emoteId);
  const symbol = emoteId !== 'none' && emoteMeta ? emoteMeta.badgeText : null;

  return {
    cleanText,
    imageUrl,
    emotionName,
    symbol,
  };
}

function getScoreBadgeTheme(score: number): {
  stampBg: string;
  stampBorder: string;
  stampText: string;
  tagLabel: string;
} {
  if (score >= 8.5) {
    return {
      stampBg: 'bg-amber-500/20',
      stampBorder: 'border-amber-300/70',
      stampText: 'text-amber-200',
      tagLabel: '神作认证',
    };
  }
  if (score >= 7) {
    return {
      stampBg: 'bg-sky-500/20',
      stampBorder: 'border-sky-300/65',
      stampText: 'text-sky-200',
      tagLabel: '佳作推荐',
    };
  }
  if (score <= 4.5) {
    return {
      stampBg: 'bg-rose-500/25',
      stampBorder: 'border-rose-300/70',
      stampText: 'text-rose-200',
      tagLabel: '高危避雷',
    };
  }
  return {
    stampBg: 'bg-zinc-500/25',
    stampBorder: 'border-white/40',
    stampText: 'text-zinc-100',
    tagLabel: '客观留档',
  };
}

export const StudioScrapbookModal: React.FC<StudioScrapbookModalProps> = ({
  isOpen,
  onClose,
  boardTitle,
  entries,
  gradingSystem,
  userPersona,
  companionPersona,
}) => {
  const pageContainerRef = useRef<HTMLDivElement>(null);

  const [selectedIds, setSelectedIds] = useState<number[]>(() =>
    entries.slice(0, Math.min(entries.length, 6)).map(e => e.animeId),
  );
  const [itemsPerPage, setItemsPerPage] = useState<2 | 3>(3);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  const [variantMap, setVariantMap] = useState<Record<number, ScrapbookCardVariant>>({});

  const effectiveSelectedIds = useMemo(() => {
    const validIds = new Set(entries.map(e => e.animeId));
    const filtered = selectedIds.filter(id => validIds.has(id));
    if (filtered.length > 0) return filtered;
    return entries.slice(0, Math.min(entries.length, 6)).map(e => e.animeId);
  }, [entries, selectedIds]);

  const activeEntries = useMemo(() => {
    const selectedSet = new Set(effectiveSelectedIds);
    return entries.filter(e => selectedSet.has(e.animeId));
  }, [entries, effectiveSelectedIds]);

  const pages = useMemo(() => {
    const result: StudioScriptItem[][] = [];
    for (let i = 0; i < activeEntries.length; i += itemsPerPage) {
      result.push(activeEntries.slice(i, i + itemsPerPage));
    }
    return result.length > 0 ? result : [[]];
  }, [activeEntries, itemsPerPage]);

  const safePageIdx = Math.min(currentPageIdx, Math.max(0, pages.length - 1));
  const currentPageEntries = pages[safePageIdx] || [];

  if (!isOpen) return null;

  const getVariantForEntry = (animeId: number, fallbackIndex: number): ScrapbookCardVariant => {
    return (
      variantMap[animeId] ||
      ALL_SCRAPBOOK_VARIANTS[fallbackIndex % ALL_SCRAPBOOK_VARIANTS.length]
    );
  };

  const handleShuffleVariants = () => {
    const next: Record<number, ScrapbookCardVariant> = {};
    let bag: ScrapbookCardVariant[] = [];
    entries.forEach((entry, idx) => {
      if (bag.length === 0) {
        bag = [...ALL_SCRAPBOOK_VARIANTS];
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
        const prev = getVariantForEntry(entry.animeId, idx);
        if (bag[0] === prev && bag.length > 1) {
          [bag[0], bag[1]] = [bag[1], bag[0]];
        }
      }
      next[entry.animeId] = bag.shift()!;
    });
    setVariantMap(next);
  };

  const handleCycleSingleVariant = (animeId: number, fallbackIndex: number) => {
    const current = getVariantForEntry(animeId, fallbackIndex);
    const nextIdx = (ALL_SCRAPBOOK_VARIANTS.indexOf(current) + 1) % ALL_SCRAPBOOK_VARIANTS.length;
    setVariantMap(prev => ({
      ...prev,
      [animeId]: ALL_SCRAPBOOK_VARIANTS[nextIdx],
    }));
  };

  const handleToggleWork = (animeId: number) => {
    setSelectedIds(() => {
      if (effectiveSelectedIds.includes(animeId)) {
        if (effectiveSelectedIds.length <= 1) return effectiveSelectedIds;
        return effectiveSelectedIds.filter(id => id !== animeId);
      }
      return [...effectiveSelectedIds, animeId];
    });
    setCurrentPageIdx(0);
  };

  const handleSelectAll = () => {
    setSelectedIds(entries.map(e => e.animeId));
    setCurrentPageIdx(0);
  };

  const handleSelectWithSceneImage = () => {
    const withImg = entries.filter(e => Boolean(e.userImage)).map(e => e.animeId);
    if (withImg.length > 0) {
      setSelectedIds(withImg);
      setCurrentPageIdx(0);
    } else {
      handleSelectRandomSix();
    }
  };

  const handleSelectHighLowContrast = () => {
    const sorted = [...entries].sort((a, b) => b.targetScore - a.targetScore);
    const top = sorted.slice(0, 3);
    const bottom = sorted.slice(-3).reverse();
    const combined = Array.from(new Set([...top, ...bottom].map(e => e.animeId)));
    setSelectedIds(combined);
    setCurrentPageIdx(0);
  };

  const handleSelectRandomSix = () => {
    const pool = [...entries];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    setSelectedIds(pool.slice(0, Math.min(6, pool.length)).map(e => e.animeId));
    setCurrentPageIdx(0);
  };

  const handleExportCurrentPage = async () => {
    if (!pageContainerRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const dataUrl = await toPng(pageContainerRef.current, {
        pixelRatio: 2,
        cacheBust: true,
      });
      const link = document.createElement('a');
      link.download = `${(boardTitle || 'anitier').replace(/[\\/:*?"<>|]/g, '_')}-手账贴纸卡-P${safePageIdx + 1}.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportAllPages = async () => {
    if (!pageContainerRef.current || isExporting) return;
    setIsExporting(true);
    const initialPage = safePageIdx;
    try {
      for (let i = 0; i < pages.length; i++) {
        setCurrentPageIdx(i);
        await new Promise(resolve => setTimeout(resolve, 180));
        if (!pageContainerRef.current) continue;
        const dataUrl = await toPng(pageContainerRef.current, {
          pixelRatio: 2,
          cacheBust: true,
        });
        const link = document.createElement('a');
        link.download = `${(boardTitle || 'anitier').replace(/[\\/:*?"<>|]/g, '_')}-手账贴纸卡-P${i + 1}.png`;
        link.href = dataUrl;
        link.click();
      }
    } finally {
      setCurrentPageIdx(initialPage);
      setIsExporting(false);
    }
  };

  const renderStickerBubble = (
    speakerName: string,
    text: string,
    stickerUrl: string,
    symbol: string | null,
    side: 'left' | 'right',
    accentBg: string,
  ) => {
    const displayText = text || '（无台词）';
    return (
      <div
        className={`relative flex items-end gap-2.5 ${
          side === 'right' ? 'flex-row-reverse' : 'flex-row'
        }`}
      >
        {/* Character Standee Sticker overlapping the corner */}
        <div className="relative shrink-0 w-14 h-14 sm:w-16 sm:h-16 select-none">
          {stickerUrl ? (
            <img
              src={stickerUrl}
              alt={speakerName}
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.65)]"
            />
          ) : (
            <div className="w-full h-full rounded-2xl bg-white/10 border border-white/25 flex items-center justify-center text-xs font-black text-white">
              {speakerName.slice(0, 2)}
            </div>
          )}
          {symbol && (
            <span className="absolute -top-1.5 -right-1 px-1.5 py-0.5 rounded-full bg-zinc-950/90 border border-white/25 text-[10px] font-black text-amber-300 leading-none shadow-md">
              {symbol}
            </span>
          )}
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-md bg-zinc-950/90 border border-white/20 text-[9px] font-extrabold text-white whitespace-nowrap shadow">
            {speakerName}
          </span>
        </div>

        {/* Hand-drawn Scrapbook Speech Bubble */}
        <div
          className={`relative flex-1 rounded-2xl px-3.5 py-2.5 border-2 border-zinc-900 shadow-[3px_4px_0px_rgba(12,12,16,0.92)] ${accentBg} text-zinc-950`}
        >
          <p className="text-[12.5px] sm:text-[13px] font-bold leading-relaxed break-words">
            {displayText}
          </p>
        </div>
      </div>
    );
  };

  const renderWorkCard = (entry: StudioScriptItem, idxOnPage: number) => {
    const variant = getVariantForEntry(entry.animeId, idxOnPage);
    const scoreDisplay = formatTierLabel(entry.targetScore, gradingSystem);
    const badgeTheme = getScoreBadgeTheme(entry.targetScore);
    const userSticker = resolvePersonaSticker(userPersona, entry.userText || '', true);
    const fallbackAiRaw =
      entry.aiRawText?.trim() ||
      generateSmartFallbackStudioComment({
        anime: entry.anime,
        targetScore: entry.targetScore,
        userText: entry.userText,
        companionId: companionPersona.id,
        previousWorks: [],
        gradingSystem,
      });
    const aiSticker = resolvePersonaSticker(companionPersona, fallbackAiRaw, false);
    const userCommentText =
      userSticker.cleanText || `定档 ${scoreDisplay}${gradingSystem === 'letter' ? ' 级' : ' 分'} · 《${entry.anime.title}》`;
    const aiCommentText =
      aiSticker.cleanText || '这部作品的排位已经记录在案啦！';

    // Variant 1: Magazine Overlap (Tilted Polaroid Left + Interlocking Stacked Bubbles + Optional Taped Scene Photo)
    if (variant === 'magazine-overlap') {
      return (
        <article
          key={entry.animeId}
          data-testid={`scrapbook-card-${entry.animeId}`}
          data-variant={variant}
          className="relative rounded-[24px] border border-white/15 bg-[#151824]/95 p-4 sm:p-5 overflow-hidden shadow-[0_14px_34px_rgba(0,0,0,0.45)]"
        >
          {entry.anime.cover && (
            <img
              src={entry.anime.cover}
              alt=""
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-cover opacity-15 blur-2xl scale-110 pointer-events-none"
            />
          )}

          <div className="relative z-10 flex flex-col sm:flex-row gap-4 items-stretch">
            <div className="sm:w-[152px] shrink-0 flex flex-col justify-between">
              <div className="relative bg-[#faf7f0] p-2 pb-3 rounded-xl shadow-[0_10px_24px_rgba(0,0,0,0.55)] -rotate-1 border border-zinc-300">
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-14 h-4 bg-amber-200/75 rotate-2 rounded-xs shadow-xs" />
                <div className="relative aspect-[3/4] w-full rounded-lg overflow-hidden bg-zinc-900">
                  {entry.anime.cover ? (
                    <img
                      src={entry.anime.cover}
                      alt={entry.anime.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-white/50 p-2 text-center">
                      {entry.anime.title}
                    </div>
                  )}
                  <div className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded-lg bg-zinc-950/90 border border-white/30 text-white font-black text-sm shadow-lg">
                    {gradingSystem === 'letter' ? `${scoreDisplay} 档` : `${scoreDisplay} 分`}
                  </div>
                </div>
                <h4 className="mt-2 text-[12px] font-black text-zinc-900 leading-snug line-clamp-2 text-center">
                  {entry.anime.title}
                </h4>
              </div>

              {entry.userImage && (
                <div className="mt-2.5 bg-[#faf7f0] p-1.5 rounded-lg shadow-md rotate-1 border border-zinc-300">
                  <img
                    src={entry.userImage}
                    alt="名场面配图"
                    referrerPolicy="no-referrer"
                    className="w-full h-20 object-cover rounded"
                  />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 flex flex-col justify-center gap-3">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-extrabold tracking-wide ${badgeTheme.stampBg} ${badgeTheme.stampBorder} ${badgeTheme.stampText}`}
                >
                  #{entry.orderIndex + 1} · {badgeTheme.tagLabel}
                </span>
                {entry.anime.bgmScore && (
                  <span className="text-[10px] font-mono text-white/50">
                    BGM {entry.anime.bgmScore}
                  </span>
                )}
              </div>

              {renderStickerBubble(
                userPersona.name,
                userCommentText,
                userSticker.imageUrl,
                userSticker.symbol,
                'left',
                'bg-[#fffdf7]',
              )}

              {renderStickerBubble(
                companionPersona.name,
                aiCommentText,
                aiSticker.imageUrl,
                aiSticker.symbol,
                'right',
                'bg-[#fef3c7]',
              )}
            </div>
          </div>
        </article>
      );
    }

    // Variant 2: Diagonal Duet
    if (variant === 'diagonal-duet') {
      return (
        <article
          key={entry.animeId}
          data-testid={`scrapbook-card-${entry.animeId}`}
          data-variant={variant}
          className="relative rounded-[24px] border border-white/15 bg-[#171522]/95 p-4 sm:p-5 overflow-hidden shadow-[0_14px_34px_rgba(0,0,0,0.45)] space-y-3"
        >
          <div className="flex items-center gap-3 pb-2.5 border-b border-dashed border-white/15">
            <div className="w-12 h-16 rounded-lg overflow-hidden shrink-0 border border-white/25 shadow-md rotate-1 bg-zinc-900">
              {entry.anime.cover && (
                <img
                  src={entry.anime.cover}
                  alt={entry.anime.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-rose-300/90 font-bold">
                  SCENE #{entry.orderIndex + 1} · DIAGONAL ROAST
                </span>
              </div>
              <h4 className="text-sm sm:text-base font-black text-white truncate mt-0.5">
                《{entry.anime.title}》
              </h4>
            </div>
            <div
              className={`shrink-0 px-3 py-1.5 rounded-xl border-2 font-black text-base -rotate-3 shadow-md ${badgeTheme.stampBg} ${badgeTheme.stampBorder} ${badgeTheme.stampText}`}
            >
              {gradingSystem === 'letter' ? `${scoreDisplay} 档` : `${scoreDisplay} 分`}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
            <div
              className={
                entry.userImage ? 'sm:col-span-8 space-y-2.5' : 'sm:col-span-12 space-y-2.5'
              }
            >
              {renderStickerBubble(
                userPersona.name,
                userCommentText,
                userSticker.imageUrl,
                userSticker.symbol,
                'left',
                'bg-[#f8fafc]',
              )}
              {renderStickerBubble(
                companionPersona.name,
                aiCommentText,
                aiSticker.imageUrl,
                aiSticker.symbol,
                'right',
                'bg-[#ffe4e6]',
              )}
            </div>

            {entry.userImage && (
              <div className="sm:col-span-4 bg-[#faf7f0] p-2 rounded-xl border border-zinc-300 shadow-lg rotate-1">
                <img
                  src={entry.userImage}
                  alt="剧照贴纸"
                  referrerPolicy="no-referrer"
                  className="w-full h-32 object-cover rounded-lg"
                />
                <p className="text-[10px] font-mono text-zinc-600 text-center mt-1 font-bold">
                  SNAPSHOT MEMO
                </p>
              </div>
            )}
          </div>
        </article>
      );
    }

    // Variant 3: Polaroid Featured
    if (variant === 'polaroid-featured') {
      return (
        <article
          key={entry.animeId}
          data-testid={`scrapbook-card-${entry.animeId}`}
          data-variant={variant}
          className="relative rounded-[24px] border border-white/15 bg-[#121921]/95 p-4 sm:p-5 overflow-hidden shadow-[0_14px_34px_rgba(0,0,0,0.45)] space-y-3.5"
        >
          <div className="flex items-center gap-3.5 bg-white/[0.04] border border-white/10 rounded-2xl p-2.5">
            <div className="relative w-14 h-20 rounded-xl overflow-hidden shrink-0 border border-white/20 bg-zinc-900">
              {entry.anime.cover && (
                <img
                  src={entry.anime.cover}
                  alt={entry.anime.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            {entry.userImage && (
              <div className="relative w-28 h-20 rounded-xl overflow-hidden shrink-0 border border-white/20 bg-zinc-900">
                <img
                  src={entry.userImage}
                  alt="名场面"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <span
                className={`inline-block px-2 py-0.5 rounded-md border text-[10px] font-bold ${badgeTheme.stampBg} ${badgeTheme.stampBorder} ${badgeTheme.stampText}`}
              >
                {badgeTheme.tagLabel}
              </span>
              <h4 className="text-sm sm:text-base font-black text-white line-clamp-2 mt-1">
                {entry.anime.title}
              </h4>
            </div>
            <div className="shrink-0 w-12 h-12 rounded-2xl bg-white text-zinc-950 flex flex-col items-center justify-center font-black shadow-md">
              <span className="text-base leading-none">{scoreDisplay}</span>
              <span className="text-[9px] font-mono uppercase text-zinc-600 mt-0.5">
                {gradingSystem === 'letter' ? 'TIER' : 'SCORE'}
              </span>
            </div>
          </div>

          <div className="space-y-2.5">
            {renderStickerBubble(
              userPersona.name,
              userCommentText,
              userSticker.imageUrl,
              userSticker.symbol,
              'left',
              'bg-[#fffbeb]',
            )}
            {renderStickerBubble(
              companionPersona.name,
              aiCommentText,
              aiSticker.imageUrl,
              aiSticker.symbol,
              'right',
              'bg-[#e0f2fe]',
            )}
          </div>
        </article>
      );
    }

    // Variant 4: Ticket Stamp
    return (
      <article
        key={entry.animeId}
        data-testid={`scrapbook-card-${entry.animeId}`}
        data-variant={variant}
        className="relative rounded-[24px] border-2 border-dashed border-white/20 bg-[#18161b]/95 p-4 sm:p-5 overflow-hidden shadow-[0_14px_34px_rgba(0,0,0,0.45)]"
      >
        <div className="flex flex-col sm:flex-row-reverse gap-4 items-stretch">
          <div className="sm:w-[144px] shrink-0 flex flex-col justify-between sm:pl-3 sm:border-l sm:border-dashed sm:border-white/15">
            <div className="relative rounded-xl overflow-hidden border border-white/20 shadow-lg rotate-1 bg-zinc-900 aspect-[3/4]">
              {entry.anime.cover && (
                <img
                  src={entry.anime.cover}
                  alt={entry.anime.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent p-2">
                <p className="text-[11px] font-bold text-white leading-tight line-clamp-2">
                  {entry.anime.title}
                </p>
              </div>
              <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-rose-500 text-white font-black text-xs shadow">
                {gradingSystem === 'letter' ? `${scoreDisplay} 档` : `${scoreDisplay} 分`}
              </div>
            </div>
            {entry.userImage && (
              <img
                src={entry.userImage}
                alt="配图"
                referrerPolicy="no-referrer"
                className="mt-2 w-full h-16 object-cover rounded-lg border border-white/20"
              />
            )}
          </div>

          <div className="flex-1 min-w-0 flex flex-col justify-center gap-2.5">
            <div className="flex items-center justify-between text-[10px] font-mono text-white/50 uppercase tracking-widest">
              <span>ADMIT ONE · STUDIO TICKET #{entry.orderIndex + 1}</span>
              <span>{badgeTheme.tagLabel}</span>
            </div>
            {renderStickerBubble(
              userPersona.name,
              userCommentText,
              userSticker.imageUrl,
              userSticker.symbol,
              'left',
              'bg-[#ffffff]',
            )}
            {renderStickerBubble(
              companionPersona.name,
              aiCommentText,
              aiSticker.imageUrl,
              aiSticker.symbol,
              'right',
              'bg-[#f3e8ff]',
            )}
          </div>
        </div>
      </article>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="studio-scrapbook-modal"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-hidden"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[1360px] h-full max-h-[92vh] rounded-[28px] border border-white/15 bg-[#0d0f17] shadow-2xl flex flex-col lg:flex-row overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Left Sidebar: Work Selection & Layout Controls */}
        <div className="w-full lg:w-[380px] shrink-0 border-b lg:border-b-0 lg:border-r border-white/10 flex flex-col bg-white/[0.02] max-h-[42vh] lg:max-h-none">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>小剧场手账贴纸卡导出</span>
              </h2>
              <p className="text-[11px] text-white/50 mt-0.5">
                4 种交错拼贴版式随机混排 · 自动分页拒绝超长面条图
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭手账导出"
              className="p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 space-y-3 border-b border-white/10">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                data-testid="scrapbook-shuffle-variants-btn"
                onClick={handleShuffleVariants}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-400 text-zinc-950 hover:bg-amber-300 text-xs font-extrabold cursor-pointer shadow-xs"
              >
                <Dices className="w-3.5 h-3.5" />
                <span>随机变换卡片版式</span>
              </button>

              <div className="inline-flex items-center rounded-xl bg-white/[0.06] border border-white/10 p-0.5 ml-auto">
                <button
                  type="button"
                  onClick={() => {
                    setItemsPerPage(2);
                    setCurrentPageIdx(0);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                    itemsPerPage === 2 ? 'bg-white text-zinc-950' : 'text-white/65 hover:text-white'
                  }`}
                >
                  每页 2 部
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setItemsPerPage(3);
                    setCurrentPageIdx(0);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                    itemsPerPage === 3 ? 'bg-white text-zinc-950' : 'text-white/65 hover:text-white'
                  }`}
                >
                  每页 3 部
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={handleSelectAll}
                className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[11px] text-white/85 cursor-pointer"
              >
                全选 ({entries.length})
              </button>
              <button
                type="button"
                onClick={handleSelectHighLowContrast}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[11px] text-white/85 cursor-pointer"
              >
                <Flame className="w-3 h-3 text-rose-300" />
                <span>高分+低分精选</span>
              </button>
              <button
                type="button"
                onClick={handleSelectWithSceneImage}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[11px] text-white/85 cursor-pointer"
              >
                <ImageIcon className="w-3 h-3 text-sky-300" />
                <span>有配图优先</span>
              </button>
              <button
                type="button"
                onClick={handleSelectRandomSix}
                className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[11px] text-white/85 cursor-pointer"
              >
                随机挑 6 部
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {entries.map((entry, idx) => {
              const checked = effectiveSelectedIds.includes(entry.animeId);
              const v = getVariantForEntry(entry.animeId, idx);
              return (
                <div
                  key={entry.animeId}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs transition-colors ${
                    checked
                      ? 'bg-white/[0.09] border-white/25 text-white'
                      : 'bg-white/[0.02] border-white/5 text-white/45 hover:text-white/75'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleToggleWork(entry.animeId)}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                  >
                    {checked ? (
                      <CheckSquare className="w-4 h-4 text-amber-300 shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-white/30 shrink-0" />
                    )}
                    <span className="font-mono text-[11px] text-white/50 shrink-0">
                      #{idx + 1}
                    </span>
                    <span className="truncate font-semibold">{entry.anime.title}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCycleSingleVariant(entry.animeId, idx)}
                    title="点击切换该卡片的拼贴版式"
                    className="shrink-0 px-2 py-0.5 rounded-md bg-black/40 hover:bg-black/70 border border-white/15 text-[10px] text-white/75 cursor-pointer"
                  >
                    {VARIANT_LABELS[v]}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="p-4 border-t border-white/10 space-y-2 bg-black/30">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                data-testid="scrapbook-export-current-btn"
                disabled={isExporting || currentPageEntries.length === 0}
                onClick={handleExportCurrentPage}
                className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 text-xs font-extrabold cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isExporting ? '生成中...' : `导出当前页 (${safePageIdx + 1}/${pages.length})`}</span>
              </button>
              <button
                type="button"
                data-testid="scrapbook-export-all-btn"
                disabled={isExporting || pages.length === 0}
                onClick={handleExportAllPages}
                className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-white/[0.1] hover:bg-white/[0.18] border border-white/20 text-xs font-bold text-white cursor-pointer disabled:opacity-50"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>批量导出全部 ({pages.length} 张)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Preview Area: Paginated Scrapbook Card Sheet */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#07080d]">
          <div className="px-6 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="text-xs text-white/65">
              已选 <strong className="text-white">{activeEntries.length}</strong> 部作品 · 自动切分为{' '}
              <strong className="text-white">{pages.length}</strong> 张社交平台手账卡
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePageIdx <= 0}
                onClick={() => setCurrentPageIdx(p => Math.max(0, p - 1))}
                className="p-1.5 rounded-lg bg-white/[0.07] hover:bg-white/[0.14] text-white disabled:opacity-30 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono text-white px-2">
                PAGE {safePageIdx + 1} / {pages.length}
              </span>
              <button
                type="button"
                disabled={safePageIdx >= pages.length - 1}
                onClick={() => setCurrentPageIdx(p => Math.min(pages.length - 1, p + 1))}
                className="p-1.5 rounded-lg bg-white/[0.07] hover:bg-white/[0.14] text-white disabled:opacity-30 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center items-start">
            <div
              ref={pageContainerRef}
              data-testid="scrapbook-export-sheet"
              className="w-full max-w-[740px] rounded-[30px] p-6 sm:p-7 border border-white/15 bg-gradient-to-b from-[#11131f] via-[#0d0f18] to-[#090a10] shadow-2xl space-y-5"
            >
              <div className="flex items-end justify-between gap-4 pb-4 border-b border-white/12">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-amber-300/80">
                    BGM ANITIER · STUDIO ROAST ZINE
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-1">
                    {boardTitle} · 小剧场精选吐槽手账
                  </h3>
                </div>
                <div className="shrink-0 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-[11px] font-mono text-white/85">
                  VOL.{safePageIdx + 1} / {pages.length}
                </div>
              </div>

              <div className="space-y-4">
                {currentPageEntries.map((entry, idx) => renderWorkCard(entry, idx))}
              </div>

              <div className="pt-3 border-t border-white/10 flex items-center justify-between text-[10.5px] font-mono text-white/45">
                <span>BGM ANITIER · STUDIO ZINE ARCHIVE</span>
                <span>
                  {userPersona.name} × {companionPersona.name} · PAGE {safePageIdx + 1}/{pages.length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
