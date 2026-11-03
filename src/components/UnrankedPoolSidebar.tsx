import React, { useState, useRef } from 'react';
import {
  Plus,
  RotateCcw,
  Trash2,
  Film,
  Sparkles,
  PanelRightClose,
  ArrowLeftRight,
  ImagePlus,
  RefreshCw,
} from 'lucide-react';
import type { AnimeItem, TierScore } from '../types';

interface UnrankedPoolSidebarProps {
  pool: AnimeItem[];
  dockSide: 'left' | 'right';
  onToggleDockSide: () => void;
  onCollapse: () => void;
  onOpenSearchForPool: () => void;
  onOpenBgmSync: () => void;
  onBatchUploadImages: (files: FileList | File[]) => void;
  onMoveAllBoardToPool: () => void;
  onClearPool: () => void;
  onDropAnimeIntoPool: (animeId: number, targetIndex?: number) => void;
  onRemoveFromPool: (animeId: number) => void;
  onQuickAssignScore: (anime: AnimeItem, score: TierScore) => void;
  onSelectAnimeDetail: (anime: AnimeItem) => void;
  onRenameAnimeTitle?: (animeId: number, newTitle: string) => void;
}

export const UnrankedPoolSidebar: React.FC<UnrankedPoolSidebarProps> = ({
  pool,
  dockSide,
  onToggleDockSide,
  onCollapse,
  onOpenSearchForPool,
  onOpenBgmSync,
  onBatchUploadImages,
  onMoveAllBoardToPool,
  onClearPool,
  onDropAnimeIntoPool,
  onRemoveFromPool,
  onSelectAnimeDetail,
  onRenameAnimeTitle,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const [failedImages, setFailedImages] = useState<Record<number, boolean>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftTitle, setDraftTitle] = useState<string>('');
  const batchFileInputRef = useRef<HTMLInputElement>(null);

  const hasImageFiles = (e: React.DragEvent<HTMLElement>) => {
    return Array.from(e.dataTransfer.types || []).includes('Files');
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (hasImageFiles(e)) {
      e.dataTransfer.dropEffect = 'copy';
      if (!isFileDragOver) setIsFileDragOver(true);
    } else {
      e.dataTransfer.dropEffect = 'move';
      if (!isDragOver) setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
      setIsFileDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    setIsFileDragOver(false);

    // Check if local image files were dragged from the computer
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const imageFiles = Array.from(e.dataTransfer.files).filter(
        f => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(f.name),
      );
      if (imageFiles.length > 0) {
        onBatchUploadImages(imageFiles);
        return;
      }
    }

    const rawId = e.dataTransfer.getData('text/plain');
    const animeId = Number(rawId);
    if (!Number.isNaN(animeId) && animeId > 0) {
      onDropAnimeIntoPool(animeId);
    }
  };

  const handleDropOnPoolCard = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // Let parent handle file drop
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const rawId = e.dataTransfer.getData('text/plain');
    const animeId = Number(rawId);
    if (!Number.isNaN(animeId) && animeId > 0) {
      onDropAnimeIntoPool(animeId, index);
    }
  };

  const commitInlineRename = (animeId: number) => {
    const trimmed = draftTitle.trim();
    if (trimmed && onRenameAnimeTitle) {
      onRenameAnimeTitle(animeId, trimmed);
    }
    setEditingId(null);
  };

  return (
    <aside
      data-testid="unranked-pool-sidebar"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`w-full lg:w-[332px] xl:w-[356px] shrink-0 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] flex flex-col rounded-[22px] apple-glass-panel transition-all overflow-hidden relative ${
        isFileDragOver
          ? 'ring-2 ring-emerald-400/80 border-emerald-400/50'
          : isDragOver
          ? 'ring-2 ring-white/50 border-white/40'
          : ''
      }`}
    >
      {/* Hidden Multi-Image Input for Quick Batch Custom Import */}
      <input
        ref={batchFileInputRef}
        type="file"
        accept="image/*"
        multiple
        data-testid="pool-batch-image-input"
        onChange={e => {
          if (e.target.files && e.target.files.length > 0) {
            onBatchUploadImages(e.target.files);
            e.target.value = '';
          }
        }}
        className="hidden"
      />

      {/* Full-Cover Overlay when dragging local image files over the sidebar */}
      {isFileDragOver && (
        <div className="absolute inset-0 z-40 bg-zinc-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center pointer-events-none border-2 border-dashed border-emerald-400/70 rounded-[22px]">
          <ImagePlus className="w-10 h-10 text-emerald-400 mb-2.5 animate-bounce" />
          <p className="text-sm font-bold text-white mb-1">
            松开鼠标即可批量导入图片为条目
          </p>
          <p className="text-xs text-white/60">
            自动使用图片文件名作为默认标题，支持一次拖入多张封面
          </p>
        </div>
      )}

      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-white/[0.07] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="text-[15px] font-bold tracking-tight text-white">
            待排候选池
          </span>
          <span className="px-2 py-0.5 rounded-full bg-white/[0.09] text-[11px] font-semibold text-white/85 tabular-nums">
            {pool.length} 部
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleDockSide}
            title={dockSide === 'right' ? '切换到左侧停靠' : '切换到右侧停靠'}
            aria-label="切换候选池左右位置"
            className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onCollapse}
            title="收起候选池侧栏"
            aria-label="收起候选池侧栏"
            className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <PanelRightClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick Action Toolbar: Search, BGM Token Sync, Batch Image Drop */}
      <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.015] space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="pool-add-anime-btn"
            onClick={onOpenSearchForPool}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 text-xs font-semibold transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>搜索选番</span>
          </button>

          <button
            type="button"
            data-testid="pool-bgm-sync-btn"
            onClick={onOpenBgmSync}
            title="通过 Bangumi Token 自动拉取你最近在看/看过的动画、书籍与游戏"
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.1] text-xs font-semibold text-white transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>BGM 追番同步</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="pool-batch-upload-btn"
            onClick={() => batchFileInputRef.current?.click()}
            title="支持一次选择或直接向此区域拖入多张本地图片，自动以文件名作为标题"
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] border border-dashed border-white/[0.14] text-[11px] font-medium text-white/80 transition-colors cursor-pointer"
          >
            <ImagePlus className="w-3.5 h-3.5 text-white/65 shrink-0" />
            <span className="truncate">批量传图</span>
          </button>

          <button
            type="button"
            data-testid="move-all-to-pool-btn"
            onClick={onMoveAllBoardToPool}
            title="将左侧榜单上的所有动画一键移入候选池，方便开启录屏从零一个个拖拽排榜"
            className="inline-flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.11] border border-white/[0.08] text-[11px] font-medium text-white/75 transition-colors cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3 h-3" />
            <span>全榜入池</span>
          </button>

          <button
            type="button"
            data-testid="clear-pool-btn"
            onClick={onClearPool}
            disabled={pool.length === 0}
            title="一键清空待排候选池中的全部作品"
            className="inline-flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-xl bg-rose-500/12 hover:bg-rose-500/25 border border-rose-400/20 text-[11px] font-medium text-rose-200 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-35 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3 h-3" />
            <span>全部移除</span>
          </button>
        </div>
      </div>

      {/* Helper tip for video recording & drag-drop */}
      <div className="px-4 py-1.5 bg-white/[0.01] border-b border-white/[0.05] text-[10.5px] text-white/40 flex items-center justify-between">
        <span>支持电脑图片直接拖入 · 双击标题可直接改名</span>
      </div>

      {/* Scrollable Candidate Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {pool.length === 0 ? (
          <div
            onClick={() => batchFileInputRef.current?.click()}
            className="py-10 px-4 text-center flex flex-col items-center justify-center border border-dashed border-white/[0.12] hover:border-white/25 rounded-2xl bg-white/[0.015] hover:bg-white/[0.03] transition-colors cursor-pointer"
          >
            <Sparkles className="w-6 h-6 text-white/30 mb-2" />
            <p className="text-xs font-medium text-white/75 mb-1">
              候选池为空 · 直接把图片拖进这里
            </p>
            <p className="text-[11px] text-white/40 leading-relaxed max-w-[220px] mb-4">
              支持批量拖入多张本地图片（自动以文件名命名），或点击上方「BGM 追番同步」导入最近看过的番
            </p>
            <span className="px-3.5 py-1.5 rounded-full bg-white/[0.09] text-xs font-medium text-white">
              + 点击批量选择本地图片
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {pool.map((anime, index) => {
              const imgFailed = failedImages[anime.id];
              const isEditingThis = editingId === anime.id;
              return (
                <div
                  key={anime.id}
                  draggable={!isEditingThis}
                  onDragStart={e => {
                    e.dataTransfer.setData('text/plain', String(anime.id));
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={e => {
                    e.preventDefault();
                  }}
                  onDrop={e => handleDropOnPoolCard(e, index)}
                  onClick={() => {
                    if (!isEditingThis) onSelectAnimeDetail(anime);
                  }}
                  className="group/poolcard flex flex-col items-center cursor-grab active:cursor-grabbing transition-transform duration-150 hover:-translate-y-1"
                >
                  <div className="relative w-full aspect-[5/7] rounded-[10px] overflow-hidden bg-zinc-900 shadow-[0_6px_16px_rgba(0,0,0,0.45)] border border-white/[0.07]">
                    {!imgFailed ? (
                      <img
                        src={anime.cover}
                        alt={anime.title}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setFailedImages(prev => ({
                            ...prev,
                            [anime.id]: true,
                          }))
                        }
                        className="w-full h-full object-cover transition-transform duration-300 group-hover/poolcard:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-1.5 text-center bg-zinc-900">
                        <Film className="w-4 h-4 text-white/40 mb-1" />
                        <span className="text-[10px] text-white/80 line-clamp-2">
                          {anime.title}
                        </span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        onRemoveFromPool(anime.id);
                      }}
                      title="从候选池移除"
                      aria-label={`从候选池移除 ${anime.title}`}
                      className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/75 hover:bg-rose-500 text-white opacity-0 group-hover/poolcard:opacity-100 transition-opacity cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  {isEditingThis ? (
                    <input
                      type="text"
                      value={draftTitle}
                      autoFocus
                      onClick={e => e.stopPropagation()}
                      onChange={e => setDraftTitle(e.target.value)}
                      onBlur={() => commitInlineRename(anime.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitInlineRename(anime.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="mt-1.5 w-full px-1.5 py-0.5 text-[11px] text-white bg-zinc-900 border border-white/35 rounded text-center focus:outline-none"
                    />
                  ) : (
                    <p
                      title={`${anime.title} (双击可直接改名)`}
                      onDoubleClick={e => {
                        e.stopPropagation();
                        setEditingId(anime.id);
                        setDraftTitle(anime.title);
                      }}
                      className="mt-1.5 w-full text-[11px] font-medium text-white/85 text-center truncate px-0.5 select-none"
                    >
                      {anime.title}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};
