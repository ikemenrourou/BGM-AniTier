import React, { useState } from 'react';
import {
  Plus,
  Download,
  SlidersHorizontal,
  Edit3,
  Check,
  Inbox,
  Video,
  Layers,
  RefreshCw,
  LayoutGrid,
  Sparkles,
  Rocket,
  Award,
  CloudUpload,
} from 'lucide-react';
import type { TierGradingSystem, TierRowStyle } from '../types';

interface HeaderBarProps {
  boardTitle: string;
  onUpdateTitle: (newTitle: string) => void;
  stats: {
    totalAnime: number;
    averageScore: number;
    topTierCount: number;
  };
  poolCount: number;
  isPoolOpen: boolean;
  onTogglePool: () => void;
  isRecordingMode: boolean;
  onToggleRecordingMode: () => void;
  gradingSystem: TierGradingSystem;
  onToggleGradingSystem: () => void;
  showHalfTiers: boolean;
  onToggleAllHalfTiers: () => void;
  tierRowStyle: TierRowStyle;
  onCycleTierRowStyle: () => void;
  onOpenSearch: () => void;
  onOpenBgmSync: () => void;
  onOpenBgmPush?: () => void;
  onOpenPosterWall: () => void;
  onOpenSettings: () => void;
  onExportImage: () => void;
  isExportingImage: boolean;
  exportHideEmptyTiers: boolean;
  onToggleExportHideEmptyTiers: () => void;
}

const ROW_STYLE_SHORT_LABELS: Record<TierRowStyle, string> = {
  'ambient-glass': '档位: 弥散光毛玻璃',
  'minimal-blur': '档位: 极简柔雾',
  'floating-split': '档位: 悬浮分体',
  'pure-transparent': '档位: 全透明',
};

export const HeaderBar: React.FC<HeaderBarProps> = ({
  boardTitle,
  onUpdateTitle,
  poolCount,
  isPoolOpen,
  onTogglePool,
  isRecordingMode,
  onToggleRecordingMode,
  gradingSystem,
  onToggleGradingSystem,
  showHalfTiers,
  onToggleAllHalfTiers,
  tierRowStyle,
  onCycleTierRowStyle,
  onOpenSearch,
  onOpenBgmSync,
  onOpenBgmPush,
  onOpenPosterWall,
  onOpenSettings,
  onExportImage,
  isExportingImage,
  exportHideEmptyTiers,
  onToggleExportHideEmptyTiers,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(boardTitle);

  const handleSaveTitle = () => {
    const trimmed = draftTitle.trim();
    if (trimmed) {
      onUpdateTitle(trimmed);
    } else {
      setDraftTitle(boardTitle);
    }
    setIsEditingTitle(false);
  };

  return (
    <header className="relative z-30 pt-6 pb-4 px-5 sm:px-8 max-w-[1520px] w-full mx-auto">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-end gap-2 mb-6">
        <button
          type="button"
          onClick={onOpenSearch}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white text-zinc-950 hover:bg-zinc-200 text-xs font-semibold transition-colors duration-150 shadow-sm cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>添加作品 / 批量传图</span>
        </button>

        <div className="inline-flex items-center rounded-full bg-white/[0.08] border border-white/[0.12] p-0.5">
          <button
            type="button"
            data-testid="open-bgm-sync-btn"
            onClick={onOpenBgmSync}
            title="从 Bangumi 拉取追番 / 读书 / 游戏记录"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full hover:bg-white/[0.12] text-xs font-semibold text-white transition-colors duration-150 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-white/80" />
            <span>BGM 追番同步</span>
          </button>

          {onOpenBgmPush && (
            <button
              type="button"
              data-testid="open-bgm-push-btn"
              onClick={onOpenBgmPush}
              title="将排好的 Tier List 批量同步回 Bangumi（自动打分 + 选择在看/看过点格子）"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.12] hover:bg-white hover:text-zinc-950 text-[11px] font-bold text-white transition-colors duration-150 cursor-pointer"
            >
              <CloudUpload className="w-3 h-3" />
              <span>回写打分</span>
            </button>
          )}
        </div>

        <button
          type="button"
          data-testid="open-poster-wall-btn"
          onClick={onOpenPosterWall}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-xs font-semibold text-white transition-colors duration-150 cursor-pointer"
        >
          <LayoutGrid className="w-3.5 h-3.5 text-white/80" />
          <span>季度海报墙</span>
        </button>

        {/* 1-10 Score vs S-D Tier Quick Toggle */}
        <button
          type="button"
          data-testid="toggle-grading-system-btn"
          onClick={onToggleGradingSystem}
          title="在「1-10 分制」与「S-D 档位制（S/A/B/C/D）」之间一键无损切换"
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-xs font-semibold transition-colors duration-150 cursor-pointer ${
            gradingSystem === 'letter'
              ? 'bg-white text-zinc-950 border-white shadow-xs'
              : 'bg-white/[0.08] hover:bg-white/[0.14] border-white/[0.14] text-white'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          <span>{gradingSystem === 'letter' ? '分制: S-D 档位' : '分制: 1-10 分'}</span>
        </button>

        <button
          type="button"
          onClick={onTogglePool}
          aria-pressed={isPoolOpen}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-xs font-medium transition-colors duration-150 cursor-pointer ${
            isPoolOpen
              ? 'bg-white/[0.14] border-white/25 text-white'
              : 'bg-white/[0.05] hover:bg-white/[0.1] border-white/[0.09] text-white/75'
          }`}
        >
          <Inbox className="w-3.5 h-3.5" />
          <span>待排候选池 ({poolCount})</span>
        </button>

        <button
          type="button"
          data-testid="open-recording-studio-btn"
          onClick={onToggleRecordingMode}
          aria-pressed={isRecordingMode}
          title="进入 16:9 录屏演播室子页面（双人 RPG 剧场 + 上下渐隐自动滑轨 + 右上角延迟亮分大卡 + 防剧透 AI 台本）"
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-xs font-semibold transition-colors duration-150 cursor-pointer ${
            isRecordingMode
              ? 'bg-rose-500/20 border-rose-400/40 text-rose-200'
              : 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-400/35 text-rose-100'
          }`}
        >
          <Video className="w-3.5 h-3.5 text-rose-300" />
          <span>{isRecordingMode ? '退出录屏演播室' : '16:9 录屏演播室'}</span>
        </button>

        {gradingSystem === 'numeric' && (
          <button
            type="button"
            onClick={onToggleAllHalfTiers}
            aria-pressed={showHalfTiers}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-xs font-medium transition-colors duration-150 cursor-pointer ${
              showHalfTiers
                ? 'bg-white/[0.16] border-white/30 text-white'
                : 'bg-white/[0.05] hover:bg-white/[0.1] border-white/[0.09] text-white/75'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>0.5 半分档</span>
          </button>
        )}

        <button
          type="button"
          data-testid="cycle-tier-row-style-btn"
          onClick={onCycleTierRowStyle}
          title="切换 Tier 矩形背景样式（动态弥散光毛玻璃 / 极简无框 / 悬浮分体 / 全透明）"
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.09] text-xs font-medium text-white/85 transition-colors duration-150 cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-white/75" />
          <span>{ROW_STYLE_SHORT_LABELS[tierRowStyle]}</span>
        </button>

        {/* Export Image + Empty Tier Filter Toggle */}
        <div className="inline-flex items-center rounded-full bg-white/[0.05] border border-white/[0.09] p-0.5">
          <button
            type="button"
            onClick={onExportImage}
            disabled={isExportingImage}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full hover:bg-white/[0.1] text-xs font-medium text-white/90 transition-colors duration-150 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExportingImage ? '生成长图中...' : '导出榜单长图'}</span>
          </button>
          <button
            type="button"
            data-testid="toggle-export-empty-tiers-btn"
            onClick={onToggleExportHideEmptyTiers}
            title="切换导出长图时是否隐藏没有作品的空白 Tier 行"
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors cursor-pointer ${
              exportHideEmptyTiers
                ? 'bg-white text-zinc-950'
                : 'text-white/65 hover:text-white hover:bg-white/[0.08]'
            }`}
          >
            {exportHideEmptyTiers ? '仅非空Tier' : '全保留'}
          </button>
        </div>

        <button
          type="button"
          data-testid="open-settings-btn"
          onClick={onOpenSettings}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.09] text-xs font-medium text-white/85 transition-colors duration-150 cursor-pointer"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>设置</span>
        </button>
      </div>

      {/* Centered Main Title */}
      <div className="flex flex-col items-center justify-center text-center my-2">
        {isEditingTitle ? (
          <div className="flex items-center gap-2 max-w-xl w-full justify-center">
            <input
              type="text"
              value={draftTitle}
              onChange={e => setDraftTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSaveTitle();
                if (e.key === 'Escape') {
                  setDraftTitle(boardTitle);
                  setIsEditingTitle(false);
                }
              }}
              aria-label="编辑排行榜标题"
              autoFocus
              className="px-4 py-1.5 rounded-xl bg-white/[0.07] border border-white/25 text-2xl sm:text-3xl font-bold text-white text-center focus:outline-none focus:border-white/60"
            />
            <button
              type="button"
              onClick={handleSaveTitle}
              aria-label="保存标题"
              className="p-2.5 rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 transition-colors cursor-pointer"
            >
              <Check className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraftTitle(boardTitle);
              setIsEditingTitle(true);
            }}
            className="group inline-flex items-center gap-3 px-4 py-1 rounded-2xl hover:bg-white/[0.04] transition-colors cursor-pointer"
            title="点击修改排行榜标题"
          >
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              {boardTitle}
            </h1>
            <Edit3 className="w-4 h-4 text-white/30 group-hover:text-white/80 transition-colors shrink-0" />
          </button>
        )}
      </div>
    </header>
  );
};
