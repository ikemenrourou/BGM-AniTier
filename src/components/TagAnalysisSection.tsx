import React, { useState, useMemo } from 'react';
import { Tag as TagIcon, Loader2, X } from 'lucide-react';
import type { AnimeItem, TierMap } from '../types';
import { aggregateTagCounts, ALL_TIER_SCORES, getBoardStats } from '../lib/tierLogic';
import { fetchBangumiSubjectDetail } from '../lib/bangumiApi';

interface TagAnalysisSectionProps {
  tiers: TierMap;
  highlightedTag: string | null;
  onSelectTag: (tag: string | null) => void;
  onUpdateAnimeMetadata: (updated: AnimeItem) => void;
}

export const TagAnalysisSection: React.FC<TagAnalysisSectionProps> = ({
  tiers,
  highlightedTag,
  onSelectTag,
  onUpdateAnimeMetadata,
}) => {
  const [isSyncing, setIsSyncing] = useState(false);

  const tagStats = useMemo(() => aggregateTagCounts(tiers).slice(0, 28), [tiers]);
  const boardStats = useMemo(() => getBoardStats(tiers), [tiers]);

  const handleSyncTagsFromBangumi = async () => {
    setIsSyncing(true);
    try {
      const allItems: AnimeItem[] = [];
      for (const score of ALL_TIER_SCORES) {
        const list = tiers[String(score)] || [];
        for (const item of list) {
          if (!item.isCustom && (!item.tags || item.tags.length === 0)) {
            allItems.push(item);
          }
        }
      }

      for (const item of allItems.slice(0, 12)) {
        const detailed = await fetchBangumiSubjectDetail(item.id);
        if (detailed && detailed.tags && detailed.tags.length > 0) {
          onUpdateAnimeMetadata({
            ...item,
            tags: detailed.tags,
            studio: item.studio || detailed.studio,
            director: item.director || detailed.director,
            bgmScore: item.bgmScore ?? detailed.bgmScore,
          });
        }
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // Apple / PlayStation Wrap-Up monochrome & titanium contrast hierarchy (no tacky blue-purple fills)
  const getTagVisualClass = (index: number, isSelected: boolean) => {
    if (isSelected) {
      return 'bg-white text-zinc-950 font-extrabold text-[15px] px-5 py-2 shadow-[0_0_24px_rgba(255,255,255,0.55)] ring-2 ring-white scale-105';
    }
    if (index < 2) {
      // Top 2 dominant tags: Crisp pure white badge
      return 'bg-white/95 hover:bg-white text-zinc-950 font-bold text-[15.5px] px-5 py-2 shadow-[0_6px_20px_rgba(0,0,0,0.35)]';
    }
    if (index < 8) {
      // Second tier: Bright frosted titanium pill
      return 'bg-white/[0.14] hover:bg-white/[0.22] text-white font-semibold text-[14px] px-4 py-1.5 border border-white/[0.14]';
    }
    if (index < 18) {
      // Third tier: Medium neutral dark glass pill
      return 'bg-white/[0.075] hover:bg-white/[0.14] text-white/90 font-medium text-[12.5px] px-3.5 py-1.5 border border-white/[0.09]';
    }
    // Fourth tier: Subtle smoky pill
    return 'bg-white/[0.04] hover:bg-white/[0.09] text-white/70 font-normal text-[12px] px-3 py-1 border border-white/[0.06]';
  };

  return (
    <section id="tags" className="pt-8">
      {/* Apple / PlayStation Wrap-Up Typographic Summary Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 mb-6 border-b border-white/[0.08]">
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-white/45 mb-1.5">
            TASTE ANALYTICS · 标签与偏好基因
          </p>
          <h2 className="text-2xl sm:text-[28px] font-extrabold tracking-tight text-white">
            Tag 偏好统计
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {highlightedTag && (
            <button
              type="button"
              onClick={() => onSelectTag(null)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white text-zinc-950 text-xs font-bold shadow-sm cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>取消高亮「{highlightedTag}」</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSyncTagsFromBangumi}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.12] text-xs font-semibold text-white transition-all hover:-translate-y-0.5 cursor-pointer disabled:opacity-50"
          >
            {isSyncing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <TagIcon className="w-3.5 h-3.5" />
            )}
            <span>{isSyncing ? '正在同步 Bangumi 标签...' : '同步最新 Bangumi 标签'}</span>
          </button>
        </div>
      </div>

      {/* Main Dark Glass Analytics Card */}
      <div className="w-full rounded-[22px] p-6 sm:p-8 apple-glass-panel space-y-7">
        {/* Bold Display Numbers Row (inspired by PlayStation Wrap-Up typographic rhythm) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-6 border-b border-white/[0.07]">
          <div className="px-4 py-3 rounded-2xl bg-white/[0.025] border border-white/[0.05]">
            <div className="text-[32px] sm:text-[38px] font-black tracking-tight text-white leading-none tabular-nums">
              {boardStats.totalAnime}
            </div>
            <div className="mt-1.5 text-xs font-medium text-white/50">
              已排榜动画总数
            </div>
          </div>

          <div className="px-4 py-3 rounded-2xl bg-white/[0.025] border border-white/[0.05]">
            <div className="text-[32px] sm:text-[38px] font-black tracking-tight text-white leading-none tabular-nums">
              {boardStats.averageScore || '—'}
            </div>
            <div className="mt-1.5 text-xs font-medium text-white/50">
              全榜平均给分
            </div>
          </div>

          <div className="px-4 py-3 rounded-2xl bg-white/[0.025] border border-white/[0.05]">
            <div className="text-[32px] sm:text-[38px] font-black tracking-tight text-white leading-none tabular-nums">
              {boardStats.topTierCount}
            </div>
            <div className="mt-1.5 text-xs font-medium text-white/50">
              9分以上神作数
            </div>
          </div>

          <div className="px-4 py-3 rounded-2xl bg-white/[0.025] border border-white/[0.05]">
            <div className="text-xl sm:text-2xl font-extrabold tracking-tight text-white leading-tight truncate">
              {tagStats[0] ? `#${tagStats[0].name}` : '暂无'}
            </div>
            <div className="mt-2 text-xs font-medium text-white/50">
              头号高频标签 {tagStats[0] ? `(${tagStats[0].count}部 · 均分${tagStats[0].avgScore})` : ''}
            </div>
          </div>
        </div>

        {/* Size-Graded Monochrome & Frosted Glass Tag Cloud */}
        {tagStats.length === 0 ? (
          <div className="py-8 text-center text-sm text-white/45">
            暂无标签数据，请先向排行榜添加动画或点击右上角“同步最新 Bangumi 标签”。
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-center justify-center gap-x-3.5 gap-y-3 max-w-[1200px] mx-auto">
              {tagStats.map((stat, idx) => {
                const isSelected = highlightedTag === stat.name;
                return (
                  <button
                    key={stat.name}
                    type="button"
                    onClick={() => onSelectTag(isSelected ? null : stat.name)}
                    title={`平均分: ${stat.avgScore} 分 · 点击在上方看板高亮包含「${stat.name}」的动画`}
                    className={`rounded-full transition-all duration-200 hover:-translate-y-0.5 cursor-pointer select-none tabular-nums ${getTagVisualClass(
                      idx,
                      isSelected,
                    )}`}
                  >
                    <span>{stat.name}</span>
                    <span className="ml-1.5 opacity-65 text-[0.88em] font-mono">
                      {stat.count}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-5 text-center text-[11px] text-white/35">
              点击任意标签可在上方 Tier List 中联动高亮对应作品
            </p>
          </div>
        )}
      </div>
    </section>
  );
};
