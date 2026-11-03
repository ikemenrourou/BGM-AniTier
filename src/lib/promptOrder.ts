import type { PromptPlacement, PromptPosition, WorldBookEntry, WorldBookScope } from '../types';

export const PROMPT_POSITION_LABELS: Record<PromptPosition, string> = {
  'before-character': '角色设定前',
  'after-character': '角色设定后',
  d0: 'D0（上下文底部）',
};
export const WORLD_BOOK_SCOPE_LABELS: Record<WorldBookScope, string> = {
  all: '两边通用', report: '仅品味锐评', studio: '仅小剧场',
};
export const DEFAULT_PROMPT_PLACEMENT: PromptPlacement = { position: 'after-character', priority: 100 };

export function normalizePromptPlacement(value?: Partial<PromptPlacement> | null, fallback = DEFAULT_PROMPT_PLACEMENT): PromptPlacement {
  return {
    position: value?.position && Object.hasOwn(PROMPT_POSITION_LABELS, value.position) ? value.position : fallback.position,
    priority: typeof value?.priority === 'number' && Number.isFinite(value.priority) ? Math.trunc(value.priority) : fallback.priority,
  };
}

export function sortPromptEntries<T extends Partial<PromptPlacement>>(entries: T[]): T[] {
  const positions: PromptPosition[] = ['before-character', 'after-character', 'd0'];
  return [...entries].sort((a, b) => {
    const left = normalizePromptPlacement(a);
    const right = normalizePromptPlacement(b);
    return positions.indexOf(left.position) - positions.indexOf(right.position) || left.priority - right.priority;
  });
}

export function appliesToWorldBookScope(entry: WorldBookEntry, scope: 'report' | 'studio'): boolean {
  return !entry.scope || entry.scope === 'all' || entry.scope === scope;
}

export function describePromptPlacement(entry: Partial<PromptPlacement>): string {
  const placement = normalizePromptPlacement(entry);
  return `${PROMPT_POSITION_LABELS[placement.position]} · ${placement.priority}`;
}

/** One assembler for preview, generation, reports, and studio rules. */
export function assemblePositionedPrompt(character: string, context: string, entries: WorldBookEntry[]): string {
  const sorted = sortPromptEntries(entries).filter(entry => entry.content.trim());
  const section = (position: PromptPosition) => sorted
    .filter(entry => normalizePromptPlacement(entry).position === position)
    .map(entry => `<world_book title="${entry.title.replace(/[&"<>]/g, char => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[char]!))}">\n${entry.content.trim()}\n</world_book>`)
    .join('\n\n');
  return [section('before-character'), `<RoleDefinition>\n${character.trim()}\n</RoleDefinition>`, section('after-character'), context, section('d0')]
    .filter(Boolean).join('\n\n');
}
