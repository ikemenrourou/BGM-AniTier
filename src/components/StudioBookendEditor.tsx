import React, { useRef } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import type { StudioBookendScene } from '../lib/studioDirector';
import { compressImageFileToDataUrl } from '../lib/bangumiApi';

interface StudioBookendEditorProps {
  scene: StudioBookendScene;
  kind: 'opening' | 'ending';
  userName: string;
  companionName: string;
  onChange: (scene: StudioBookendScene) => void;
  finaleImages?: string[];
  onChangeFinaleImages?: (images: string[]) => void;
}

export const StudioBookendEditor: React.FC<StudioBookendEditorProps> = ({
  scene,
  kind,
  userName,
  companionName,
  onChange,
  finaleImages = [],
  onChangeFinaleImages,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const title = kind === 'opening' ? '开场 · 先聊聊规则' : '收尾 · 排完再聊';
  const label = kind === 'opening' ? '开场' : '收尾';

  const handleFinaleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !onChangeFinaleImages) return;
    try {
      const uploaded: string[] = [];
      for (const file of files.slice(0, 2)) {
        const dataUrl = await compressImageFileToDataUrl(file, 2200, 3600, 0.9);
        if (dataUrl) uploaded.push(dataUrl);
      }
      if (uploaded.length > 0) {
        onChangeFinaleImages([...finaleImages, ...uploaded].slice(0, 2));
      }
    } finally {
      e.target.value = '';
    }
  };

  return (
    <section data-testid={`studio-${kind}-editor`} className="rounded-2xl border border-white/12 bg-white/[0.035] p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <p className="text-xs text-white/50 mt-1">
            {kind === 'opening' ? '第一部作品出场前播放。可以介绍评分标准，也可以直接跳过。' : '最后一部作品结束后播放。写下你的总结，让搭档接话吐槽。'}
          </p>
        </div>
        <label className="shrink-0 flex items-center gap-2 text-xs text-white/85 cursor-pointer">
          <input type="checkbox" aria-label={`启用${label}`} checked={scene.enabled} onChange={e => onChange({ ...scene, enabled: e.target.checked })} className="accent-white" />
          启用{label}
        </label>
      </div>
      {scene.enabled && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-2 text-xs text-white/70">
              <span>{userName} 的{label}</span>
              <textarea
                aria-label={`我的${label}台词`}
                rows={3}
                value={scene.userText}
                onChange={e => onChange({ ...scene, userText: e.target.value })}
                placeholder={kind === 'opening' ? '例如：今天按个人喜欢程度打分，不追求客观。先讲讲我的标准……' : '例如：回头看这张榜，最让我意外的其实是……'}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/12 text-sm leading-relaxed text-white focus:outline-none focus:border-white/40"
              />
            </label>
            <label className="space-y-2 text-xs text-white/70">
              <span>{companionName} 的{label}接话</span>
              <textarea
                aria-label={`AI${label}台词`}
                rows={3}
                value={scene.aiRawText}
                onChange={e => onChange({ ...scene, aiRawText: e.target.value })}
                placeholder="可以自己写，也可以用页面上方的「生成全榜 AI 吐槽台本」一起生成。"
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/12 text-sm leading-relaxed text-white focus:outline-none focus:border-white/40"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/50">
            <span>留空的台词会跳过；支持 [表情名] 切换表情。修改会自动保存。</span>
            <label className="flex items-center gap-2 cursor-pointer text-white/70">
              <input type="checkbox" aria-label={`生成全榜时更新AI${label}`} checked={scene.generateAi} onChange={e => onChange({ ...scene, generateAi: e.target.checked })} className="accent-white" />
              生成全榜台本时一起更新 AI {label}
            </label>
          </div>
        </>
      )}

      {kind === 'ending' && onChangeFinaleImages && (
        <div
          data-testid="studio-finale-images-panel"
          className="pt-3 border-t border-white/10 space-y-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-bold text-white">
                终局总览图展示（可选 · 最多 2 张）
              </h4>
              <p className="text-[11px] text-white/50 mt-0.5">
                上传你导出的 Tier 榜长图或海报墙图片，演播结束时会在虚化舞台中央放大展示；不上传则自动跳过总览环节。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFinaleFileChange}
                className="hidden"
              />
              {finaleImages.length < 2 && (
                <button
                  type="button"
                  data-testid="studio-upload-finale-image-btn"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/15 text-xs font-bold text-white cursor-pointer"
                >
                  <ImagePlus className="w-3.5 h-3.5 text-amber-300" />
                  <span>导入总览图 ({finaleImages.length}/2)</span>
                </button>
              )}
              {finaleImages.length > 0 && (
                <button
                  type="button"
                  data-testid="studio-clear-finale-images-btn"
                  onClick={() => onChangeFinaleImages([])}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/25 text-xs font-semibold text-rose-200 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>清空</span>
                </button>
              )}
            </div>
          </div>

          {finaleImages.length > 0 && (
            <div className="flex flex-wrap gap-3 pt-1">
              {finaleImages.map((imgUrl, idx) => (
                <div
                  key={idx}
                  className="relative group w-28 h-36 rounded-xl overflow-hidden border border-white/20 bg-black/50 shadow-md"
                >
                  <img
                    src={imgUrl}
                    alt={`终局总览图 ${idx + 1}`}
                    className="w-full h-full object-contain"
                  />
                  <button
                    type="button"
                    aria-label={`移除总览图 ${idx + 1}`}
                    onClick={() =>
                      onChangeFinaleImages(finaleImages.filter((_, i) => i !== idx))
                    }
                    className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-black/80 text-rose-300 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

