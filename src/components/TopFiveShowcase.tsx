import React, { useState, useMemo } from 'react';
import { Sparkles, Info } from 'lucide-react';
import type { AnimeItem, CommentItem, TierMap, TierScore } from '../types';
import { ALL_TIER_SCORES } from '../lib/tierLogic';

interface TopFiveShowcaseProps {
  tiers: TierMap;
  comments: CommentItem[];
  onSelectAnimeDetail: (anime: AnimeItem, score: TierScore) => void;
}

export const TopFiveShowcase: React.FC<TopFiveShowcaseProps> = ({
  tiers,
  comments,
  onSelectAnimeDetail,
}) => {
  const [activeIndex, setActiveIndex] = useState<number>(0);

  const topFive = useMemo(() => {
    const list: Array<{ anime: AnimeItem; score: TierScore }> = [];
    for (const score of ALL_TIER_SCORES) {
      const items = tiers[String(score)] || [];
      for (const anime of items) {
        list.push({ anime, score });
        if (list.length >= 5) return list;
      }
    }
    return list;
  }, [tiers]);

  const commentMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of comments) {
      if (c.text?.trim()) map.set(c.animeId, c.text.trim());
    }
    return map;
  }, [comments]);

  if (topFive.length === 0) return null;

  const safeIndex = activeIndex < topFive.length ? activeIndex : 0;

  return (
    <section aria-label="殿堂前五名展柜" className="w-full">
      {/* Top Editorial Cast Switcher Bar (Inspired by Video 00:04 CAST 01. 夏目 結衣 02. 浅見 凛) */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-3.5 px-1">
        <div className="flex items-center gap-3">
          <span className="text-white/40 font-mono-tech text-xs tracking-[0.2em]">//</span>
          <span className="font-mono-tech text-[11px] uppercase tracking-[0.24em] text-white/60">
            CURATED HALL OF FAME · 殿堂前五映像
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span className="font-mono-tech text-[10px] tracking-[0.28em] text-white/40 uppercase">
            CAST
          </span>
          {topFive.map((entry, idx) => {
            const isActive = idx === safeIndex;
            return (
              <button
                key={entry.anime.id}
                type="button"
                onClick={() => setActiveIndex(idx)}
                className={`font-serif-jp tracking-wider transition-all cursor-pointer ${
                  isActive
                    ? 'text-white font-bold underline decoration-white/60 underline-offset-4'
                    : 'text-white/45 hover:text-white/80'
                }`}
              >
                <span className="font-mono-tech text-[11px] mr-1">
                  0{idx + 1}.
                </span>
                {entry.anime.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* PlayStation Wrap-Up × Japanese Literary VN 5-Blade Accordion */}
      <div className="flex flex-col lg:flex-row gap-3 w-full lg:h-[410px]">
        {topFive.map((entry, idx) => {
          const isExpanded = idx === safeIndex;
          const { anime, score } = entry;
          const personalIndex = Math.round(score * 10);
          const bgmIndex = anime.bgmScore ? Math.round(anime.bgmScore * 10) : 85;
          const quote =
            commentMap.get(anime.id) ||
            anime.summary ||
            '跨越时间的记忆与光影，构筑起独属于个人的精神坐标。';

          return (
            <div
              key={anime.id}
              onClick={() => setActiveIndex(idx)}
              onMouseEnter={() => setActiveIndex(idx)}
              className={`relative overflow-hidden rounded-[24px] border transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer select-none ${
                isExpanded
                  ? 'lg:flex-[4.2] min-h-[370px] lg:min-h-0 border-white/20 shadow-[0_24px_60px_rgba(0,0,0,0.65)]'
                  : 'lg:flex-[0.75] min-h-[84px] lg:min-h-0 border-white/10 opacity-75 hover:opacity-95 bg-slate-950'
              }`}
            >
              {/* Background Artwork with Cinematic Grading */}
              <img
                src={anime.cover}
                alt={anime.title}
                referrerPolicy="no-referrer"
                className={`absolute inset-0 w-full h-full object-cover transition-all duration-700 ${
                  isExpanded
                    ? 'scale-100 brightness-[0.55] saturate-[1.08]'
                    : 'scale-110 brightness-[0.36] blur-[1px]'
                }`}
              />

              {/* Multi-stop Editorial Scrim */}
              <div
                className="absolute inset-0"
                style={{
                  background: isExpanded
                    ? 'linear-gradient(90deg, rgba(7,8,12,0.88) 0%, rgba(7,8,12,0.45) 52%, rgba(7,8,12,0.82) 100%), linear-gradient(180deg, rgba(7,8,12,0.4) 0%, transparent 40%, rgba(7,8,12,0.92) 100%)'
                    : 'linear-gradient(180deg, rgba(7,8,12,0.65) 0%, rgba(7,8,12,0.45) 50%, rgba(7,8,12,0.88) 100%)',
                }}
              />

              {isExpanded ? (
                /* EXPANDED LITERARY SCENE (Exact homage to Video & 夏目結衣 reference) */
                <div className="relative z-10 w-full h-full p-6 sm:p-8 flex flex-col justify-between">
                  {/* Top Bar: EPISODE 01 / ORIGINAL TITLE */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-white text-black font-mono-tech text-xs font-extrabold shadow">
                        {idx + 1}
                      </span>
                      <span className="font-mono-tech text-[11px] tracking-[0.22em] text-white/75 uppercase">
                        ARCHIVE 0{idx + 1} // {anime.originalTitle || anime.title}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        onSelectAnimeDetail(anime, score);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-[11px] font-mono-tech tracking-wider text-white/90 backdrop-blur-md transition-colors cursor-pointer"
                    >
                      <Info className="w-3 h-3" />
                      <span>SPEC // 详情</span>
                    </button>
                  </div>

                  {/* Middle: Vertical Literary Typography (夏目 結衣 style) */}
                  <div className="my-auto py-2 flex items-start gap-6 sm:gap-8 overflow-hidden">
                    <div className="writing-vertical-upright font-serif-jp text-xl sm:text-[26px] font-bold tracking-[0.14em] text-white whitespace-nowrap leading-none drop-shadow-[0_4px_16px_rgba(0,0,0,0.85)]">
                      {anime.title.slice(0, 8)}
                    </div>

                    {anime.originalTitle && (
                      <div className="hidden sm:block writing-vertical font-serif-jp text-xs tracking-[0.25em] text-white/55 max-h-[190px]">
                        {anime.originalTitle}
                      </div>
                    )}

                    <div className="writing-vertical font-serif-jp text-xs sm:text-[13.5px] tracking-[0.16em] text-white/85 leading-[1.9] max-h-[195px] border-l border-white/15 pl-4">
                      「{quote.slice(0, 56)}{quote.length > 56 ? '……' : ''}」
                    </div>
                  </div>

                  {/* Bottom Hairline Telemetry Bar (年齢 / 身長 / 羈絆深度 85 / 100 style) */}
                  <div className="pt-3.5 border-t border-white/15 flex flex-col sm:flex-row sm:items-end justify-between gap-3 text-xs">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-white/75">
                        <span>
                          <span className="text-[11px] text-white/45 mr-1.5">动画制作</span>
                          <strong className="font-serif-jp text-white font-semibold">
                            {anime.studio || '未收录'}
                          </strong>
                        </span>
                        <span>
                          <span className="text-[11px] text-white/45 mr-1.5">核心监督</span>
                          <strong className="font-serif-jp text-white font-semibold">
                            {anime.director || '未收录'}
                          </strong>
                        </span>
                        <span>
                          <span className="text-[11px] text-white/45 mr-1.5">放送时期</span>
                          <strong className="font-mono-tech text-white">
                            {anime.airDate || '—'}
                          </strong>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 font-mono-tech">
                        <span>
                          <span className="text-[11px] font-sans text-white/45 mr-2">共鸣深度</span>
                          <span className="text-white font-semibold">{personalIndex}</span>
                          <span className="text-white/40"> / 100</span>
                        </span>
                        <span>
                          <span className="text-[11px] font-sans text-white/45 mr-2">大众口碑</span>
                          <span className="text-rose-400 font-semibold">{bgmIndex}</span>
                          <span className="text-white/40"> / 100</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:flex-col sm:items-end gap-1">
                      <div>
                        <span className="text-[11px] text-white/45 mr-1.5">殿堂评级</span>
                        <span className="font-serif-jp text-sm font-bold text-white tracking-widest">
                          {score >= 9.5 ? '神作 · 永恒' : score >= 9 ? '名作 · 必看' : '佳作 · 推荐'}
                        </span>
                      </div>
                      <span className="font-mono-tech text-[10px] tracking-[0.22em] text-white/35 uppercase">
                        SYS.UI.OVERRIDE © 2026
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                /* COLLAPSED ACCORDION BLADE (PlayStation Wrap-Up Image 2 style) */
                <div className="relative z-10 w-full h-full p-4 flex lg:flex-col items-center justify-between">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-black/65 border border-white/20 font-mono-tech text-xs font-bold text-white">
                    {idx + 1}
                  </span>

                  <div className="lg:writing-vertical font-serif-jp text-sm lg:text-[15px] font-semibold tracking-[0.18em] text-white/90 truncate lg:max-h-[260px] px-2 lg:px-0">
                    {anime.title}
                  </div>

                  <div className="flex items-center gap-1 font-mono-tech text-[11px] text-white/75">
                    <Sparkles className="w-3 h-3 text-indigo-300" />
                    <span>{score}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
