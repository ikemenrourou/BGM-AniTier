import React from 'react';
import type { StudioBookendScene } from '../lib/studioDirector';

interface StudioBookendEditorProps {
  scene: StudioBookendScene;
  kind: 'opening' | 'ending';
  userName: string;
  companionName: string;
  onChange: (scene: StudioBookendScene) => void;
}

export const StudioBookendEditor: React.FC<StudioBookendEditorProps> = ({
  scene, kind, userName, companionName, onChange,
}) => {
  const title = kind === 'opening' ? '开场 · 先聊聊规则' : '收尾 · 排完再聊';
  const label = kind === 'opening' ? '开场' : '收尾';
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
    </section>
  );
};
