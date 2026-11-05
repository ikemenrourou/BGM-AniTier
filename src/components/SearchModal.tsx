import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Calendar,
  PlusCircle,
  X,
  Check,
  Loader2,
  Film,
  Upload,
  Inbox,
  ImagePlus,
  Trash2,
  Tv,
  BookOpen,
  Gamepad2,
} from 'lucide-react';
import type { AnimeItem, SubjectCategory, TierGradingSystem, TierScore } from '../types';
import {
  ALL_TIER_SCORES,
  LETTER_TIER_SCORES,
  formatTierBadgeText,
  formatTierLabel,
  createCustomWorkId,
} from '../lib/tierLogic';
import {
  searchBangumiAnime,
  createBangumiSeasonalSearch,
  extractTitleFromFileName,
  compressImageFileToDataUrl,
} from '../lib/bangumiApi';

export type SearchTargetDestination = TierScore | 'pool';

interface SearchModalProps {
  isOpen: boolean;
  initialTargetScore: SearchTargetDestination;
  visibleTiers: TierScore[];
  gradingSystem?: TierGradingSystem;
  existingAnimeTierMap: Map<number, SearchTargetDestination>;
  poolAnimeIds?: Set<number>;
  onClose: () => void;
  onAddAnime: (anime: AnimeItem, target: SearchTargetDestination) => void;
}

const SEASON_MONTHS = [
  { month: 1, label: '1月 冬番' },
  { month: 4, label: '4月 春番' },
  { month: 7, label: '7月 夏番' },
  { month: 10, label: '10月 秋番' },
];

interface DraftBatchItem {
  id: number;
  title: string;
  cover: string;
  category: SubjectCategory;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  initialTargetScore,
  visibleTiers,
  gradingSystem = 'numeric',
  existingAnimeTierMap,
  poolAnimeIds,
  onClose,
  onAddAnime,
}) => {
  const [activeTab, setActiveTab] = useState<'search' | 'seasonal' | 'custom'>('search');
  const [targetDest, setTargetDest] = useState<SearchTargetDestination>(initialTargetScore);
  const [subjectType, setSubjectType] = useState<2 | 1 | 4>(2);
  const [keyword, setKeyword] = useState('');
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(() => Math.floor(new Date().getMonth() / 3) * 3 + 1);
  const [results, setResults] = useState<AnimeItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const pagerRef = useRef<ReturnType<typeof createBangumiSeasonalSearch> | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Quick Batch Drag-and-Drop Custom State
  const [batchDrafts, setBatchDrafts] = useState<DraftBatchItem[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [customCategory, setCustomCategory] = useState<SubjectCategory>('anime');
  const [customTitle, setCustomTitle] = useState('');
  const [customCover, setCustomCover] = useState('');
  const [customStudio, setCustomStudio] = useState('');
  const [customTags, setCustomTags] = useState('');
  const [customError, setCustomError] = useState('');
  const batchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTargetDest(initialTargetScore);
  }, [initialTargetScore]);

  useEffect(() => {
    if (!isOpen) return;
    setResults([]);
    setLoadError('');
    setIsLoading(false);
    if (activeTab === 'seasonal') {
      handleSeasonalSearch(selectedYear, selectedMonth);
    }
    return () => requestRef.current?.abort();
  }, [isOpen, activeTab, selectedYear, selectedMonth]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'seasonal' || !hasMore || isLoading || loadError || !loadMoreRef.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void handleLoadMore();
    }, { root: scrollRef.current, rootMargin: '300px' });
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [isOpen, activeTab, hasMore, isLoading, loadError]);

  if (!isOpen) return null;

  const beginSearch = () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setIsLoading(true);
    setLoadError('');
    setHasMore(false);
    setResults([]);
    return controller;
  };

  const handleKeywordSearch = async (e?: React.FormEvent, overrideType?: 2 | 1 | 4) => {
    if (e) e.preventDefault();
    const sType = overrideType || subjectType;
    const controller = beginSearch();
    try {
      const res = await searchBangumiAnime({
        keyword: keyword.trim(),
        limit: 50,
        subjectType: sType,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setResults(res.data);
    } catch (error) {
      if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : '搜索失败，请重试。');
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  };

  const handleSeasonalSearch = async (year: number, month: number) => {
    const controller = beginSearch();
    pagerRef.current = createBangumiSeasonalSearch(year, month, controller.signal);
    await loadSeasonPage(pagerRef.current, controller);
  };

  const loadSeasonPage = async (pager: ReturnType<typeof createBangumiSeasonalSearch>, controller: AbortController) => {
    setIsLoading(true);
    setLoadError('');
    try {
      const page = await pager.loadMore();
      if (!controller.signal.aborted) {
        setResults(page.data);
        setHasMore(page.hasMore);
      }
    } catch (error) {
      if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : '本季作品未加载完整，请重试。');
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  };

  const handleLoadMore = async () => {
    if (pagerRef.current && requestRef.current && !requestRef.current.signal.aborted) {
      await loadSeasonPage(pagerRef.current, requestRef.current);
    }
  };

  const handleBatchFilesSelected = async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter(
      f => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(f.name),
    );
    if (imageFiles.length === 0) return;

    const created: DraftBatchItem[] = [];
    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const dataUrl = await compressImageFileToDataUrl(file);
      created.push({
        id: createCustomWorkId(i),
        title: extractTitleFromFileName(file.name),
        cover: dataUrl,
        category: customCategory,
      });
    }
    setBatchDrafts(prev => [...created, ...prev]);
  };

  const handleImportAllBatchDrafts = () => {
    if (batchDrafts.length === 0) return;
    for (const draft of batchDrafts) {
      onAddAnime(
        {
          id: draft.id,
          title: draft.title.trim() || '未命名条目',
          cover: draft.cover,
          category: draft.category,
          isCustom: true,
        },
        targetDest,
      );
    }
    setBatchDrafts([]);
    onClose();
  };

  const handleSingleCustomFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await compressImageFileToDataUrl(file);
    setCustomCover(dataUrl);
    if (!customTitle.trim()) {
      setCustomTitle(extractTitleFromFileName(file.name));
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const title = customTitle.trim();
    if (!title) {
      setCustomError('请输入作品标题');
      return;
    }
    setCustomError('');
    const newAnime: AnimeItem = {
      id: createCustomWorkId(0),
      title,
      cover: customCover.trim(),
      studio: customStudio.trim() || undefined,
      category: customCategory,
      tags: customTags
        .split(/[,，/\s]+/)
        .map(s => s.trim())
        .filter(Boolean),
      isCustom: true,
    };
    onAddAnime(newAnime, targetDest);
    setCustomTitle('');
    setCustomCover('');
    setCustomStudio('');
    setCustomTags('');
  };

  const availableScores =
    visibleTiers.length > 0
      ? visibleTiers
      : gradingSystem === 'letter'
      ? LETTER_TIER_SCORES
      : ALL_TIER_SCORES;

  return (
    <div
      role="dialog"
      data-testid="search-modal"
      aria-modal="true"
      aria-labelledby="search-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-[24px] bg-[#111114] border border-white/[0.1] shadow-[0_24px_80px_rgba(0,0,0,0.85)] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-white/[0.07] bg-white/[0.02]">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="search-modal-title" className="text-base font-bold tracking-tight text-white">
              搜索或批量拖图添加作品
            </h2>
            <div className="flex items-center gap-2 text-xs text-white/70">
              <label htmlFor="target-tier-select" className="text-white/50">
                添加至:
              </label>
              <select
                id="target-tier-select"
                value={String(targetDest)}
                onChange={e => {
                  const val = e.target.value;
                  setTargetDest(val === 'pool' ? 'pool' : (Number(val) as TierScore));
                }}
                className="px-3 py-1.5 rounded-full bg-white/[0.08] border border-white/[0.12] text-white font-semibold focus:outline-none cursor-pointer"
              >
                <option value="pool" className="bg-zinc-900 text-white">
                  待排候选池 (不打分·方便录屏拖拽)
                </option>
                {availableScores.map(s => (
                  <option key={s} value={s} className="bg-zinc-900 text-white">
                    {formatTierBadgeText(s, gradingSystem)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="关闭添加窗口"
            className="p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-white/[0.07] bg-white/[0.01]">
          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'search'
                ? 'border-white text-white'
                : 'border-transparent text-white/45 hover:text-white/80'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Bangumi 搜索 (动画/书/游)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('seasonal')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'seasonal'
                ? 'border-white text-white'
                : 'border-transparent text-white/45 hover:text-white/80'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>按季度浏览新番</span>
          </button>
          <button
            type="button"
            data-testid="custom-anime-tab-btn"
            onClick={() => setActiveTab('custom')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'custom'
                ? 'border-white text-white'
                : 'border-transparent text-white/45 hover:text-white/80'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>快捷自定义 / 批量拖入图片</span>
          </button>
        </div>

        {/* Modal Body */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6">
          {loadError && (
            <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/75">
              <span>{loadError}</span>
              <button type="button" onClick={() => activeTab === 'seasonal' ? handleLoadMore() : handleKeywordSearch()} className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-white hover:bg-white/20">重试</button>
            </div>
          )}
          {activeTab === 'search' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row gap-2.5">
                {/* Subject Type Switcher (Anime / Book / Game) */}
                <div className="flex items-center gap-1 p-1 rounded-xl bg-black/50 border border-white/[0.1] shrink-0">
                  {[
                    { type: 2 as const, label: '动画', icon: <Tv className="w-3.5 h-3.5" /> },
                    { type: 1 as const, label: '书籍', icon: <BookOpen className="w-3.5 h-3.5" /> },
                    { type: 4 as const, label: '游戏', icon: <Gamepad2 className="w-3.5 h-3.5" /> },
                  ].map(item => (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => {
                        setSubjectType(item.type);
                        if (keyword.trim()) {
                          handleKeywordSearch(undefined, item.type);
                        }
                      }}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        subjectType === item.type
                          ? 'bg-white text-zinc-950'
                          : 'text-white/60 hover:text-white'
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>

                <form onSubmit={e => handleKeywordSearch(e)} className="flex flex-1 gap-2">
                  <input
                    type="text"
                    value={keyword}
                    onChange={e => setKeyword(e.target.value)}
                    placeholder="输入动画、轻小说、漫画或游戏名称..."
                    aria-label="作品搜索关键词"
                    className="flex-1 px-4 py-2 text-sm text-white bg-black/40 border border-white/[0.12] rounded-xl focus:outline-none focus:border-white/40"
                  />
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    <span>搜索</span>
                  </button>
                </form>
              </div>

              {renderAnimeGrid(results, isLoading, existingAnimeTierMap, poolAnimeIds, targetDest, gradingSystem, onAddAnime)}
            </div>
          )}

          {activeTab === 'seasonal' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(Number(e.target.value))}
                  aria-label="选择年份"
                  className="px-3.5 py-2 text-sm text-white bg-black/40 border border-white/[0.12] rounded-xl font-mono"
                >
                  {Array.from({ length: new Date().getFullYear() - 2019 }, (_, index) => new Date().getFullYear() - index).map(year => (
                    <option key={year} value={year} className="bg-zinc-900">
                      {year} 年
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-1 p-1 bg-black/40 rounded-xl border border-white/[0.08]">
                  {SEASON_MONTHS.map(item => (
                    <button
                      key={item.month}
                      type="button"
                      onClick={() => setSelectedMonth(item.month)}
                      className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                        selectedMonth === item.month
                          ? 'bg-white text-zinc-950'
                          : 'text-white/55 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {!loadError && (
                  <span className="ml-auto text-xs text-white/50 font-mono">
                    {isLoading || hasMore ? '本季已加载' : '本季共检索到'} <strong className="text-white">{results.length}</strong> 部新番
                  </span>
                )}
              </div>

              {(!loadError || results.length > 0) && renderAnimeGrid(results, isLoading && results.length === 0, existingAnimeTierMap, poolAnimeIds, targetDest, gradingSystem, onAddAnime)}
              <div ref={loadMoreRef} className="flex min-h-12 items-center justify-center gap-2 py-3 text-xs text-white/55" role="status">
                {isLoading && results.length > 0 ? <><Loader2 className="h-4 w-4 animate-spin" />正在加载更多…</> : hasMore && !loadError ? <button type="button" onClick={handleLoadMore} className="rounded-full border border-white/15 px-4 py-2 hover:bg-white/10">继续向下滚动，或点击加载更多</button> : !loadError && results.length > 0 ? '本季作品已全部加载' : null}
              </div>
            </div>
          )}

          {activeTab === 'custom' && (
            <div className="space-y-6">
              {/* Fast Batch Drag-and-Drop Zone */}
              <div
                data-testid="custom-batch-dropzone"
                onDragOver={e => {
                  e.preventDefault();
                  setIsDraggingFiles(true);
                }}
                onDragLeave={() => setIsDraggingFiles(false)}
                onDrop={e => {
                  e.preventDefault();
                  setIsDraggingFiles(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleBatchFilesSelected(e.dataTransfer.files);
                  }
                }}
                onClick={() => batchInputRef.current?.click()}
                className={`p-7 rounded-2xl border-2 border-dashed text-center transition-all cursor-pointer ${
                  isDraggingFiles
                    ? 'border-white bg-white/[0.09]'
                    : 'border-white/[0.15] hover:border-white/35 bg-white/[0.025] hover:bg-white/[0.04]'
                }`}
              >
                <input
                  ref={batchInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={e => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleBatchFilesSelected(e.target.files);
                      e.target.value = '';
                    }
                  }}
                  className="hidden"
                />
                <ImagePlus className="w-9 h-9 text-white/70 mx-auto mb-2.5" />
                <p className="text-sm font-bold text-white mb-1">
                  快捷模式：直接将 1 张或多张图片拖入此处（或点击选择）
                </p>
                <p className="text-xs text-white/50">
                  系统会自动去掉后缀提取「图片文件名」作为默认作品标题，支持批量修改标题后一键导入
                </p>
              </div>

              {/* Batch Preview List if user dropped/selected images */}
              {batchDrafts.length > 0 && (
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.1] space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">
                      待批量导入列表 ({batchDrafts.length} 个条目 · 可直接修改标题或分类)
                    </span>
                    <button
                      type="button"
                      onClick={() => setBatchDrafts([])}
                      className="text-xs text-white/45 hover:text-rose-300 cursor-pointer"
                    >
                      清空列表
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[260px] overflow-y-auto pr-1">
                    {batchDrafts.map(draft => (
                      <div
                        key={draft.id}
                        className="flex items-center gap-3 p-2.5 rounded-xl bg-black/50 border border-white/[0.08]"
                      >
                        <img
                          src={draft.cover}
                          alt={draft.title}
                          className="w-11 h-15 rounded-lg object-cover shrink-0 border border-white/10"
                        />
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <input
                            type="text"
                            value={draft.title}
                            onChange={e => {
                              const val = e.target.value;
                              setBatchDrafts(prev =>
                                prev.map(d => (d.id === draft.id ? { ...d, title: val } : d)),
                              );
                            }}
                            className="w-full px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.12] text-xs font-semibold text-white focus:outline-none focus:border-white/40"
                          />
                          <div className="flex items-center gap-1.5">
                            {(['anime', 'book', 'game'] as SubjectCategory[]).map(cat => (
                              <button
                                key={cat}
                                type="button"
                                onClick={() =>
                                  setBatchDrafts(prev =>
                                    prev.map(d => (d.id === draft.id ? { ...d, category: cat } : d)),
                                  )
                                }
                                className={`px-2 py-0.5 rounded text-[10px] font-medium cursor-pointer ${
                                  draft.category === cat
                                    ? 'bg-white text-zinc-950 font-bold'
                                    : 'bg-white/[0.06] text-white/55'
                                }`}
                              >
                                {cat === 'anime' ? '动画' : cat === 'book' ? '书籍' : '游戏'}
                              </button>
                            ))}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setBatchDrafts(prev => prev.filter(d => d.id !== draft.id))
                          }
                          className="p-1.5 text-white/40 hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    data-testid="confirm-batch-custom-btn"
                    onClick={handleImportAllBatchDrafts}
                    className="w-full py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-bold transition-colors cursor-pointer"
                  >
                    一键添加全部 {batchDrafts.length} 个作品至
                    {targetDest === 'pool'
                      ? '待排候选池'
                      : formatTierBadgeText(targetDest, gradingSystem)}
                  </button>
                </div>
              )}

              {/* Single Entry Manual Form */}
              <form onSubmit={handleCustomSubmit} className="pt-3 border-t border-white/[0.07] space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white/60">
                    或者手动填写单个作品信息:
                  </span>
                  <div className="flex items-center gap-1.5">
                    {(['anime', 'book', 'game'] as SubjectCategory[]).map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCustomCategory(cat)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                          customCategory === cat
                            ? 'bg-white text-zinc-950 font-bold'
                            : 'bg-white/[0.06] text-white/60'
                        }`}
                      >
                        {cat === 'anime' ? '动画' : cat === 'book' ? '书籍' : '游戏'}
                      </button>
                    ))}
                  </div>
                </div>

                {customError && (
                  <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300">
                    {customError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="custom-anime-title" className="block text-xs font-medium text-white/75 mb-1.5">
                      作品名称 * (传图可自动填入文件名)
                    </label>
                    <input
                      id="custom-anime-title"
                      type="text"
                      value={customTitle}
                      onChange={e => setCustomTitle(e.target.value)}
                      placeholder="例如：葬送的芙莉莲 / 艾尔登法环"
                      className="w-full px-3.5 py-2 text-sm text-white bg-black/40 border border-white/[0.12] rounded-xl focus:outline-none focus:border-white/40"
                    />
                  </div>

                  <div>
                    <label htmlFor="custom-anime-cover" className="block text-xs font-medium text-white/75 mb-1.5">
                      封面图片 URL 或本地上传
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="custom-anime-cover"
                        type="text"
                        value={customCover}
                        onChange={e => setCustomCover(e.target.value)}
                        placeholder="https://... 或点击右侧上传"
                        className="flex-1 px-3.5 py-2 text-sm text-white bg-black/40 border border-white/[0.12] rounded-xl focus:outline-none focus:border-white/40"
                      />
                      <label className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] rounded-xl cursor-pointer whitespace-nowrap">
                        <Upload className="w-3.5 h-3.5" />
                        <span>单张上传</span>
                        <input type="file" accept="image/*" onChange={handleSingleCustomFileUpload} className="hidden" />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="custom-anime-studio" className="block text-xs font-medium text-white/75 mb-1.5">
                      制作公司 / 作者 / 开发商 (可选)
                    </label>
                    <input
                      id="custom-anime-studio"
                      type="text"
                      value={customStudio}
                      onChange={e => setCustomStudio(e.target.value)}
                      placeholder="如：MADHOUSE / FromSoftware"
                      className="w-full px-3.5 py-2 text-sm text-white bg-black/40 border border-white/[0.12] rounded-xl focus:outline-none focus:border-white/40"
                    />
                  </div>
                  <div>
                    <label htmlFor="custom-anime-tags" className="block text-xs font-medium text-white/75 mb-1.5">
                      标签 (逗号分隔，可选)
                    </label>
                    <input
                      id="custom-anime-tags"
                      type="text"
                      value={customTags}
                      onChange={e => setCustomTags(e.target.value)}
                      placeholder="如：奇幻, 公路片, 神作"
                      className="w-full px-3.5 py-2 text-sm text-white bg-black/40 border border-white/[0.12] rounded-xl focus:outline-none focus:border-white/40"
                    />
                  </div>
                </div>

                <div>
                  <button
                    type="submit"
                    className="w-full py-2.5 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl transition-colors cursor-pointer"
                  >
                    {targetDest === 'pool'
                      ? '添加到待排候选池'
                      : `添加到 ${formatTierBadgeText(targetDest, gradingSystem)}`}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function renderAnimeGrid(
  items: AnimeItem[],
  isLoading: boolean,
  existingMap: Map<number, SearchTargetDestination>,
  poolAnimeIds: Set<number> | undefined,
  targetDest: SearchTargetDestination,
  gradingSystem: TierGradingSystem,
  onAddAnime: (anime: AnimeItem, dest: SearchTargetDestination) => void,
) {
  if (isLoading) {
    return (
      <div className="py-16 flex flex-col items-center justify-center gap-3 text-white/50">
        <Loader2 className="w-7 h-7 animate-spin text-white" />
        <p className="text-sm">正在从 Bangumi 获取作品数据...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-16 text-center text-white/50">
        <Film className="w-8 h-8 mx-auto mb-2 opacity-60" />
        <p className="text-sm">没有找到匹配的作品，请尝试其他关键词或使用「快捷自定义 / 批量拖入图片」</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-4">
      {items.map(anime => {
        const existingDest = existingMap.get(anime.id);
        const inPool = existingDest === 'pool' || poolAnimeIds?.has(anime.id);
        return (
          <button
            key={anime.id}
            type="button"
            onClick={() => onAddAnime(anime, targetDest)}
            className="group relative flex flex-col items-center text-center transition-all duration-200 hover:-translate-y-1 cursor-pointer"
          >
            <div className="relative w-full aspect-[5/7] rounded-[10px] bg-zinc-900 overflow-hidden border border-white/[0.07] group-hover:border-white/35 shadow-[0_8px_20px_rgba(0,0,0,0.5)]">
              <img
                src={anime.cover}
                alt={anime.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              {typeof existingDest === 'number' ? (
                <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-white text-zinc-950 text-[10px] font-mono font-bold flex items-center gap-0.5 shadow">
                  <Check className="w-3 h-3 stroke-[2.5]" />
                  <span>
                    {gradingSystem === 'letter'
                      ? `${formatTierLabel(existingDest, 'letter')}档`
                      : `${existingDest}分`}
                  </span>
                </div>
              ) : inPool ? (
                <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-zinc-950/85 border border-white/20 text-white text-[10px] font-medium flex items-center gap-1 shadow backdrop-blur-md">
                  <Inbox className="w-3 h-3" />
                  <span>候选池</span>
                </div>
              ) : null}
              {anime.bgmScore && (
                <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/70 border border-white/10 text-[10px] font-mono text-white/85 backdrop-blur-md tabular-nums">
                  {anime.bgmScore}
                </div>
              )}
            </div>
            <p className="mt-2 w-full text-xs font-medium text-white/90 text-center truncate px-0.5" title={anime.title}>
              {anime.title}
            </p>
            {anime.studio && (
              <p className="w-full text-[10.5px] text-white/40 text-center truncate mt-0.5">{anime.studio}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}
