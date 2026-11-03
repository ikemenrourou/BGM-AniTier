import type { PromptPlacement, PromptPosition, WorldBookScope } from '../types';
import { normalizePromptPlacement, PROMPT_POSITION_LABELS, WORLD_BOOK_SCOPE_LABELS } from '../lib/promptOrder';

interface Props {
  value: Partial<PromptPlacement> & { scope?: WorldBookScope };
  onChange: (patch: Partial<PromptPlacement> & { scope?: WorldBookScope }) => void;
  label?: string;
  showScope?: boolean;
}

export function PromptPlacementControls({ value, onChange, label = '词条', showScope = false }: Props) {
  const placement = normalizePromptPlacement(value);
  const fieldClass = 'mt-1 w-full rounded-lg border border-white/15 bg-zinc-950 px-2.5 py-2 text-xs text-white focus:outline-none focus:border-white/40';
  return (
    <div className="space-y-2">
      <div className={`grid gap-3 ${showScope ? 'grid-cols-2 xl:grid-cols-3' : 'grid-cols-2'}`}>
        <label className="text-[11px] text-white/55">插入位置
          <select aria-label={`${label}插入位置`} value={placement.position} onChange={e => onChange({ position: e.target.value as PromptPosition })} className={fieldClass}>
            {Object.entries(PROMPT_POSITION_LABELS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-white/55">优先级
          <input aria-label={`${label}优先级`} type="number" step="1" value={placement.priority} onChange={e => onChange({ priority: Number(e.target.value) })} className={fieldClass} />
        </label>
        {showScope && <label className="text-[11px] text-white/55">适用场景
          <select aria-label={`${label}适用场景`} value={value.scope || 'all'} onChange={e => onChange({ scope: e.target.value as WorldBookScope })} className={fieldClass}>
            {Object.entries(WORLD_BOOK_SCOPE_LABELS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>}
      </div>
      <p className="text-[11px] text-white/45">同一位置内，数字越大越靠下；相同数字保持列表顺序。</p>
    </div>
  );
}
