import type { ThemeOption } from '../types';

export interface ExtendedThemeOption extends ThemeOption {
  category: 'anime-night' | 'cyberpunk' | 'nature' | 'minimal';
  orbs: [string, string, string, string];
  surface?: 'mist';
}

export const DEFAULT_THEME_ID = 'deep-blue-mist';
export const DEFAULT_THEME_VERSION = '2026-11-mist';

export function getInitialThemeId(savedId: string | null, defaultsVersion: string | null): string {
  if (!savedId || (savedId === 'chameleon-aurora-pro' && defaultsVersion !== DEFAULT_THEME_VERSION)) return DEFAULT_THEME_ID;
  return getThemeById(savedId).id;
}

const MIST_BACKGROUND = [
  'radial-gradient(ellipse 52% 35% at 43% 112%, rgba(177,154,126,.84) 0%, rgba(136,114,96,.45) 43%, transparent 100%)',
  'radial-gradient(ellipse 30% 40% at 73% 74%, rgba(116,108,96,.47) 0%, rgba(79,86,87,.24) 53%, transparent 100%)',
  'radial-gradient(ellipse 34% 42% at 58% 58%, rgba(0,87,117,.64) 0%, rgba(0,56,86,.36) 52%, transparent 100%)',
  'radial-gradient(ellipse 38% 35% at 18% 79%, rgba(93,35,54,.44) 0%, rgba(52,22,43,.25) 53%, transparent 100%)',
  'radial-gradient(ellipse 50% 52% at 36% 38%, rgba(7,30,73,.48) 0%, transparent 100%)',
  'linear-gradient(145deg, #010115 0%, #000a19 58%, #010611 100%)',
].join(', ');

export const GRADIENT_THEMES: ExtendedThemeOption[] = [
  {
    id: DEFAULT_THEME_ID,
    name: '深蓝雾光（默认）',
    category: 'minimal',
    surface: 'mist',
    previewGradient: MIST_BACKGROUND,
    orbs: ['#10314f', '#005575', '#9a8772', '#492536'],
    backgroundCss: MIST_BACKGROUND,
  },
  // Row 1: New-Gen Fluid Mesh & Apple Music Chameleon Themes
  {
    id: 'chameleon-aurora-pro',
    name: 'Apple Music 封面流光 · 极光棱镜',
    category: 'minimal',
    previewGradient: 'linear-gradient(135deg, #6366f1, #ec4899, #14b8a6, #090a10)',
    orbs: ['#4f46e5', '#db2777', '#0d9488', '#7c3aed'],
    backgroundCss:
      'radial-gradient(ellipse 80% 55% at 18% 12%, rgba(99, 102, 241, 0.24) 0%, transparent 70%), radial-gradient(ellipse 75% 55% at 84% 16%, rgba(236, 72, 153, 0.20) 0%, transparent 72%), radial-gradient(ellipse 80% 60% at 50% 90%, rgba(20, 184, 166, 0.16) 0%, transparent 75%), linear-gradient(180deg, #0b0c14 0%, #08090f 55%, #06070b 100%)',
  },
  {
    id: 'raycast-crimson-prism',
    name: 'Raycast 绯红棱镜 · 暗夜流体',
    category: 'cyberpunk',
    previewGradient: 'linear-gradient(135deg, #f43f5e, #fb923c, #6366f1, #09090d)',
    orbs: ['#e11d48', '#ea580c', '#4f46e5', '#be185d'],
    backgroundCss:
      'radial-gradient(ellipse 80% 50% at 22% -5%, rgba(244, 63, 94, 0.26) 0%, transparent 68%), radial-gradient(ellipse 70% 50% at 80% 15%, rgba(249, 115, 22, 0.18) 0%, transparent 70%), linear-gradient(180deg, #100a0f 0%, #09080c 55%, #060609 100%)',
  },
  {
    id: 'linear-nebula-indigo',
    name: 'Linear 星云靛紫 · 空间微网',
    category: 'anime-night',
    previewGradient: 'linear-gradient(135deg, #4338ca, #7e22ce, #0ea5e9, #07080e)',
    orbs: ['#4338ca', '#7e22ce', '#0284c7', '#312e81'],
    backgroundCss:
      'radial-gradient(ellipse 85% 55% at 50% -10%, rgba(99, 102, 241, 0.28) 0%, rgba(126, 34, 206, 0.12) 48%, transparent 75%), linear-gradient(180deg, #0a0b14 0%, #07080f 55%, #05060a 100%)',
  },
  {
    id: 'visionos-titanium',
    name: 'VisionOS 空间钛金 · 暖调流光',
    category: 'minimal',
    previewGradient: 'linear-gradient(135deg, #a88460, #64748b, #1e1b24, #09090c)',
    orbs: ['#b48a64', '#475569', '#7c5869', '#334155'],
    backgroundCss:
      'radial-gradient(ellipse 75% 50% at 25% 8%, rgba(180, 138, 100, 0.22) 0%, transparent 70%), radial-gradient(ellipse 70% 50% at 78% 18%, rgba(100, 116, 139, 0.20) 0%, transparent 72%), linear-gradient(180deg, #111115 0%, #0a0b0e 55%, #07070a 100%)',
  },
  {
    id: 'emerald-aurora-silk',
    name: '北极星翠 · 赛博青碧流体',
    category: 'nature',
    previewGradient: 'linear-gradient(135deg, #10b981, #06b6d4, #3b82f6, #070b0e)',
    orbs: ['#059669', '#0891b2', '#2563eb', '#0d9488'],
    backgroundCss:
      'radial-gradient(ellipse 80% 52% at 20% 10%, rgba(16, 185, 129, 0.24) 0%, transparent 70%), radial-gradient(ellipse 75% 50% at 82% 20%, rgba(6, 182, 212, 0.20) 0%, transparent 72%), linear-gradient(180deg, #081113 0%, #060b0e 55%, #04080a 100%)',
  },

  // Row 2
  {
    id: 'venus-ambient-dark',
    name: '橄榄香槟 · 胶片暗房',
    category: 'minimal',
    previewGradient: 'linear-gradient(135deg, #6b784e, #7c5263, #121215)',
    orbs: ['#6b784e', '#7c5263', '#4a5d52', '#5c4938'],
    backgroundCss:
      'radial-gradient(ellipse 68% 52% at 16% 12%, rgba(124, 138, 86, 0.24) 0%, transparent 75%), radial-gradient(ellipse 65% 55% at 84% 18%, rgba(148, 108, 118, 0.22) 0%, transparent 78%), linear-gradient(180deg, #111214 0%, #0b0c0f 55%, #07080a 100%)',
  },
  {
    id: 'sakura-noir',
    name: '夜樱流光 · 绯紫暗房',
    category: 'anime-night',
    previewGradient: 'linear-gradient(135deg, #ec4899, #8b5cf6, #1f1321, #0c090e)',
    orbs: ['#db2777', '#7c3aed', '#be185d', '#4f46e5'],
    backgroundCss:
      'radial-gradient(ellipse 85% 50% at 50% -5%, rgba(219, 39, 119, 0.25) 0%, transparent 68%), linear-gradient(180deg, #110b12 0%, #09080b 60%, #060508 100%)',
  },
  {
    id: 'amber-cinema',
    name: '暖金放映室 · 落日胶片',
    category: 'anime-night',
    previewGradient: 'linear-gradient(135deg, #f59e0b, #ef4444, #241712, #0d0908)',
    orbs: ['#d97706', '#dc2626', '#9a3412', '#b45309'],
    backgroundCss:
      'radial-gradient(ellipse 85% 50% at 50% -5%, rgba(217, 119, 6, 0.24) 0%, transparent 68%), linear-gradient(180deg, #120d0a 0%, #0a0807 60%, #060505 100%)',
  },
  {
    id: 'arctic-slate',
    name: '极地冰川 · 冰蓝天幕',
    category: 'nature',
    previewGradient: 'linear-gradient(135deg, #38bdf8, #3b82f6, #0f1d2b, #080d14)',
    orbs: ['#0284c7', '#2563eb', '#0d9488', '#1d4ed8'],
    backgroundCss:
      'radial-gradient(ellipse 85% 50% at 50% -5%, rgba(56, 189, 248, 0.24) 0%, transparent 68%), linear-gradient(180deg, #091017 0%, #070b0f 60%, #05070a 100%)',
  },
  {
    id: 'apple-studio-dark',
    name: 'Apple Pro 极夜摄影棚',
    category: 'minimal',
    previewGradient: 'linear-gradient(135deg, #52525b, #27272a, #09090b)',
    orbs: ['#52525b', '#3f3f46', '#334155', '#27272a'],
    backgroundCss:
      'radial-gradient(ellipse 80% 45% at 50% -10%, rgba(255, 255, 255, 0.10) 0%, rgba(255, 255, 255, 0.02) 45%, transparent 75%), linear-gradient(180deg, #0d0d10 0%, #09090b 55%, #060608 100%)',
  },

  // Row 3
  {
    id: 'aurora-violet',
    name: '星云紫晶 · 幻夜流光',
    category: 'cyberpunk',
    previewGradient: 'linear-gradient(135deg, #8b5cf6, #d946ef, #191233, #090814)',
    orbs: ['#7c3aed', '#c026d3', '#4f46e5', '#9333ea'],
    backgroundCss:
      'radial-gradient(ellipse 85% 50% at 50% -5%, rgba(124, 58, 237, 0.26) 0%, transparent 68%), linear-gradient(180deg, #0e0b16 0%, #08070d 60%, #050508 100%)',
  },
  {
    id: 'crimson-velvet',
    name: '丝绒落日 · 玫瑰暗涌',
    category: 'cyberpunk',
    previewGradient: 'linear-gradient(135deg, #e11d48, #9f1239, #240d18, #0c060a)',
    orbs: ['#e11d48', '#be123c', '#9d174d', '#b91c1c'],
    backgroundCss:
      'radial-gradient(ellipse 85% 50% at 50% -5%, rgba(225, 29, 72, 0.24) 0%, transparent 68%), linear-gradient(180deg, #130a0e 0%, #090608 60%, #060405 100%)',
  },
  {
    id: 'forest-mist',
    name: '静谧森雾 · 翡翠微光',
    category: 'nature',
    previewGradient: 'linear-gradient(135deg, #10b981, #047857, #0f1f19, #070d0b)',
    orbs: ['#059669', '#047857', '#0f766e', '#15803d'],
    backgroundCss:
      'radial-gradient(ellipse 85% 50% at 50% -5%, rgba(16, 185, 129, 0.22) 0%, transparent 68%), linear-gradient(180deg, #0a120e 0%, #070b09 60%, #050706 100%)',
  },
  {
    id: 'ocean-trench',
    name: '深海潜航 · 蔚蓝幽光',
    category: 'nature',
    previewGradient: 'linear-gradient(135deg, #0ea5e9, #1d4ed8, #091d2b, #050c12)',
    orbs: ['#0284c7', '#1d4ed8', '#0369a1', '#0f766e'],
    backgroundCss:
      'radial-gradient(ellipse 85% 50% at 50% -5%, rgba(14, 165, 233, 0.26) 0%, transparent 68%), linear-gradient(180deg, #081218 0%, #060b0f 60%, #04070a 100%)',
  },
  {
    id: 'graphite-mono',
    name: '纯平黑曜 · 零干扰暗室',
    category: 'minimal',
    previewGradient: 'linear-gradient(135deg, #27272a, #18181b, #09090b)',
    orbs: ['#27272a', '#1f2937', '#18181b', '#27272a'],
    backgroundCss: 'linear-gradient(180deg, #0f1014 0%, #0a0b0e 50%, #070709 100%)',
  },
];

export function getThemeById(themeId: string): ExtendedThemeOption {
  return GRADIENT_THEMES.find(t => t.id === themeId) || GRADIENT_THEMES[0];
}
