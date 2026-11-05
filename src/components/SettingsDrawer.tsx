import React, { useRef, useState, useSyncExternalStore } from 'react';
import { getStorageStatus, subscribeStorage, restoreBeforeImport } from '../lib/appStorage';
import {
  X,
  Palette,
  PaintBucket,
  Wand2,
  Image as ImageIcon,
  Upload,
  Star,
  Bot,
  Leaf,
  Circle,
  Dices,
  Download,
  Trash2,
  Sliders,
  Loader2,
  Archive,
  Layers,
} from 'lucide-react';
import type { TierGradingSystem, TierRowStyle, TierScore } from '../types';
import { ALL_TIER_SCORES, LETTER_TIER_SCORES, formatTierLabel } from '../lib/tierLogic';
import { compressImageFileToDataUrl } from '../lib/bangumiApi';
import { GRADIENT_THEMES } from '../lib/themes';

interface SettingsDrawerProps {
  isOpen: boolean;
  activeTab: 'general' | 'themes' | 'data';
  onTabChange: (tab: 'general' | 'themes' | 'data') => void;
  onClose: () => void;
  gradingSystem?: TierGradingSystem;
  onChangeGradingSystem?: (system: TierGradingSystem) => void;
  exportHideEmptyTiers?: boolean;
  onToggleExportHideEmptyTiers?: (val: boolean) => void;
  showTitles: boolean;
  onToggleShowTitles: (val: boolean) => void;
  visibleTiers: TierScore[];
  onToggleTierVisibility: (score: TierScore) => void;
  tierRowStyle: TierRowStyle;
  onChangeTierRowStyle: (style: TierRowStyle) => void;
  tierRowOpacity: number;
  onChangeTierRowOpacity: (opacity: number) => void;
  activeThemeId: string;
  onSelectTheme: (themeId: string) => void;
  customBgUrl: string;
  onChangeCustomBgUrl: (url: string) => void;
  useCustomBg: boolean;
  onToggleUseCustomBg: (val: boolean) => void;
  enableParticles: boolean;
  onToggleParticles: (val: boolean) => void;
  enableGlow: boolean;
  onToggleGlow: (val: boolean) => void;
  enableGlassBlur: boolean;
  onToggleGlassBlur: (val: boolean) => void;
  glassBlurPx: number;
  onChangeGlassBlurPx: (px: number) => void;
  onExportJson: () => void;
  isExportingBackup?: boolean;
  onImportJsonFile: (file: File) => void;
  onClearAllData: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  gradingSystem = 'numeric',
  onChangeGradingSystem,
  exportHideEmptyTiers = true,
  onToggleExportHideEmptyTiers,
  showTitles,
  onToggleShowTitles,
  visibleTiers,
  onToggleTierVisibility,
  tierRowStyle,
  onChangeTierRowStyle,
  tierRowOpacity,
  onChangeTierRowOpacity,
  activeThemeId,
  onSelectTheme,
  customBgUrl,
  onChangeCustomBgUrl,
  useCustomBg,
  onToggleUseCustomBg,
  enableParticles,
  onToggleParticles,
  enableGlow,
  onToggleGlow,
  enableGlassBlur,
  onToggleGlassBlur,
  glassBlurPx,
  onChangeGlassBlurPx,
  onExportJson,
  isExportingBackup = false,
  onImportJsonFile,
  onClearAllData,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgUploadInputRef = useRef<HTMLInputElement>(null);
  const storageStatus = useSyncExternalStore(subscribeStorage, getStorageStatus);
  const [recoveryMessage, setRecoveryMessage] = useState('');

  if (!isOpen) return null;

  const handleSelectCategory = (category: 'anime-night' | 'cyberpunk' | 'nature' | 'minimal') => {
    const candidates = GRADIENT_THEMES.filter(t => t.category === category);
    if (candidates.length === 0) return;
    const currentIdx = candidates.findIndex(t => t.id === activeThemeId);
    const next = candidates[(currentIdx + 1) % candidates.length];
    onToggleUseCustomBg(false);
    onSelectTheme(next.id);
  };

  const handleRandomTheme = () => {
    const others = GRADIENT_THEMES.filter(t => t.id !== activeThemeId);
    const pick = others[Math.floor(Math.random() * others.length)] || GRADIENT_THEMES[0];
    onToggleUseCustomBg(false);
    onSelectTheme(pick.id);
  };

  const handleBgImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 1920, 1080, 0.85);
      if (dataUrl) {
        onChangeCustomBgUrl(dataUrl);
        onToggleUseCustomBg(true);
      }
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div
      role="dialog"
      data-testid="settings-drawer"
      aria-modal="true"
      aria-labelledby="settings-drawer-title"
      className="fixed inset-0 z-50 flex justify-end p-4 sm:p-6 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      {/* Floating Rounded Apple Dark-Glass Panel */}
      <div
        className="w-full max-w-[400px] h-full max-h-[92vh] my-auto flex flex-col rounded-[24px] overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.85)] border border-white/[0.12] bg-[#0e1017]/95 backdrop-blur-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Panel Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.08] bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <Palette className="w-5 h-5 text-white/80" />
            <h2 id="settings-drawer-title" className="text-lg font-bold text-white tracking-tight">
              全局设置
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭设置面板"
            className="p-1.5 text-white/50 hover:text-white hover:bg-white/[0.08] rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* 0. Tier 档位背景样式与透明度 (无白边弥散光毛玻璃) */}
          <div className="space-y-3.5">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Layers className="w-4 h-4 text-white/70" />
              <span>Tier 档位底板样式与透明度</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  {
                    id: 'ambient-glass',
                    title: '动态弥散光毛玻璃',
                    desc: '自动提取封面流光 · 无边框',
                  },
                  {
                    id: 'minimal-blur',
                    title: '极简无框柔雾',
                    desc: '纯净暗色雾面毛玻璃',
                  },
                  {
                    id: 'floating-split',
                    title: '左环独立 · 右透明',
                    desc: '仅保留左侧圆环底托',
                  },
                  {
                    id: 'pure-transparent',
                    title: '全透明无底板',
                    desc: '100% 透明悬浮于背景',
                  },
                ] as const
              ).map(opt => {
                const active = tierRowStyle === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    data-testid={`tier-style-${opt.id}`}
                    onClick={() => onChangeTierRowStyle(opt.id)}
                    className={`p-2.5 rounded-xl text-left border transition-colors cursor-pointer ${
                      active
                        ? 'bg-white text-zinc-950 border-white shadow-sm'
                        : 'bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.08] text-white'
                    }`}
                  >
                    <div className="text-xs font-bold">{opt.title}</div>
                    <div
                      className={`text-[10.5px] mt-0.5 ${
                        active ? 'text-zinc-700' : 'text-white/45'
                      }`}
                    >
                      {opt.desc}
                    </div>
                  </button>
                );
              })}
            </div>

            {tierRowStyle !== 'pure-transparent' && tierRowStyle !== 'floating-split' && (
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/85">档位毛玻璃浓度 / 不透明度</span>
                  <span className="px-2 py-0.5 rounded-md bg-white/[0.08] text-xs font-mono text-white">
                    {tierRowOpacity}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={tierRowOpacity}
                  onChange={e => onChangeTierRowOpacity(Number(e.target.value))}
                  aria-label="档位毛玻璃浓度"
                  className="w-full accent-white cursor-pointer"
                />
              </div>
            )}
          </div>

          <hr className="border-white/[0.07]" />

          {/* 1. 渐变主题 */}
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-white mb-3.5">
              <PaintBucket className="w-4 h-4 text-white/70" />
              <span>氛围背景主题</span>
            </div>

            {/* 5-Column Circular Swatch Grid Box */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] grid grid-cols-5 gap-3 place-items-center">
              {GRADIENT_THEMES.map(theme => {
                const isSelected = !useCustomBg && activeThemeId === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    title={theme.name}
                    aria-label={theme.name}
                    onClick={() => {
                      onToggleUseCustomBg(false);
                      onSelectTheme(theme.id);
                    }}
                    className={`w-10 h-10 rounded-full transition-all duration-200 cursor-pointer border border-white/15 ${
                      isSelected
                        ? 'ring-[2.5px] ring-white scale-110 shadow-[0_0_16px_rgba(255,255,255,0.65)]'
                        : 'hover:scale-105 opacity-85 hover:opacity-100'
                    }`}
                    style={{ background: theme.previewGradient }}
                  />
                );
              })}
            </div>

            {/* Category Preset Pills */}
            <div className="flex flex-wrap gap-2 mt-3.5">
              <button
                type="button"
                onClick={() => handleSelectCategory('minimal')}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-medium text-white transition-colors cursor-pointer"
              >
                <Circle className="w-3 h-3 fill-current" />
                <span>Apple 曜石极简</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectCategory('anime-night')}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-medium text-white transition-colors cursor-pointer"
              >
                <Star className="w-3.5 h-3.5" />
                <span>深空夜幕</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectCategory('cyberpunk')}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-medium text-white transition-colors cursor-pointer"
              >
                <Bot className="w-3.5 h-3.5" />
                <span>霓虹胶片</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectCategory('nature')}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-medium text-white transition-colors cursor-pointer"
              >
                <Leaf className="w-3.5 h-3.5" />
                <span>自然静谧</span>
              </button>
              <button
                type="button"
                onClick={handleRandomTheme}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white text-zinc-950 hover:bg-zinc-200 text-xs font-semibold transition-colors cursor-pointer"
              >
                <Dices className="w-3.5 h-3.5" />
                <span>随机切换</span>
              </button>
            </div>
          </div>

          <hr className="border-white/[0.07]" />

          {/* 2. 视觉特效 */}
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-white mb-3.5">
              <Wand2 className="w-4 h-4 text-white/70" />
              <span>环境氛围特效</span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/85">微光粒子效果</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enableParticles}
                  onClick={() => onToggleParticles(!enableParticles)}
                  className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                    enableParticles ? 'bg-white' : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow transition-transform ${
                      enableParticles ? 'translate-x-5 bg-zinc-950' : 'translate-x-0 bg-white'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-white/85">背景柔光晕染</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enableGlow}
                  onClick={() => onToggleGlow(!enableGlow)}
                  className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                    enableGlow ? 'bg-white' : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow transition-transform ${
                      enableGlow ? 'translate-x-5 bg-zinc-950' : 'translate-x-0 bg-white'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          <hr className="border-white/[0.07]" />

          {/* 3. 自定义背景 */}
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-white mb-3.5">
              <ImageIcon className="w-4 h-4 text-white/70" />
              <span>自定义壁纸背景</span>
            </div>

            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-white/85">启用自定义壁纸</span>
              <button
                type="button"
                role="switch"
                aria-checked={useCustomBg}
                onClick={() => onToggleUseCustomBg(!useCustomBg)}
                className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                  useCustomBg ? 'bg-white' : 'bg-white/20'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow transition-transform ${
                    useCustomBg ? 'translate-x-5 bg-zinc-950' : 'translate-x-0 bg-white'
                  }`}
                />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-4">
              <div
                onClick={() => bgUploadInputRef.current?.click()}
                className="relative w-full h-28 rounded-xl border border-dashed border-white/20 hover:border-white/50 bg-black/30 flex flex-col items-center justify-center overflow-hidden cursor-pointer transition-colors"
              >
                {customBgUrl ? (
                  <img
                    src={customBgUrl}
                    alt="背景预览"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <>
                    <ImageIcon className="w-7 h-7 text-white/35 mb-1.5" />
                    <span className="text-xs text-white/45">点击上传本地壁纸</span>
                  </>
                )}
              </div>

              <div className="flex justify-center">
                <input
                  ref={bgUploadInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleBgImageFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => bgUploadInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.12] text-xs font-medium text-white transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>上传背景图片</span>
                </button>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-white/85">壁纸毛玻璃模糊</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enableGlassBlur}
                  onClick={() => onToggleGlassBlur(!enableGlassBlur)}
                  className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                    enableGlassBlur ? 'bg-white' : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow transition-transform ${
                      enableGlassBlur ? 'translate-x-5 bg-zinc-950' : 'translate-x-0 bg-white'
                    }`}
                  />
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/85">模糊强度</span>
                  <span className="px-2.5 py-0.5 rounded-md bg-white/[0.08] border border-white/[0.12] text-xs font-mono text-white">
                    {glassBlurPx}px
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={28}
                  value={glassBlurPx}
                  onChange={e => onChangeGlassBlurPx(Number(e.target.value))}
                  aria-label="模糊强度"
                  className="w-full accent-white cursor-pointer"
                />
              </div>
            </div>
          </div>

          <hr className="border-white/[0.07]" />

          {/* 4. 档位与数据管理 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Sliders className="w-4 h-4 text-white/70" />
              <span>评级分制、档位显示与数据备份</span>
            </div>

            {/* 1-10 Score vs S-D Tier Toggle */}
            <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">排行榜评级分制</span>
                <span className="text-[11px] text-white/45">底层数据无损切换</span>
              </div>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-black/40 border border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => onChangeGradingSystem?.('numeric')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    gradingSystem === 'numeric'
                      ? 'bg-white text-zinc-950 shadow-xs'
                      : 'text-white/65 hover:text-white'
                  }`}
                >
                  1 - 10 分制
                </button>
                <button
                  type="button"
                  onClick={() => onChangeGradingSystem?.('letter')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    gradingSystem === 'letter'
                      ? 'bg-white text-zinc-950 shadow-xs'
                      : 'text-white/65 hover:text-white'
                  }`}
                >
                  S - D 档位制
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-white/85">在海报下方显示动画标题</span>
              <button
                type="button"
                role="switch"
                aria-checked={showTitles}
                onClick={() => onToggleShowTitles(!showTitles)}
                className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                  showTitles ? 'bg-white' : 'bg-white/20'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow transition-transform ${
                    showTitles ? 'translate-x-5 bg-zinc-950' : 'translate-x-0 bg-white'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-white/85">导出截图时只保留有作品的 Tier 行</span>
              <button
                type="button"
                role="switch"
                aria-checked={exportHideEmptyTiers}
                onClick={() => onToggleExportHideEmptyTiers?.(!exportHideEmptyTiers)}
                className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                  exportHideEmptyTiers ? 'bg-white' : 'bg-white/20'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow transition-transform ${
                    exportHideEmptyTiers ? 'translate-x-5 bg-zinc-950' : 'translate-x-0 bg-white'
                  }`}
                />
              </button>
            </div>

            <div>
              <p className="text-xs text-white/60 mb-2">
                {gradingSystem === 'letter'
                  ? '启用档位（S: 9-10分 / A: 7-8分 / B: 5-6分 / C: 3-4分 / D: 1-2分）：'
                  : '自定义启用档位（点击开关单个评分行）：'}
              </p>
              <div className="grid grid-cols-5 gap-1.5">
                {(gradingSystem === 'letter' ? LETTER_TIER_SCORES : ALL_TIER_SCORES).map(score => {
                  const active = visibleTiers.includes(score);
                  const display =
                    gradingSystem === 'letter'
                      ? formatTierLabel(score, 'letter')
                      : String(score);
                  return (
                    <button
                      key={score}
                      type="button"
                      onClick={() => onToggleTierVisibility(score)}
                      className={`py-1.5 rounded-lg text-xs font-mono font-bold border transition-colors cursor-pointer ${
                        active
                          ? 'bg-white text-zinc-950 border-white'
                          : 'bg-white/[0.03] border-white/[0.08] text-white/40 hover:text-white/80'
                      }`}
                    >
                      {display}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Archive className="w-3.5 h-3.5 text-white/75" />
                <span>All-in-One 全量打包备份</span>
              </div>
              <p className="text-[11px] text-white/50 leading-relaxed">
                包含排行榜、候选池、漫评、背景、AI 配置，以及小剧场台本、角色差分、配图、Prompt、开场收尾与语速。本地上传的图片自动内嵌保存，外链图片保留原始地址。备份含 Token 和 API Key，请勿公开分享。
              </p>
              <p data-testid="backup-storage-status" className="text-[11px] text-white/70">{storageStatus}</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid="export-all-in-one-btn"
                  disabled={isExportingBackup}
                  onClick={onExportJson}
                  className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isExportingBackup ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>正在导出备份...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>导出全量备份</span>
                    </>
                  )}
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      onImportJsonFile(file);
                      e.target.value = '';
                    }
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  data-testid="import-all-in-one-btn"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.12] text-xs font-semibold text-white transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>导入全量备份</span>
                </button>
              </div>
              <button type="button" data-testid="restore-before-import-btn" className="text-[11px] text-white/65 underline cursor-pointer" onClick={async () => {
                try { await restoreBeforeImport(); window.location.reload(); }
                catch (error) { setRecoveryMessage(error instanceof Error ? error.message : '恢复失败，当前数据保留'); }
              }}>恢复到上次导入之前</button>
              {recoveryMessage && <p role="status" className="text-xs text-amber-200">{recoveryMessage}</p>
              }
            </div>

            <button
              type="button"
              onClick={onClearAllData}
              className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/25 text-xs font-medium text-rose-200 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>清空全部排行榜数据</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
