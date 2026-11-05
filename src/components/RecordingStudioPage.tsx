import { requestAiStream } from '../lib/aiStream';
import { IS_STATIC_HOSTING } from '../lib/runtime';
import { summarizeDiscussionData } from '../lib/studioContext';
import { PromptPlacementControls } from './PromptPlacementControls';
import { appliesToWorldBookScope, DEFAULT_PROMPT_PLACEMENT, describePromptPlacement, sortPromptEntries, WORLD_BOOK_SCOPE_LABELS } from '../lib/promptOrder';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Sparkles,
  Volume2,
  VolumeX,
  Eye,
  EyeOff,
  Shuffle,
  ArrowUp,
  ArrowDown,
  Image as ImageIcon,
  Trash2,
  Wand2,
  Check,
  Loader2,
  Film,
  FileText,
  Plus,
  RotateCcw,
  Layers,
  Copy,
  BookOpen,
  Edit3,
  Globe,
  Smile,
  SlidersHorizontal,
  Upload,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Music,
} from 'lucide-react';
import type {
  AIConfig,
  AnimeItem,
  CommentItem,
  SubjectCategory,
  TierGradingSystem,
  TierMap,
  TierRowStyle,
  TierScore,
  WorldBookEntry,
} from '../types';
import {
  ALL_TIER_SCORES,
  DEFAULT_VISIBLE_TIERS,
  LETTER_DEFAULT_VISIBLE_TIERS,
  formatTierBadgeText,
  formatTierLabel,
  normalizeWorldBookEntries,
} from '../lib/tierLogic';
import {
  BLUE_ARCHIVE_EMOTE_META,
  DEFAULT_CUSTOM_EMOTE_RULES,
  DEFAULT_EXPRESSION_RULE_TEMPLATE,
  DEFAULT_STUDIO_AI_COMPANIONS,
  DEFAULT_STUDIO_PROMPT_RULES_CONFIG,
  DEFAULT_TIMELINE_RULE_TEMPLATE,
  DEFAULT_USER_STUDIO_CHARACTER,
  VOICE_BLIP_PRESETS,
  buildInitialStudioScriptList,
  buildPlaybackSteps,
  buildStudioTimelinePrompt,
  extractUserTextAndHiddenNotes,
  getStudioWorldBookEntries,
  formatEmoteListPlaceholder,
  formatExpressionListPlaceholder,
  generateSmartFallbackStudioComment,
  normalizeStudioPromptRules,
  normalizeStudioBookends,
  normalizeStudioUserCharacter,
  updateStudioCharacter,
  normalizeStudioCompanions,
  parseDialogueSegments,
  parseStudioAiScriptResponse,
  parseStudioBookendResponse,
  resolveBubbleActiveCue,
  resolveCharacterStandeeUrl,
  type BlueArchiveEmoteId,
  type StudioCharacterConfig,
  type StudioCustomExpression,
  type StudioExpressionId,
  type StudioMetaCardStyle,
  type StudioPromptRulesConfig,
  type StudioPlaybackStep,
  type StudioScriptItem,
  type StudioBookends,
  type VoiceBlipPresetId,
} from '../lib/studioDirector';
import {
  playCuteVoiceBlip,
  playEmotePopSound,
  playScoreRevealChime,
  previewVoiceBlipPhrase,
} from '../lib/voiceBlipEngine';
import { TierRow } from './TierRow';
import { StudioEntrance, type StudioEntrancePhase } from './StudioEntrance';
import { StudioBookendEditor } from './StudioBookendEditor';
import { StudioSceneImage } from './StudioSceneImage';
import { StudioDialogueBubble } from './StudioDialogueBubble';
import { DEFAULT_STUDIO_SPEECH_SPEED, STUDIO_SPEECH_SPEEDS, normalizeStudioSpeechSpeed, getStudioCharacterDelay, getStudioTurnDelay } from '../lib/studioSpeech';
import { compressImageFileToDataUrl, fetchBangumiDeepSubjectData } from '../lib/bangumiApi';

interface RecordingStudioPageProps {
  boardTitle: string;
  tiers: TierMap;
  unrankedPool?: AnimeItem[];
  comments: CommentItem[];
  visibleTiers: TierScore[];
  gradingSystem: TierGradingSystem;
  tierRowStyle: TierRowStyle;
  tierRowOpacity: number;
  showTitles: boolean;
  aiConfig: AIConfig;
  onAiConfigChange?: (next: AIConfig) => void;
  onUpdateTiers?: (nextTiers: TierMap) => void;
  onExitStudio: () => void;
}

import { STUDIO_STORAGE_KEYS } from '../lib/persistenceSchema';
import { appStorage } from '../lib/appStorage';

const StudioSpeechSpeedControl: React.FC<{ value: number; onChange: (speed: number) => void }> = ({ value, onChange }) => (
  <label className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-xs text-white/75">
    <span>说话速度</span>
    <select
      aria-label="说话速度"
      data-testid="studio-speech-speed"
      value={value}
      onChange={event => onChange(normalizeStudioSpeechSpeed(event.target.value))}
      className="rounded-lg bg-zinc-900 border border-white/20 px-2 py-1 text-white cursor-pointer focus-visible:outline-2 focus-visible:outline-white"
    >
      {STUDIO_SPEECH_SPEEDS.map(speed => <option key={speed} value={speed}>{speed}×{speed === DEFAULT_STUDIO_SPEECH_SPEED ? '（默认）' : ''}</option>)}
    </select>
  </label>
);

const LETTER_RING_COLORS: Record<string, string> = {
  S: '#fb7185',
  'S-': '#f43f5e',
  A: '#fbbf24',
  'A-': '#f59e0b',
  B: '#38bdf8',
  'B-': '#0ea5e9',
  C: '#34d399',
  'C-': '#10b981',
  D: '#a78bfa',
  'D-': '#8b5cf6',
  E: '#94a3b8',
  F: '#64748b',
};

function getCategoryLabel(category?: SubjectCategory): string {
  if (category === 'book') return 'BOOK';
  if (category === 'game') return 'GAME';
  return 'ANIME';
}

function formatMetaStamp(anime: AnimeItem): string {
  const dateRaw = anime.airDate || '';
  const ymMatch = dateRaw.match(/^(\d{4})[-/.](\d{1,2})/);
  const ym = ymMatch
    ? `${ymMatch[1]}.${ymMatch[2].padStart(2, '0')}`
    : dateRaw.slice(0, 7) || 'ARCHIVE';
  return [
    `${ym} · ${getCategoryLabel(anime.category)}`,
    anime.bgmScore ? `BGM ${anime.bgmScore}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Animated Comic Emote Overlay (rendered near the character standee's upper-right head only on rare peak moments)
 */
const ComicEmoteOverlay: React.FC<{
  emote: BlueArchiveEmoteId;
  side?: 'left' | 'right';
}> = ({ emote, side = 'right' }) => {
  if (!emote || emote === 'none') return null;

  const posClass =
    side === 'right' ? '-top-2 right-2' : '-top-2 left-2';

  switch (emote) {
    case 'sweat_drops':
      return (
        <div
          data-testid="comic-emote-sweat_drops"
          className={`absolute ${posClass} z-30 pointer-events-none animate-bounce`}
        >
          <svg width="42" height="42" viewBox="0 0 44 44" fill="none">
            <path
              d="M14 8C14 8 8 17 8 21C8 24.3137 10.6863 27 14 27C17.3137 27 20 24.3137 20 21C20 17 14 8 14 8Z"
              fill="#38BDF8"
              stroke="#FFFFFF"
              strokeWidth="2.2"
            />
            <path
              d="M29 4C29 4 24 11 24 14.5C24 17.2614 26.2386 19.5 29 19.5C31.7614 19.5 34 17.2614 34 14.5C34 11 29 4 29 4Z"
              fill="#7DD3FC"
              stroke="#FFFFFF"
              strokeWidth="2"
            />
            <path
              d="M32 23C32 23 28 29 28 31.5C28 33.7091 29.7909 35.5 32 35.5C34.2091 35.5 36 33.7091 36 31.5C36 29 32 23 32 23Z"
              fill="#38BDF8"
              stroke="#FFFFFF"
              strokeWidth="2"
            />
          </svg>
        </div>
      );

    case 'anger_vein':
      return (
        <div
          data-testid="comic-emote-anger_vein"
          className={`absolute ${posClass} z-30 pointer-events-none animate-ping`}
          style={{ animationDuration: '1.1s' }}
        >
          <svg width="40" height="40" viewBox="0 0 42 42" fill="none">
            <path
              d="M18 6C18 14 14 18 6 18M24 6C24 14 28 18 36 18M18 36C18 28 14 24 6 24M24 36C24 28 28 24 36 24"
              stroke="#FB7185"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d="M18 6C18 14 14 18 6 18M24 6C24 14 28 18 36 18M18 36C18 28 14 24 6 24M24 36C24 28 28 24 36 24"
              stroke="#FFFFFF"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      );

    case 'sparkles':
      return (
        <div
          data-testid="comic-emote-sparkles"
          className={`absolute ${posClass} z-30 pointer-events-none animate-pulse`}
        >
          <svg width="42" height="42" viewBox="0 0 44 44" fill="none">
            <path
              d="M22 3L25.5 15.5L38 19L25.5 22.5L22 35L18.5 22.5L6 19L18.5 15.5L22 3Z"
              fill="#FDE047"
              stroke="#FFFFFF"
              strokeWidth="2"
            />
            <path
              d="M35 27L36.5 32L41.5 33.5L36.5 35L35 40L33.5 35L28.5 33.5L33.5 32L35 27Z"
              fill="#FEF08A"
            />
          </svg>
        </div>
      );

    case 'hearts':
      return (
        <div
          data-testid="comic-emote-hearts"
          className={`absolute ${posClass} z-30 pointer-events-none animate-bounce`}
        >
          <svg width="40" height="40" viewBox="0 0 42 42" fill="none">
            <path
              d="M21 35C21 35 7 25.2 7 14.5C7 9.8 10.7 6 15.2 6C18 6 20.1 7.5 21 9.5C21.9 7.5 24 6 26.8 6C31.3 6 35 9.8 35 14.5C35 25.2 21 35 21 35Z"
              fill="#F43F5E"
              stroke="#FFFFFF"
              strokeWidth="2.4"
            />
          </svg>
        </div>
      );

    case 'question':
      return (
        <div
          data-testid="comic-emote-question"
          className={`absolute ${posClass} z-30 pointer-events-none animate-bounce`}
        >
          <div className="w-9 h-9 rounded-full bg-amber-400 border-2 border-white shadow-lg flex items-center justify-center font-black text-zinc-950 text-xl">
            ?
          </div>
        </div>
      );

    case 'exclamation':
      return (
        <div
          data-testid="comic-emote-exclamation"
          className={`absolute ${posClass} z-30 pointer-events-none animate-bounce`}
        >
          <div className="w-9 h-9 rounded-full bg-sky-400 border-2 border-white shadow-lg flex items-center justify-center font-black text-white text-xl">
            !
          </div>
        </div>
      );

    case 'sleep_zzz':
      return (
        <div
          data-testid="comic-emote-sleep_zzz"
          className={`absolute ${posClass} z-30 pointer-events-none animate-pulse`}
        >
          <div className="px-2 py-0.5 rounded-full bg-indigo-500/90 border-2 border-white text-white font-black text-xs shadow-lg">
            Zzz...
          </div>
        </div>
      );

    case 'fire':
      return (
        <div
          data-testid="comic-emote-fire"
          className={`absolute ${posClass} z-30 pointer-events-none animate-bounce`}
        >
          <div className="px-2 py-0.5 rounded-full bg-orange-500 border-2 border-white text-white font-black text-sm shadow-lg">
            🔥
          </div>
        </div>
      );

    default:
      return null;
  }
};

/**
 * Top-Right Persistent Meta Card (Replicating the 3 horizontal card designs from PosterWallModal.tsx)
 * With Delayed Score Reveal (`?` while flying in, then reveals the true score!)
 */
const TopRightMetaSpotlightCard: React.FC<{
  work: StudioScriptItem | null;
  scoreRevealed: boolean;
  styleVariant: StudioMetaCardStyle;
  gradingSystem: TierGradingSystem;
}> = ({ work, scoreRevealed, styleVariant, gradingSystem }) => {
  if (!work) {
    return (
      <div
        data-testid="studio-topright-meta-card-empty"
        className="relative isolate rounded-[22px] overflow-hidden bg-[#10121a] border border-white/[0.1] min-h-[188px] flex flex-col items-center justify-center p-5 text-center"
      >
        <p className="text-xs font-semibold text-white/60">等待揭晓下一部作品</p>
        <p className="text-[11px] text-white/35 mt-1">
          按 <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/80 font-mono">Space</kbd> 或{' '}
          <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/80 font-mono">→</kbd> 开始演播
        </p>
      </div>
    );
  }

  const { anime, targetScore, userText } = work;
  const displayScoreText = scoreRevealed
    ? formatTierLabel(targetScore, gradingSystem)
    : '?';

  const ringStrokeColor = !scoreRevealed
    ? '#fbbf24'
    : gradingSystem === 'letter'
    ? LETTER_RING_COLORS[displayScoreText] || '#ffffff'
    : '#ffffff';

  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const progress = scoreRevealed ? Math.max(0.1, Math.min(1, targetScore / 10)) : 0.72;
  const strokeDashoffset = circumference * (1 - progress);

  const extremeRingClass =
    scoreRevealed && targetScore >= 9.5
      ? 'ring-1 ring-amber-300/45 shadow-[0_18px_42px_rgba(0,0,0,0.65),0_0_28px_rgba(251,191,36,0.16)]'
      : 'ring-1 ring-white/[0.1] shadow-[0_16px_36px_rgba(0,0,0,0.58)]';

  const ScoreRingBadge = (
    <div
      data-testid="studio-topright-score-badge"
      data-score-revealed={scoreRevealed ? 'true' : 'false'}
      aria-label={scoreRevealed ? formatTierBadgeText(targetScore, gradingSystem) : '评分悬念揭晓中'}
      className={`relative inline-flex items-center justify-center w-8 h-8 rounded-full bg-black/50 backdrop-blur-md shrink-0 transition-transform duration-500 ${
        scoreRevealed ? 'scale-100' : 'scale-105 animate-pulse'
      }`}
    >
      <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="transparent"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth="2.8"
        />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="transparent"
          stroke={ringStrokeColor}
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-700"
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-black tracking-tight tabular-nums text-[11px]"
        style={{ color: ringStrokeColor }}
      >
        {displayScoreText}
      </span>
    </div>
  );

  // Brief metadata AND user comment for the 2号位置 upper-left area (preserving BGM score & staff info even when user comment is present!)
  const rawVisibleUserNote = extractUserTextAndHiddenNotes(userText).visibleText;
  const visibleUserNote = rawVisibleUserNote
    .replace(/<\/?(?:big|shake|mask|whisper|大|抖|码|虚)>/gi, '')
    .replace(/\{(?:大|抖|码|虚|big|shake|mask|whisper):([^{}]+)\}/gi, '$1')
    .replace(/~~([^~\n]+)~~/g, '$1')
    .replace(/(?:\[\s*(?:换页|翻页|page)\s*\]|<\s*(?:换页|翻页|page)\s*>)/gi, ' ')
    .trim();
  const staffMetaLine = [
    anime.studio,
    anime.director ? `监督:${anime.director}` : '',
    anime.bgmScore ? `BGM ${anime.bgmScore}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const secondaryNote =
    visibleUserNote ||
    staffMetaLine ||
    anime.summary ||
    '';

  // Variant 1: Right Feathered Cover + Upper-Left Gray Note + Bottom-Left Score & Title (Matches PosterWallModal wide-feather)
  if (styleVariant === 'wide-feather') {
    return (
      <div
        data-testid="studio-topright-meta-card"
        data-card-variant="wide-feather"
        className={`relative isolate rounded-[22px] overflow-hidden bg-[#10121a] ${extremeRingClass} min-h-[188px] flex flex-col justify-between p-4 transition-all duration-500`}
      >
        {/* Ambient Diffused Cover Base */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          <img
            src={anime.cover}
            alt=""
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover scale-150 blur-[40px] saturate-[2.0] opacity-80"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(100deg, rgba(12, 13, 19, 0.92) 0%, rgba(14, 15, 22, 0.76) 46%, rgba(10, 11, 16, 0.22) 100%)',
            }}
          />
        </div>

        {/* Right 58% Feathered Cover */}
        <div className="absolute inset-y-0 right-0 w-[58%] z-0 pointer-events-none overflow-hidden">
          <img
            src={anime.cover}
            alt={anime.title}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-top mask-fade-left opacity-95"
          />
        </div>

        {/* Top-Left Giant Watermark */}
        <span
          aria-hidden="true"
          className="absolute -top-2.5 left-3.5 text-[62px] font-black leading-none tracking-tighter select-none pointer-events-none tabular-nums z-10 bg-gradient-to-b from-white/[0.18] via-white/[0.06] to-transparent bg-clip-text text-transparent transition-all duration-500"
        >
          {displayScoreText}
        </span>

        {/* 2号位置: Upper-Left Gray Comment / Staff Note */}
        <div className="relative z-10 pr-[40%] pt-4 mb-1.5 min-h-[40px] flex flex-col items-start justify-start gap-0.5">
          {visibleUserNote && staffMetaLine && (
            <p className="text-[10px] font-mono text-white/55 truncate max-w-full">
              {staffMetaLine}
            </p>
          )}
          {secondaryNote && (
            <p className="text-[11px] text-zinc-400/90 leading-[1.55] line-clamp-3 font-normal tracking-wide">
              {secondaryNote}
            </p>
          )}
        </div>

        {/* Bottom-Left: 1号位置 Score Ring + Date/Category + Title */}
        <div className="relative z-10 pr-[38%] flex flex-col justify-end">
          <div className="flex items-center gap-2 mb-1.5">
            {ScoreRingBadge}
            <span className="text-[10px] font-mono tracking-wider uppercase text-white/65">
              {formatMetaStamp(anime)}
            </span>
          </div>
          <h3
            data-testid="studio-topright-work-title"
            className="text-[15.5px] sm:text-[16px] font-extrabold text-white leading-snug tracking-tight line-clamp-2"
          >
            {anime.title}
          </h3>
        </div>
      </div>
    );
  }

  // Variant 2: Left 2:3 Vertical Cover + Right Editorial (Matches PosterWallModal wide-split)
  if (styleVariant === 'wide-split') {
    return (
      <div
        data-testid="studio-topright-meta-card"
        data-card-variant="wide-split"
        className={`relative isolate rounded-[22px] p-3.5 overflow-hidden bg-[#10121a] ${extremeRingClass} flex items-stretch gap-3.5 min-h-[188px] transition-all duration-500`}
      >
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          <img
            src={anime.cover}
            alt=""
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover scale-150 blur-[42px] saturate-[2.0] opacity-75"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(110deg, rgba(12, 13, 19, 0.58) 0%, rgba(13, 14, 21, 0.85) 45%, rgba(10, 11, 16, 0.94) 100%)',
            }}
          />
        </div>

        <span
          aria-hidden="true"
          className="absolute -top-2.5 right-3.5 text-[62px] font-black leading-none tracking-tighter select-none pointer-events-none tabular-nums z-10 bg-gradient-to-b from-white/[0.22] via-white/[0.08] to-transparent bg-clip-text text-transparent"
        >
          {displayScoreText}
        </span>

        <div className="relative z-10 w-[108px] aspect-[2/3] rounded-[14px] overflow-hidden shrink-0 shadow-[0_10px_26px_rgba(0,0,0,0.65)] bg-zinc-900">
          <img
            src={anime.cover}
            alt={anime.title}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        </div>

        <div className="relative z-10 flex-1 min-w-0 flex flex-col justify-between py-0.5 pr-1">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              {ScoreRingBadge}
              <span className="text-[10px] font-mono tracking-wider uppercase text-white/65">
                {formatMetaStamp(anime)}
              </span>
            </div>
            <h3
              data-testid="studio-topright-work-title"
              className="text-[15px] font-extrabold text-white leading-snug tracking-tight line-clamp-2 mb-1"
            >
              {anime.title}
            </h3>
            {visibleUserNote && staffMetaLine && (
              <p className="text-[10px] font-mono text-white/55 truncate mb-0.5">
                {staffMetaLine}
              </p>
            )}
            {secondaryNote && (
              <p className="text-[11px] text-zinc-300/75 leading-[1.55] line-clamp-2 font-normal">
                {secondaryNote}
              </p>
            )}
          </div>

          {anime.tags && anime.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 pt-1.5 text-[9.5px] text-white/50 font-mono">
              {anime.tags.slice(0, 3).map(tag => (
                <span key={tag} className="px-1.5 py-0.5 rounded bg-white/[0.07]">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Variant 3: Wide Archive Ticket Stub (Matches PosterWallModal wide-polaroid)
  return (
    <div
      data-testid="studio-topright-meta-card"
      data-card-variant="wide-polaroid"
      className={`relative isolate rounded-[22px] overflow-hidden bg-[#11131c] ${extremeRingClass} flex items-stretch min-h-[188px] transition-all duration-500`}
    >
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <img
          src={anime.cover}
          alt=""
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover scale-150 blur-[44px] saturate-[1.9] opacity-65"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(135deg, rgba(14, 16, 24, 0.90) 0%, rgba(10, 11, 17, 0.82) 100%)',
          }}
        />
      </div>

      <div className="relative z-10 flex-1 min-w-0 p-4 flex flex-col justify-between border-r border-dashed border-white/[0.1]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {ScoreRingBadge}
            <span className="text-[10px] font-mono tracking-widest uppercase text-white/55">
              {formatMetaStamp(anime)}
            </span>
          </div>
          <span className="text-[28px] font-black leading-none tracking-tighter text-white/25 tabular-nums select-none">
            {displayScoreText}
          </span>
        </div>

        <div className="my-1.5">
          <h3
            data-testid="studio-topright-work-title"
            className="text-[15px] font-extrabold text-white leading-snug tracking-tight line-clamp-2 mb-1"
          >
            {anime.title}
          </h3>
          {visibleUserNote && staffMetaLine && (
            <p className="text-[10px] font-mono text-white/55 truncate mb-0.5">
              {staffMetaLine}
            </p>
          )}
          {secondaryNote && (
            <p className="text-[11px] text-zinc-300/75 leading-[1.55] line-clamp-2 font-normal">
              {secondaryNote}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between text-[9px] font-mono tracking-widest uppercase text-white/35">
          <span>NO. {String(anime.id).slice(-5)}</span>
          <span>ARCHIVE TICKET</span>
        </div>
      </div>

      <div className="relative z-10 w-[114px] p-2.5 shrink-0 flex items-center justify-center">
        <div className="w-full aspect-[2/3] rounded-[13px] overflow-hidden bg-zinc-900 shadow-[0_10px_24px_rgba(0,0,0,0.65)]">
          <img
            src={anime.cover}
            alt={anime.title}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    </div>
  );
};

const MAX_PRELOADED_STUDIO_IMAGES = 160;
const preloadedStudioImages = new Map<string, HTMLImageElement>();

function warmStudioImageUrl(url?: string): Promise<void> {
  if (!url || typeof Image === 'undefined') return Promise.resolve();
  const existing = preloadedStudioImages.get(url);
  if (existing && existing.complete) return Promise.resolve();

  return new Promise<void>(resolve => {
    const img = existing || new Image();
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    const done = () => resolve();
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
    if (!existing) {
      if (preloadedStudioImages.size >= MAX_PRELOADED_STUDIO_IMAGES) {
        const oldestKey = preloadedStudioImages.keys().next().value;
        if (oldestKey) preloadedStudioImages.delete(oldestKey);
      }
      preloadedStudioImages.set(url, img);
      img.src = url;
    }
    if (img.complete) resolve();
  });
}

function isAnimatedGifStandee(src?: string): boolean {
  if (!src) return false;
  const lower = src.toLowerCase();
  return lower.includes('.gif') || lower.startsWith('data:image/gif');
}

const META_CARD_STYLES: readonly StudioMetaCardStyle[] = [
  'wide-feather',
  'wide-split',
  'wide-polaroid',
];

export const RecordingStudioPage: React.FC<RecordingStudioPageProps> = ({
  boardTitle,
  tiers,
  comments,
  visibleTiers,
  gradingSystem,
  tierRowStyle,
  tierRowOpacity,
  showTitles,
  aiConfig,
  onAiConfigChange,
  onUpdateTiers,
  onExitStudio,
}) => {
  // Mode: 'prep' (1. 台本与角色设置) vs 'stage' (2. 16:9 录屏演播舞台)
  const [studioMode, setStudioMode] = useState<'prep' | 'stage'>('stage');

  // Prep Settings Sub-Tab (Matches the restrained 4-tab layout in Figure 1 left side)
  const [prepSettingsTab, setPrepSettingsTab] = useState<
    'worldbook' | 'personas' | 'expressions' | 'api' | 'preview'
  >('personas');

  // Saved custom characters are preserved; retired built-in presets upgrade on load.
  const [userChar, setUserChar] = useState<StudioCharacterConfig>(() => {
    try {
      const saved = appStorage.getItem(STUDIO_STORAGE_KEYS.USER_CHAR);
      if (saved) {
        return normalizeStudioUserCharacter(JSON.parse(saved));
      }
    } catch {
      // ignore
    }
    return normalizeStudioUserCharacter();
  });

  const [companions, setCompanions] = useState<StudioCharacterConfig[]>(() => {
    try {
      const saved = appStorage.getItem(STUDIO_STORAGE_KEYS.COMPANIONS);
      if (saved) {
        return normalizeStudioCompanions(JSON.parse(saved));
      }
    } catch {
      // ignore
    }
    return normalizeStudioCompanions();
  });

  const [selectedCompanionId, setSelectedCompanionId] = useState<string>(() => {
    return appStorage.getItem(STUDIO_STORAGE_KEYS.SELECTED_COMPANION_ID) || 'studio-feiyu';
  });

  const activeCompanion = useMemo(
    () => companions.find(c => c.id === selectedCompanionId) || companions[0],
    [companions, selectedCompanionId],
  );

  // Editing target in `人设与立绘设置` tab: 'ai' companion or 'user' host
  const [editingTargetRole, setEditingTargetRole] = useState<'ai' | 'user'>('ai');

  // Prompt Rules & Studio WorldBook Enablement State
  const [promptRules, setPromptRules] = useState<StudioPromptRulesConfig>(() => {
    try {
      const saved = appStorage.getItem(STUDIO_STORAGE_KEYS.PROMPT_RULES);
      if (saved) {
        return normalizeStudioPromptRules(JSON.parse(saved));
      }
    } catch {
      // ignore
    }
    return normalizeStudioPromptRules();
  });

  // Feature Toggles
  const [enableExpressions, setEnableExpressions] = useState<boolean>(() => {
    const saved = appStorage.getItem(STUDIO_STORAGE_KEYS.ENABLE_EXPRESSIONS);
    return saved === null ? true : saved === 'true';
  });

  const [enableEmotes, setEnableEmotes] = useState<boolean>(() => {
    const saved = appStorage.getItem(STUDIO_STORAGE_KEYS.ENABLE_EMOTES);
    return saved === null ? true : saved === 'true';
  });

  const [metaCardStyle, setMetaCardStyle] = useState<StudioMetaCardStyle>(() => {
    const saved = appStorage.getItem(STUDIO_STORAGE_KEYS.META_STYLE);
    if (saved === 'wide-feather' || saved === 'wide-split' || saved === 'wide-polaroid') {
      return saved;
    }
    return 'wide-feather';
  });

  const [isPoolBlindBox, setIsPoolBlindBox] = useState<boolean>(() => {
    return appStorage.getItem(STUDIO_STORAGE_KEYS.BLIND_POOL) === 'true';
  });

  const [isVoiceMuted, setIsVoiceMuted] = useState<boolean>(() => appStorage.getItem(STUDIO_STORAGE_KEYS.VOICE_MUTED) === 'true');
  useEffect(() => { appStorage.setItem(STUDIO_STORAGE_KEYS.VOICE_MUTED, String(isVoiceMuted)); }, [isVoiceMuted]);
  const [isSfxMuted, setIsSfxMuted] = useState<boolean>(() => appStorage.getItem(STUDIO_STORAGE_KEYS.SFX_MUTED) === 'true');
  useEffect(() => { appStorage.setItem(STUDIO_STORAGE_KEYS.SFX_MUTED, String(isSfxMuted)); }, [isSfxMuted]);
  const [bookends, setBookends] = useState<StudioBookends>(() => {
    try {
      return normalizeStudioBookends(JSON.parse(appStorage.getItem(STUDIO_STORAGE_KEYS.BOOKENDS) || 'null'));
    } catch {
      return normalizeStudioBookends();
    }
  });
  useEffect(() => {
    appStorage.setItem(STUDIO_STORAGE_KEYS.BOOKENDS, JSON.stringify(bookends));
  }, [bookends]);
  const [bubbleFontSize, setBubbleFontSize] = useState(() => {
    const saved = Number(appStorage.getItem(STUDIO_STORAGE_KEYS.BUBBLE_FONT_SIZE));
    return Number.isFinite(saved) && saved >= 12 && saved <= 38 ? saved : 17;
  });

  useEffect(() => {
    appStorage.setItem(STUDIO_STORAGE_KEYS.BUBBLE_FONT_SIZE, String(bubbleFontSize));
  }, [bubbleFontSize]);

  const [standeeScale, setStandeeScale] = useState(() => {
    const saved = Number(appStorage.getItem(STUDIO_STORAGE_KEYS.STANDEE_SCALE));
    return Number.isFinite(saved) && saved >= 0.65 && saved <= 2.4 ? saved : 1.15;
  });

  useEffect(() => {
    appStorage.setItem(STUDIO_STORAGE_KEYS.STANDEE_SCALE, String(standeeScale));
  }, [standeeScale]);

  const [showStageVisualPopover, setShowStageVisualPopover] = useState<boolean>(false);
  const [showFinaleOverview, setShowFinaleOverview] = useState<boolean>(false);
  const [finaleOverviewLayout, setFinaleOverviewLayout] = useState<'split' | 'tierlist' | 'posterwall'>('split');

  const [speechSpeed, setSpeechSpeed] = useState(() => {
    try {
      return normalizeStudioSpeechSpeed(appStorage.getItem(STUDIO_STORAGE_KEYS.SPEECH_SPEED));
    } catch {
      return normalizeStudioSpeechSpeed(null);
    }
  });
  useEffect(() => {
    try {
      appStorage.setItem(STUDIO_STORAGE_KEYS.SPEECH_SPEED, String(speechSpeed));
    } catch {
      // Playback speed still works if browser storage is unavailable.
    }
  }, [speechSpeed]);

  // Shared Global World Book State (synced with aiConfig.worldBookEntries)
  const worldBookEntries = useMemo(
    () => normalizeWorldBookEntries(aiConfig.worldBookEntries),
    [aiConfig.worldBookEntries],
  );
  const [selectedWbEntryId, setSelectedWbEntryId] = useState<string>('wb-d0-default');
  const [showNewWbForm, setShowNewWbForm] = useState<boolean>(false);
  const [newWbTitle, setNewWbTitle] = useState<string>('');
  const [newWbShortDesc, setNewWbShortDesc] = useState<string>('');
  const [newWbContent, setNewWbContent] = useState<string>('');
  const [newWbPlacement, setNewWbPlacement] = useState({ ...DEFAULT_PROMPT_PLACEMENT, scope: 'all' as const } as Pick<WorldBookEntry, 'position' | 'priority' | 'scope'>);

  const selectedWbEntry = useMemo(
    () => worldBookEntries.find(e => e.id === selectedWbEntryId) || worldBookEntries[0],
    [worldBookEntries, selectedWbEntryId],
  );

  // New Custom Expression Form State
  const [newExprName, setNewExprName] = useState<string>('');
  const [newExprUrl, setNewExprUrl] = useState<string>('');
  const [newExprNote, setNewExprNote] = useState<string>('');

  // Script Items State
  const [scriptItems, setScriptItems] = useState<StudioScriptItem[]>(() => {
    let savedScript: StudioScriptItem[] | undefined;
    try {
      const raw = appStorage.getItem(STUDIO_STORAGE_KEYS.SCRIPT);
      if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) savedScript = parsed.filter(item => item && typeof item.animeId === 'number' && typeof item.userText === 'string' && typeof item.aiRawText === 'string'); }
    } catch {
      // ignore
    }
    return buildInitialStudioScriptList(
      tiers,
      comments,
      savedScript,
      selectedCompanionId,
      gradingSystem,
    );
  });

  useEffect(() => {
    setScriptItems(prev =>
      buildInitialStudioScriptList(tiers, comments, prev, selectedCompanionId, gradingSystem),
    );
  }, [tiers, comments, gradingSystem, selectedCompanionId]);

  // Persist Studio Settings
  useEffect(() => {
    try {
      appStorage.setItem(STUDIO_STORAGE_KEYS.SCRIPT, JSON.stringify(scriptItems));
    } catch {
      // ignore quota
    }
  }, [scriptItems]);

  useEffect(() => {
    try {
      appStorage.setItem(STUDIO_STORAGE_KEYS.USER_CHAR, JSON.stringify(userChar));
    } catch {
      // ignore
    }
  }, [userChar]);

  useEffect(() => {
    try {
      appStorage.setItem(STUDIO_STORAGE_KEYS.COMPANIONS, JSON.stringify(companions));
      appStorage.setItem(STUDIO_STORAGE_KEYS.SELECTED_COMPANION_ID, selectedCompanionId);
    } catch {
      // ignore
    }
  }, [companions, selectedCompanionId]);

  useEffect(() => {
    try {
      appStorage.setItem(STUDIO_STORAGE_KEYS.PROMPT_RULES, JSON.stringify(promptRules));
    } catch {
      // ignore
    }
  }, [promptRules]);

  useEffect(() => {
    appStorage.setItem(STUDIO_STORAGE_KEYS.ENABLE_EXPRESSIONS, String(enableExpressions));
    appStorage.setItem(STUDIO_STORAGE_KEYS.ENABLE_EMOTES, String(enableEmotes));
    appStorage.setItem(STUDIO_STORAGE_KEYS.META_STYLE, metaCardStyle);
    appStorage.setItem(STUDIO_STORAGE_KEYS.BLIND_POOL, String(isPoolBlindBox));
  }, [enableExpressions, enableEmotes, metaCardStyle, isPoolBlindBox]);

  // AI Batch Generation State
  const [isGeneratingScript, setIsGeneratingScript] = useState<boolean>(false);
  const [generationStatus, setGenerationStatus] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const contextLoadingRef = useRef(false);
  const [contextStatus, setContextStatus] = useState<string | null>(null);
  const [contextById, setContextById] = useState<Map<number, AnimeItem>>(new Map());

  // Playback Steps & Director State
  const playbackSteps = useMemo(
    () =>
      buildPlaybackSteps(scriptItems, {
        enableExpressions,
        enableEmotes,
        bookends,
      }),
    [scriptItems, enableExpressions, enableEmotes, bookends],
  );

  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(false);
  const [hideDirectorHud, setHideDirectorHud] = useState<boolean>(false);
  useEffect(() => {
    setCurrentStepIndex(index => Math.min(index, playbackSteps.length - 1));
  }, [playbackSteps.length]);

  // Preload active script standee GIFs, covers, and user images first, then warm companion expression library
  useEffect(() => {
    let cancelled = false;
    const priorityUrls = new Set<string>();
    const addUrl = (url?: string) => {
      if (url && typeof url === 'string') priorityUrls.add(url);
    };

    addUrl(resolveCharacterStandeeUrl(userChar, 'default', enableExpressions));
    addUrl(resolveCharacterStandeeUrl(activeCompanion, '默认', enableExpressions));

    for (const step of playbackSteps) {
      addUrl(resolveCharacterStandeeUrl(userChar, step.userBubble.expression || 'default', enableExpressions));
      for (const cue of step.userBubble.cues || []) {
        addUrl(resolveCharacterStandeeUrl(userChar, cue.expression || 'default', enableExpressions));
      }
      addUrl(resolveCharacterStandeeUrl(activeCompanion, step.aiBubble.expression || '默认', enableExpressions));
      for (const cue of step.aiBubble.cues || []) {
        addUrl(resolveCharacterStandeeUrl(activeCompanion, cue.expression || '默认', enableExpressions));
      }
      if (step.activeWork?.anime.cover) addUrl(step.activeWork.anime.cover);
      if (step.userBubble.image) addUrl(step.userBubble.image);
    }

    const backgroundUrls = new Set<string>();
    for (const expr of userChar.customExpressions || []) {
      if (expr.url && !priorityUrls.has(expr.url)) backgroundUrls.add(expr.url);
    }
    for (const expr of activeCompanion.customExpressions || []) {
      if (expr.url && !priorityUrls.has(expr.url)) backgroundUrls.add(expr.url);
    }

    const runQueue = async (urls: string[], concurrency: number) => {
      let cursor = 0;
      const workers = Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
        while (!cancelled && cursor < urls.length) {
          const nextUrl = urls[cursor++];
          await warmStudioImageUrl(nextUrl);
        }
      });
      await Promise.all(workers);
    };

    void (async () => {
      await runQueue(Array.from(priorityUrls), 6);
      if (!cancelled && backgroundUrls.size > 0) {
        await runQueue(Array.from(backgroundUrls), 4);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [playbackSteps, userChar, activeCompanion, enableExpressions]);

  // Delayed Score Reveal State for Top-Right Meta Card
  const [scoreRevealedForWorkId, setScoreRevealedForWorkId] = useState<number | null>(null);

  const tierScrollContainerRef = useRef<HTMLDivElement>(null);
  const tierRowElementRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const poolPosterRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const activeTierPosterRef = useRef<HTMLDivElement>(null);
  const timelineStripRef = useRef<HTMLDivElement>(null);
  const timelineDragRef = useRef<{ isDown: boolean; startX: number; scrollLeft: number; moved: boolean }>({
    isDown: false,
    startX: 0,
    scrollLeft: 0,
    moved: false,
  });
  const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);
  const workMetaStyleMapRef = useRef<Map<number, StudioMetaCardStyle>>(new Map());
  const getWorkRandomMetaStyle = useCallback((animeId?: number | null): StudioMetaCardStyle => {
    if (!animeId) return metaCardStyle;
    const existing = workMetaStyleMapRef.current.get(animeId);
    if (existing) return existing;
    const recentStyles = Array.from(workMetaStyleMapRef.current.values()).slice(-2);
    const candidates =
      recentStyles.length === 2 && recentStyles[0] === recentStyles[1]
        ? META_CARD_STYLES.filter(style => style !== recentStyles[0])
        : META_CARD_STYLES;
    const picked = candidates[Math.floor(Math.random() * candidates.length)] || 'wide-feather';
    workMetaStyleMapRef.current.set(animeId, picked);
    return picked;
  }, [metaCardStyle]);
  const mutedRef = useRef(isVoiceMuted);
  mutedRef.current = isVoiceMuted;
  const sfxMutedRef = useRef(isSfxMuted);
  sfxMutedRef.current = isSfxMuted;
  const [entranceState, setEntranceState] = useState<{ step: StudioPlaybackStep | null; replay: number; phase: StudioEntrancePhase }>({ step: null, replay: 0, phase: 'focus' });
  const [entranceReplay, setEntranceReplay] = useState(0);
  const chimeStepRef = useRef<StudioPlaybackStep | null>(null);

  const currentStep = useMemo(() => {
    if (currentStepIndex < 0 || playbackSteps.length === 0) return null;
    return playbackSteps[Math.min(currentStepIndex, playbackSteps.length - 1)];
  }, [currentStepIndex, playbackSteps]);

  const currentEntryStep = useMemo(() => currentStep?.phase === 'work'
    ? playbackSteps.find(step => step.isWorkEntryStep && step.activeWork?.animeId === currentStep.activeWork?.animeId) || null
    : null, [currentStep, playbackSteps]);
  const entrancePhase: StudioEntrancePhase = currentEntryStep
    ? entranceState.step === currentEntryStep && entranceState.replay === entranceReplay ? entranceState.phase : currentStep?.isWorkEntryStep ? 'focus' : 'settled'
    : 'settled';
  const isEntryPending = Boolean(currentEntryStep && entrancePhase !== 'settled');
  const isTierCardHiddenForEntry = Boolean(
    currentEntryStep &&
      (entrancePhase === 'focus' || entrancePhase === 'commentary' || entrancePhase === 'flying'),
  );
  const handleEntrancePhase = useCallback((phase: StudioEntrancePhase) => {
    setEntranceState({ step: currentEntryStep, replay: entranceReplay, phase });
  }, [currentEntryStep, entranceReplay]);

  const activeTypingFullText = useMemo(() => {
    if (!currentStep) return '';
    if (currentStep.speaker === 'user') return currentStep.userBubble.text;
    return currentStep.aiBubble.text;
  }, [currentStep]);

  const [typingState, setTypingState] = useState<{ step: StudioPlaybackStep | null; count: number }>({ step: null, count: 0 });
  const typingProgressRef = useRef(typingState);
  const speechConfigRef = useRef({ speechSpeed, userChar, activeCompanion, isVoiceMuted });
  speechConfigRef.current = { speechSpeed, userChar, activeCompanion, isVoiceMuted };
  const typedCharCount = typingState.step === currentStep ? typingState.count : 0;
  const isTypingComplete = !currentStep || typedCharCount >= activeTypingFullText.length;
  const setTypedCharCount = useCallback((count: number) => {
    const nextState = { step: currentStep, count };
    typingProgressRef.current = nextState;
    setTypingState(nextState);
  }, [currentStep]);

  // Trigger Center Tier List Smooth Camera Track Scroll + Delayed Score Reveal on Step Change
  useEffect(() => {
    if (studioMode !== 'stage') return;

    if (!currentStep) {
      setTypedCharCount(0);
      setScoreRevealedForWorkId(null);
      if (tierScrollContainerRef.current) {
        tierScrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    setTypedCharCount(0);

    const activeEmote =
      currentStep.speaker === 'user'
        ? currentStep.userBubble.emote
        : currentStep.aiBubble.emote;
    if (activeEmote && activeEmote !== 'none') {
      playEmotePopSound(activeEmote, sfxMutedRef.current);
    }

  }, [currentStep, studioMode, entranceReplay]);

  useEffect(() => {
    if (studioMode !== 'stage' || !currentStep?.activeWork || isEntryPending) {
      setScoreRevealedForWorkId(null);
      chimeStepRef.current = null;
      return;
    }
    setScoreRevealedForWorkId(currentStep.activeWork.animeId);
    if (currentEntryStep && chimeStepRef.current !== currentEntryStep) {
      playScoreRevealChime(currentStep.activeWork.targetScore, sfxMutedRef.current);
      chimeStepRef.current = currentEntryStep;
    }
  }, [currentStep, currentEntryStep, studioMode, isEntryPending]);

  // Auto-center active work pill in the bottom director timeline strip
  useEffect(() => {
    if (studioMode !== 'stage' || !timelineStripRef.current) return;
    const strip = timelineStripRef.current;
    let activeSelector = '';
    if (showFinaleOverview) {
      activeSelector = '[data-testid="studio-timeline-finale-overview"]';
    } else if (currentStep?.phase === 'opening') {
      activeSelector = '[data-testid="studio-timeline-opening"]';
    } else if (currentStep?.phase === 'finale') {
      activeSelector = '[data-testid="studio-timeline-ending"]';
    } else if (currentStep && currentStep.workOrderIndex >= 0) {
      activeSelector = `[data-testid="studio-timeline-jump-${currentStep.workOrderIndex}"]`;
    }
    if (!activeSelector) return;
    const targetEl = strip.querySelector<HTMLElement>(activeSelector);
    if (!targetEl) return;
    const targetCenter = targetEl.offsetLeft + targetEl.offsetWidth / 2;
    const desiredScrollLeft = Math.max(0, targetCenter - strip.clientWidth / 2);
    strip.scrollTo({ left: desiredScrollLeft, behavior: 'smooth' });
  }, [studioMode, currentStep, showFinaleOverview]);

  // Smooth Camera Track Scrolling for Center Tier List
  useEffect(() => {
    if (studioMode !== 'stage' || !currentStep || !tierScrollContainerRef.current) return;
    const targetScore = currentStep.activeTargetScore;
    if (targetScore === null) {
      tierScrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const container = tierScrollContainerRef.current;
    const rowEl = tierRowElementRefs.current.get(String(targetScore));
    if (rowEl) {
      const containerRect = container.getBoundingClientRect();
      const rowRect = rowEl.getBoundingClientRect();
      const currentScroll = container.scrollTop;
      const offsetWithinContainer = rowRect.top - containerRect.top;
      const desiredScrollTop =
        currentScroll + offsetWithinContainer - containerRect.height / 2 + rowRect.height / 2;

      container.scrollTo({
        top: Math.max(0, desiredScrollTop),
        behavior: 'smooth',
      });
    }
  }, [currentStep, studioMode]);

  // One continuous clock: layout changes and React commits cannot restart each character's delay.
  useEffect(() => {
    if (studioMode !== 'stage' || !currentStep) return;
    const fullText = activeTypingFullText;
    if (!fullText) return;
    let frameId = 0;
    let previousTime = performance.now();
    let elapsed = 0;

    const tick = (now: number) => {
      const progress = typingProgressRef.current;
      if (progress.step !== currentStep || progress.count >= fullText.length) return;
      const config = speechConfigRef.current;
      elapsed += Math.min(80, now - previousTime) * config.speechSpeed;
      previousTime = now;
      let nextCount = progress.count;
      let activeChar = '';
      while (nextCount < fullText.length) {
        // Fast-forward inline effect tags (<big>, </big>, <shake>, etc.) in 0ms so typing stays smooth
        const remaining = fullText.slice(nextCount);
        const tagMatch = remaining.match(/^<\/?(?:big|shake|mask|whisper|大|抖|码|虚)>/i);
        if (tagMatch) {
          nextCount += tagMatch[0].length;
          continue;
        }
        const char = String.fromCodePoint(fullText.codePointAt(nextCount)!);
        const delay = getStudioCharacterDelay(char, 1);
        if (elapsed < delay) break;
        elapsed -= delay;
        activeChar = char;
        nextCount += char.length;
      }
      if (nextCount !== progress.count) {
        setTypedCharCount(nextCount);
        if (nextCount % 2 === 1 || /[！？!?]/.test(activeChar)) {
          const speaker = currentStep.speaker === 'user' ? config.userChar : config.activeCompanion;
          playCuteVoiceBlip({ preset: speaker.voicePreset, pitch: speaker.voicePitch, char: activeChar, charIndex: nextCount, muted: config.isVoiceMuted });
        }
      }
      if (nextCount < fullText.length) frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [
    studioMode,
    currentStep,
    activeTypingFullText,
    entranceReplay,
    setTypedCharCount,
  ]);

  // Auto-Play Timer
  const nextStep = playbackSteps[currentStepIndex + 1];
  // A short host line can hand over to the companion while the same cover is still moving.
  const canContinueDuringEntry = Boolean(currentStep?.phase === 'work' && nextStep?.phase === 'work'
    && currentStep.activeWork?.animeId === nextStep.activeWork?.animeId);
  useEffect(() => {
    if (studioMode !== 'stage' || !isAutoPlaying || !isTypingComplete || (isEntryPending && !canContinueDuringEntry)) return;
    if (currentStepIndex >= playbackSteps.length - 1) {
      setIsAutoPlaying(false);
      return;
    }

    const isSilentImageHostTurn = Boolean(
      currentStep?.speaker === 'user' && !activeTypingFullText && currentStep.userBubble.image,
    );
    const delayMs = isSilentImageHostTurn
      ? Math.round(1800 / speechSpeed)
      : getStudioTurnDelay(Boolean(playbackSteps[currentStepIndex + 1]?.isWorkEntryStep), speechSpeed);

    const timer = setTimeout(() => {
      setCurrentStepIndex(prev => Math.min(playbackSteps.length - 1, prev + 1));
    }, delayMs);

    return () => clearTimeout(timer);
  }, [studioMode, isAutoPlaying, isTypingComplete, isEntryPending, canContinueDuringEntry, currentStep, activeTypingFullText, currentStepIndex, playbackSteps, speechSpeed]);

  // Step Forward / Backward Handlers
  const handleStepForward = useCallback(() => {
    if (playbackSteps.length === 0) return;
    if (showFinaleOverview) return;
    if (!currentStep) {
      setEntranceReplay(prev => prev + 1);
      setCurrentStepIndex(0);
      return;
    }
    if (!isTypingComplete && typedCharCount < activeTypingFullText.length) {
      setTypedCharCount(activeTypingFullText.length);
      return;
    }
    if (isEntryPending && !canContinueDuringEntry) return;
    if (currentStepIndex >= playbackSteps.length - 1) {
      setShowFinaleOverview(true);
      return;
    }
    setCurrentStepIndex(prev => Math.min(playbackSteps.length - 1, prev + 1));
  }, [currentStep, isTypingComplete, isEntryPending, canContinueDuringEntry, typedCharCount, activeTypingFullText.length, playbackSteps.length, currentStepIndex, showFinaleOverview]);

  const handleStepBackward = useCallback(() => {
    setIsAutoPlaying(false);
    if (showFinaleOverview) {
      setShowFinaleOverview(false);
      return;
    }
    if (playbackSteps[currentStepIndex - 1]?.isWorkEntryStep) setEntranceReplay(prev => prev + 1);
    setCurrentStepIndex(prev => Math.max(-1, prev - 1));
  }, [playbackSteps, currentStepIndex, showFinaleOverview]);

  const handleResetToStandby = useCallback(() => {
    setIsAutoPlaying(false);
    setShowFinaleOverview(false);
    setEntranceReplay(prev => prev + 1);
    setCurrentStepIndex(-1);
  }, []);

  // Keyboard Shortcuts in Stage Mode
  useEffect(() => {
    if (studioMode !== 'stage') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        handleStepForward();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleStepForward();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleStepBackward();
      } else if (e.code === 'KeyP') {
        e.preventDefault();
        setIsAutoPlaying(prev => !prev);
      } else if (e.code === 'KeyH') {
        e.preventDefault();
        setHideDirectorHud(prev => !prev);
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        handleResetToStandby();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [studioMode, handleStepForward, handleStepBackward, handleResetToStandby]);

  // Helper to update shared AIConfig
  const updateSharedAiConfig = (patch: Partial<AIConfig>) => {
    const next = { ...aiConfig, ...patch };
    onAiConfigChange?.(next);
    try {
      appStorage.setItem('anime-tier-list-ai-config-v10', JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  // World Book Handlers (shared with main page!)
  const handleToggleStudioWorldBookEntry = (entryId: string) => {
    setPromptRules(prev => {
      const exists = prev.enabledWorldBookIds.includes(entryId);
      const nextIds = exists
        ? prev.enabledWorldBookIds.filter(id => id !== entryId)
        : [...prev.enabledWorldBookIds, entryId];
      return { ...prev, enabledWorldBookIds: nextIds };
    });
  };

  const handleUpdateSharedWorldBookEntry = (
    entryId: string,
    patch: Partial<WorldBookEntry>,
  ) => {
    const nextEntries = worldBookEntries.map(e =>
      e.id === entryId ? { ...e, ...patch } : e,
    );
    updateSharedAiConfig({ worldBookEntries: nextEntries });
  };

  const handleAddSharedWorldBookEntry = () => {
    if (!newWbTitle.trim() || !newWbContent.trim()) return;
    const newId = `wb-custom-${Date.now()}`;
    const newEntry: WorldBookEntry = {
      id: newId,
      title: newWbTitle.trim(),
      shortDesc: newWbShortDesc.trim() || newWbContent.trim().slice(0, 50),
      content: newWbContent.trim(),
      enabled: true,
      ...newWbPlacement,
    };
    updateSharedAiConfig({ worldBookEntries: [...worldBookEntries, newEntry] });
    setPromptRules(prev => ({
      ...prev,
      enabledWorldBookIds: [...prev.enabledWorldBookIds, newId],
    }));
    setSelectedWbEntryId(newId);
    setNewWbTitle('');
    setNewWbShortDesc('');
    setNewWbContent('');
    setShowNewWbForm(false);
  };

  const handleDeleteSharedWorldBookEntry = (entryId: string) => {
    const nextEntries = worldBookEntries.filter(e => e.id !== entryId);
    updateSharedAiConfig({ worldBookEntries: nextEntries });
    setPromptRules(prev => ({ ...prev, enabledWorldBookIds: prev.enabledWorldBookIds.filter(id => id !== entryId) }));
    setSelectedWbEntryId('wb-d0-default');
  };

  // Character & Custom Expression Handlers
  const editingCharacter = editingTargetRole === 'user' ? userChar : activeCompanion;

  const updateEditingCharacter = (patch: Partial<StudioCharacterConfig>) => {
    if (editingTargetRole === 'user') {
      setUserChar(prev => updateStudioCharacter(prev, patch));
    } else {
      setCompanions(prev =>
        prev.map(c => (c.id === activeCompanion.id ? updateStudioCharacter(c, patch) : c)),
      );
    }
  };

  const handleAddCustomExpression = () => {
    if (!newExprName.trim() || !newExprUrl.trim()) return;
    const cleanName = newExprName.trim().replace(/^\[|\]$/g, '');
    const nextExpr: StudioCustomExpression = {
      id: `expr-${Date.now()}`,
      name: cleanName,
      url: newExprUrl.trim(),
      note: newExprNote.trim(),
    };
    updateEditingCharacter({
      customExpressions: [...(editingCharacter.customExpressions || []), nextExpr],
    });
    setNewExprName('');
    setNewExprUrl('');
    setNewExprNote('');
  };

  const handleUpdateCustomExpression = (
    exprId: string,
    patch: Partial<StudioCustomExpression>,
  ) => {
    updateEditingCharacter({
      customExpressions: (editingCharacter.customExpressions || []).map(e =>
        e.id === exprId ? { ...e, ...patch, ...(patch.url !== undefined && patch.followDefaultAvatar === undefined ? { followDefaultAvatar: false } : {}) } : e,
      ),
    });
  };

  const handleDeleteCustomExpression = (exprId: string) => {
    updateEditingCharacter({
      customExpressions: (editingCharacter.customExpressions || []).filter(
        e => e.id !== exprId,
      ),
    });
  };

  // Script Workbench Handlers
  const handleShuffleScriptOrder = () => {
    setScriptItems(prev => {
      const shuffled = [...prev];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled.map((item, idx) => ({ ...item, orderIndex: idx }));
    });
    setCurrentStepIndex(0);
  };

  const handleMoveScriptOrder = (orderIdx: number, direction: -1 | 1) => {
    setScriptItems(prev => {
      const ordered = [...prev].sort((a, b) => a.orderIndex - b.orderIndex);
      const targetIdx = orderIdx + direction;
      if (targetIdx < 0 || targetIdx >= ordered.length) return prev;
      [ordered[orderIdx], ordered[targetIdx]] = [ordered[targetIdx], ordered[orderIdx]];
      return ordered.map((item, idx) => ({ ...item, orderIndex: idx }));
    });
  };

  const handleUpdateScriptItem = (animeId: number, patch: Partial<StudioScriptItem>) => {
    setScriptItems(prev =>
      prev.map(item => (item.animeId === animeId ? { ...item, ...patch } : item)),
    );
  };

  const handleAttachUserImageFile = async (animeId: number, file: File) => {
    const dataUrl = await compressImageFileToDataUrl(file, 1280, 1280, 0.85);
    if (dataUrl) {
      handleUpdateScriptItem(animeId, { userImage: dataUrl });
    }
  };

  const handleRegenerateLocalFallbackAll = (companionIdToUse = activeCompanion.id) => {
    setScriptItems(prev => {
      const ordered = [...prev].sort((a, b) => a.orderIndex - b.orderIndex);
      const previousWorks: Array<{ title: string; score: TierScore }> = [];
      return ordered.map((item, idx) => {
        const nextAiText = generateSmartFallbackStudioComment({
          anime: item.anime,
          targetScore: item.targetScore,
          userText: item.userText,
          companionId: companionIdToUse,
          previousWorks,
          gradingSystem,
        });
        previousWorks.push({ title: item.anime.title, score: item.targetScore });
        return {
          ...item,
          orderIndex: idx,
          aiRawText: nextAiText,
        };
      });
    });
  };

  const buildPromptForItems = useCallback((items: StudioScriptItem[]) => buildStudioTimelinePrompt({
    scriptItems: items,
    companion: activeCompanion,
    worldBookEntries,
    enabledWorldBookIds: promptRules.enabledWorldBookIds,
    gradingSystem,
    enableExpressions,
    enableEmotes,
    expressionRuleTemplate: promptRules.expressionRuleTemplate,
    timelineRuleTemplate: promptRules.timelineRuleTemplate,
    expressionRulePlacement: promptRules.expressionRulePlacement,
    timelineRulePlacement: promptRules.timelineRulePlacement,
    emoteRules: DEFAULT_CUSTOM_EMOTE_RULES,
    bookends,
  }), [activeCompanion, worldBookEntries, promptRules, gradingSystem, enableExpressions, enableEmotes, bookends]);

  const withContext = (items: StudioScriptItem[], context: Map<number, AnimeItem>) => items.map(item => ({
    ...item,
    anime: context.has(item.animeId)
      ? { ...item.anime, ...context.get(item.animeId), title: item.anime.title, cover: item.anime.cover }
      : item.anime,
  }));

  const fullTimelinePrompt = useMemo(
    () =>
      studioMode === 'prep' && prepSettingsTab === 'preview'
        ? buildPromptForItems(withContext(scriptItems, contextById))
        : '',
    [studioMode, prepSettingsTab, scriptItems, contextById, buildPromptForItems],
  );
  const enabledStudioWorldBooks = useMemo(
    () => getStudioWorldBookEntries(worldBookEntries, promptRules.enabledWorldBookIds),
    [worldBookEntries, promptRules.enabledWorldBookIds],
  );
  const [lastSentPrompt, setLastSentPrompt] = useState<{ text: string; titles: string[] } | null>(null);
  const [showLastSentPrompt, setShowLastSentPrompt] = useState(false);
  const displayedPrompt = showLastSentPrompt && lastSentPrompt ? lastSentPrompt.text : fullTimelinePrompt;
  const displayedWorldBookTitles = showLastSentPrompt && lastSentPrompt
    ? lastSentPrompt.titles : enabledStudioWorldBooks.map(entry => entry.title);

  const loadStudioContext = async (force = false) => {
    if (contextLoadingRef.current) return contextById;
    contextLoadingRef.current = true;
    setIsLoadingContext(true);
    const next = new Map(contextById);
    let completed = 0;
    try {
      for (let i = 0; i < scriptItems.length; i += 2) {
        await Promise.all(scriptItems.slice(i, i + 2).map(async item => {
          const enriched = await fetchBangumiDeepSubjectData(next.get(item.animeId) || item.anime, { force });
          next.set(item.animeId, enriched);
          setContextStatus(`补充角色介绍与网友评论：${++completed} / ${scriptItems.length}`);
        }));
      }
      setContextById(next);
      setScriptItems(current => withContext(current, next));
      if (onUpdateTiers && next.size > 0) {
        const nextTiers: TierMap = {};
        for (const [tierKey, list] of Object.entries(tiers)) {
          nextTiers[tierKey] = list.map(anime => next.get(anime.id) || anime);
        }
        onUpdateTiers(nextTiers);
      }
      setContextStatus(summarizeDiscussionData(scriptItems.map(item => next.get(item.animeId) || item.anime)));
      return next;
    } catch {
      setContextStatus('刷新未完成，已保留现有资料，请稍后重试。');
      return contextById;
    } finally {
      contextLoadingRef.current = false;
      setIsLoadingContext(false);
    }
  };

  // Batch Generate Timeline-Safe AI Script via API
  const handleGenerateAiTimelineScript = async () => {
    if (isGeneratingScript || contextLoadingRef.current || scriptItems.length === 0) return;
    setIsGeneratingScript(true);
    setGenerationStatus(`正在让 ${activeCompanion.name} 按出场顺位撰写台本...`);

    try {
      const context = await loadStudioContext();
      const prompt = buildPromptForItems(withContext(scriptItems, context));
      setLastSentPrompt({ text: prompt, titles: enabledStudioWorldBooks.map(entry => entry.title) });
      const response = await requestAiStream(aiConfig, prompt);

      if (!response.ok || !response.body) {
        setGenerationStatus('AI 生成失败，请检查连接和模型设置后重试。已有台本已保留。');
        setTimeout(() => setGenerationStatus(null), 3000);
        setIsGeneratingScript(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let streamBuffer = '';
      let lastProgressUpdate = 0;

      while (true) {
        const { done, value } = await reader.read();
        streamBuffer += decoder.decode(value, { stream: !done });
        const lines = streamBuffer.split(/\r?\n/);
        streamBuffer = done ? '' : lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(dataStr);
            const delta =
              parsed.text ||
              parsed.choices?.[0]?.delta?.content ||
              parsed.candidates?.[0]?.content?.parts?.[0]?.text ||
              '';
            if (delta) {
              accumulated += delta;
            }
          } catch {
            // Ignore keep-alives or non-JSON events. Incomplete lines stay in streamBuffer.
          }
        }
        if (done) break;

        if (performance.now() - lastProgressUpdate < 150) continue;
        lastProgressUpdate = performance.now();
        // Persist only completed blocks while streaming. A partial next marker is not dialogue.
        const lastMarker = accumulated.lastIndexOf('<<<');
        const partialMap = parseStudioAiScriptResponse(lastMarker > 0 ? accumulated.slice(0, lastMarker) : '');
        if (partialMap.size > 0) {
          setGenerationStatus(
            `已生成 ${partialMap.size} / ${scriptItems.length} 部作品的台本...`,
          );
          setScriptItems(prev =>
            prev.map(item =>
              partialMap.has(item.animeId)
                ? { ...item, aiRawText: partialMap.get(item.animeId)! }
                : item,
            ),
          );
        }
      }

      const finalMap = parseStudioAiScriptResponse(accumulated);
      const generatedBookends = parseStudioBookendResponse(accumulated);
      setBookends(prev => {
        const next = { ...prev };
        for (const key of ['opening', 'ending'] as const) {
          if (prev[key].enabled && prev[key].generateAi && generatedBookends[key]) {
            next[key] = { ...prev[key], aiRawText: generatedBookends[key]! };
          }
        }
        return next;
      });
      if (finalMap.size > 0) {
        setScriptItems(prev =>
          prev.map(item =>
            finalMap.has(item.animeId)
              ? { ...item, aiRawText: finalMap.get(item.animeId)! }
              : item,
          ),
        );
        const generatedSceneCount = (['opening', 'ending'] as const).filter(key => bookends[key].enabled && bookends[key].generateAi && generatedBookends[key]).length;
        const expectedSceneCount = (['opening', 'ending'] as const).filter(key => bookends[key].enabled && bookends[key].generateAi).length;
        setGenerationStatus(`已生成 ${finalMap.size} 部作品台本、${generatedSceneCount} 段开场/收尾${generatedSceneCount < expectedSceneCount ? '；未返回的开场或收尾保留原文' : ''}`);
      } else {
        setGenerationStatus('未收到可用的作品台本，请检查 Prompt 输出格式后重试。已有作品台本已保留。');
      }
      setTimeout(() => setGenerationStatus(null), 3500);
    } catch (error) {
      setGenerationStatus(error instanceof Error ? `${error.message} 已有台本已保留。` : '生成中断，已收到的内容已保留；请检查连接后重试。');
    } finally {
      setIsGeneratingScript(false);
    }
  };

  // Stage Computed Data
  const stageTiersMap = useMemo(() => {
    if (!currentStep) {
      const empty: TierMap = {};
      for (const s of ALL_TIER_SCORES) empty[String(s)] = [];
      return empty;
    }
    return currentStep.rankedByTierSoFar;
  }, [currentStep]);

  const stageRemainingPool = useMemo(() => {
    if (!currentStep) {
      return [...scriptItems]
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map(s => s.anime);
    }
    return isEntryPending && currentStep.activeWork
      ? [currentStep.activeWork.anime, ...currentStep.remainingPool]
      : currentStep.remainingPool;
  }, [currentStep, scriptItems, isEntryPending]);

  const orderedScriptItems = useMemo(
    () => [...scriptItems].sort((a, b) => a.orderIndex - b.orderIndex),
    [scriptItems],
  );

  const stageVisibleTiers = useMemo<TierScore[]>(() => {
    const baseTiers =
      gradingSystem === 'letter' ? LETTER_DEFAULT_VISIBLE_TIERS : DEFAULT_VISIBLE_TIERS;
    const scoreSet = new Set<TierScore>([...baseTiers, ...visibleTiers]);
    for (const item of scriptItems) {
      scoreSet.add(item.targetScore);
    }
    return ALL_TIER_SCORES.filter(s => scoreSet.has(s));
  }, [gradingSystem, visibleTiers, scriptItems]);

  // ============================================================================
  // RENDER: 16:9 LIVE RECORDING STAGE
  // ============================================================================
  if (studioMode === 'stage') {
    const isUserSpeaking = currentStep?.speaker === 'user' && currentStep.userBubble.visible;
    const isAiSpeaking = currentStep?.speaker === 'ai' && currentStep.aiBubble.visible;

    const userDisplayText = currentStep?.userBubble.visible
      ? isUserSpeaking
        ? currentStep.userBubble.text.slice(0, typedCharCount)
        : currentStep.userBubble.text
      : '';

    const aiDisplayText = currentStep?.aiBubble.visible
      ? isAiSpeaking
        ? currentStep.aiBubble.text.slice(0, typedCharCount)
        : currentStep.aiBubble.text
      : '';

    const userActiveCue = resolveBubbleActiveCue(
      currentStep?.userBubble,
      typedCharCount,
      Boolean(isUserSpeaking),
    );
    const aiActiveCue = resolveBubbleActiveCue(
      currentStep?.aiBubble,
      typedCharCount,
      Boolean(isAiSpeaking),
    );

    const userStandeeSrc = resolveCharacterStandeeUrl(
      userChar,
      userActiveCue.expression || 'default',
      enableExpressions,
    );
    const aiStandeeSrc = resolveCharacterStandeeUrl(
      activeCompanion,
      aiActiveCue.expression || '默认',
      enableExpressions,
    );
    const isUserGifStandee = isAnimatedGifStandee(userStandeeSrc);
    const isAiGifStandee = isAnimatedGifStandee(aiStandeeSrc);

    const isScoreRevealedOnMetaCard = Boolean(
      !isEntryPending && currentStep?.activeWork &&
        scoreRevealedForWorkId === currentStep.activeWork.animeId,
    );

    return (
      <div
        data-testid="recording-studio-stage"
        data-entrance-phase={entrancePhase}
        data-scene={currentStep?.phase || 'standby'}
        className="relative z-20 w-screen h-screen overflow-hidden flex flex-col select-none"
      >
        {/* Global SVG Filter for Hand-Drawn Boiling Line Effect (沸腾线条效果) */}
        <svg className="fixed w-0 h-0 pointer-events-none" aria-hidden="true">
          <defs>
            <filter id="hand-drawn-boil" x="-8%" y="-8%" width="116%" height="116%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.025"
                numOctaves="2"
                result="noise"
                seed="1"
              >
                <animate
                  attributeName="seed"
                  values="1;2;3;4;1"
                  dur="0.48s"
                  repeatCount="indefinite"
                  calcMode="discrete"
                />
              </feTurbulence>
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale="2.4"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>
        </svg>

        {/* Top Studio Bar (Hidden when `hideDirectorHud` is true) */}
        {!hideDirectorHud && (
          <header className="relative z-40 h-12 px-5 flex items-center justify-between bg-black/50 backdrop-blur-md border-b border-white/[0.08] shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                data-testid="studio-exit-to-board-btn"
                onClick={onExitStudio}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.07] hover:bg-white/[0.14] border border-white/[0.1] text-xs font-semibold text-white transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>返回排榜主页</span>
              </button>

              <div className="inline-flex items-center rounded-full bg-white/[0.06] border border-white/[0.1] p-0.5">
                <button
                  type="button"
                  data-testid="studio-switch-to-prep-btn"
                  onClick={() => {
                    setIsAutoPlaying(false);
                    setStudioMode('prep');
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-semibold text-white/75 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>1. 台本与角色设置 ({scriptItems.length}部)</span>
                </button>
                <button
                  type="button"
                  data-testid="studio-switch-to-stage-btn"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-white text-zinc-950 text-xs font-bold shadow-xs cursor-pointer"
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>2. 16:9 录屏演播舞台</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Secondary Draggable Slider Popover for Standee Scale & Bubble Font Size */}
              <div className="relative">
                <button
                  type="button"
                  data-testid="studio-stage-visual-popover-btn"
                  onClick={() => setShowStageVisualPopover(prev => !prev)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-medium transition-colors cursor-pointer ${
                    showStageVisualPopover
                      ? 'bg-white text-zinc-950 border-white font-semibold'
                      : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/[0.1] text-white/85'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>
                    立绘 {standeeScale.toFixed(2)}x · 字号 {bubbleFontSize}px
                  </span>
                </button>

                {showStageVisualPopover && (
                  <div
                    data-testid="studio-stage-visual-popover"
                    className="absolute right-0 top-full mt-2 w-72 p-4 rounded-2xl bg-zinc-950/95 border border-white/15 shadow-2xl backdrop-blur-xl z-50 space-y-3.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">舞台立绘与气泡调节</span>
                      <button
                        type="button"
                        onClick={() => {
                          setStandeeScale(1.15);
                          setBubbleFontSize(17);
                        }}
                        className="text-[10.5px] text-white/55 hover:text-white cursor-pointer"
                      >
                        重置默认
                      </button>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-white/70">立绘大小</span>
                        <span className="font-mono font-bold text-white">{standeeScale.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        aria-label="舞台立绘大小"
                        data-testid="studio-stage-standee-scale-slider"
                        min="0.75"
                        max="2.2"
                        step="0.05"
                        value={standeeScale}
                        onChange={e => setStandeeScale(Number(e.target.value))}
                        className="w-full accent-white cursor-pointer"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-white/70">气泡字号</span>
                        <span className="font-mono font-bold text-white">{bubbleFontSize}px</span>
                      </div>
                      <input
                        type="range"
                        aria-label="舞台气泡字号"
                        data-testid="studio-stage-bubble-font-slider"
                        min="12"
                        max="36"
                        step="0.5"
                        value={bubbleFontSize}
                        onChange={e => setBubbleFontSize(Number(e.target.value))}
                        className="w-full accent-white cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                data-testid="studio-toggle-pool-blind-btn"
                onClick={() => setIsPoolBlindBox(prev => !prev)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-medium transition-colors cursor-pointer ${
                  isPoolBlindBox
                    ? 'bg-white text-zinc-950 border-white font-semibold'
                    : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/[0.1] text-white/85'
                }`}
              >
                {isPoolBlindBox ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>候选池: 盲盒模糊</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    <span>候选池: 明牌展示</span>
                  </>
                )}
              </button>

              <button
                type="button"
                data-testid="studio-toggle-mute-btn"
                onClick={() => setIsVoiceMuted(prev => !prev)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-medium transition-colors cursor-pointer ${
                  isVoiceMuted
                    ? 'bg-white/[0.04] border-white/[0.08] text-white/45'
                    : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/[0.1] text-white/85'
                }`}
              >
                {isVoiceMuted ? (
                  <>
                    <VolumeX className="w-3.5 h-3.5" />
                    <span>嘴替音静音</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>嘴替音开启</span>
                  </>
                )}
              </button>

              <button
                type="button"
                data-testid="studio-toggle-sfx-mute-btn"
                onClick={() => setIsSfxMuted(prev => !prev)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-medium transition-colors cursor-pointer ${
                  isSfxMuted
                    ? 'bg-white/[0.04] border-white/[0.08] text-white/45'
                    : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/[0.1] text-white/85'
                }`}
                title="开启或关闭作品落榜提示音（高分/普通/低分区分）与漫符弹出音效"
              >
                <Music className="w-3.5 h-3.5" />
                <span>{isSfxMuted ? '舞台音效静音' : '舞台音效开启'}</span>
              </button>

              <button
                type="button"
                data-testid="studio-hide-hud-btn"
                onClick={() => setHideDirectorHud(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.08] hover:bg-white/[0.16] border border-white/[0.14] text-[11px] font-semibold text-white cursor-pointer"
                title="隐藏顶栏与底栏 (按 H 键恢复显示)"
              >
                <EyeOff className="w-3.5 h-3.5" />
                <span>隐藏导播栏 (H)</span>
              </button>
            </div>
          </header>
        )}

        {showFinaleOverview ? (
          <div
            data-testid="studio-finale-overview-stage"
            className="flex-1 min-h-0 w-full flex flex-col px-6 py-4 gap-3 overflow-hidden"
          >
            {/* Finale Showcase Header & View Mode Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-black/45 border border-white/[0.1] backdrop-blur-xl shrink-0">
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-0.5 rounded-full bg-white text-zinc-950 text-[10px] font-black tracking-widest uppercase">
                  FINALE SHOWCASE
                </span>
                <h2 className="text-lg sm:text-xl font-black tracking-tight text-white">
                  {boardTitle} · 全榜总览与视觉海报墙（共 {orderedScriptItems.length} 部）
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <div className="inline-flex items-center rounded-full bg-white/[0.06] border border-white/[0.1] p-0.5 text-xs">
                  <button
                    type="button"
                    data-testid="studio-finale-layout-split"
                    onClick={() => setFinaleOverviewLayout('split')}
                    className={`px-3 py-1 rounded-full font-bold transition-colors cursor-pointer ${
                      finaleOverviewLayout === 'split'
                        ? 'bg-white text-zinc-950'
                        : 'text-white/70 hover:text-white'
                    }`}
                  >
                    同屏双拼：全榜 + 海报墙
                  </button>
                  <button
                    type="button"
                    data-testid="studio-finale-layout-tierlist"
                    onClick={() => setFinaleOverviewLayout('tierlist')}
                    className={`px-3 py-1 rounded-full font-bold transition-colors cursor-pointer ${
                      finaleOverviewLayout === 'tierlist'
                        ? 'bg-white text-zinc-950'
                        : 'text-white/70 hover:text-white'
                    }`}
                  >
                    全屏完整 Tier 榜
                  </button>
                  <button
                    type="button"
                    data-testid="studio-finale-layout-posterwall"
                    onClick={() => setFinaleOverviewLayout('posterwall')}
                    className={`px-3 py-1 rounded-full font-bold transition-colors cursor-pointer ${
                      finaleOverviewLayout === 'posterwall'
                        ? 'bg-white text-zinc-950'
                        : 'text-white/70 hover:text-white'
                    }`}
                  >
                    全屏海报墙
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowFinaleOverview(false)}
                  className="px-3 py-1 rounded-full bg-white/[0.08] hover:bg-white/[0.16] border border-white/[0.14] text-xs font-semibold text-white cursor-pointer"
                >
                  返回演播舞台
                </button>
              </div>
            </div>

            {/* Finale Dual / Full Panels */}
            <div className="flex-1 min-h-0 grid grid-cols-12 gap-4 overflow-hidden">
              {(finaleOverviewLayout === 'split' || finaleOverviewLayout === 'tierlist') && (
                <section
                  data-testid="studio-finale-tierlist-panel"
                  className={`${
                    finaleOverviewLayout === 'split' ? 'col-span-6' : 'col-span-12'
                  } h-full min-h-0 rounded-[24px] bg-[#0a0b10]/85 border border-white/[0.09] p-4 flex flex-col overflow-hidden`}
                >
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/[0.07] shrink-0">
                    <div>
                      <p className="text-[10px] font-mono tracking-[0.2em] uppercase text-white/40">
                        COMPLETE TIER LIST ARCHIVE
                      </p>
                      <h3 className="text-base font-black text-white">{boardTitle}</h3>
                    </div>
                    <span className="text-[11px] font-mono text-white/45">
                      github.com/ikemenrourou/BGM-AniTier
                    </span>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-3 pr-1">
                    {stageVisibleTiers
                      .filter(score => (tiers[String(score)] || []).length > 0)
                      .map(score => (
                        <TierRow
                          key={`finale-tier-${score}`}
                          score={score}
                          gradingSystem={gradingSystem}
                          items={tiers[String(score)] || []}
                          showTitles={showTitles}
                          tierRowStyle={tierRowStyle}
                          tierRowOpacity={tierRowOpacity}
                          highlightedTag={null}
                          commentedAnimeIds={new Set()}
                          readOnlyStage={true}
                          onAddClick={() => {}}
                          onSelectAnimeDetail={() => {}}
                          onOpenCommentModal={() => {}}
                          onRemoveAnime={() => {}}
                          onMoveAnime={() => {}}
                        />
                      ))}
                  </div>
                </section>
              )}

              {(finaleOverviewLayout === 'split' || finaleOverviewLayout === 'posterwall') && (
                <section
                  data-testid="studio-finale-posterwall-panel"
                  className={`${
                    finaleOverviewLayout === 'split' ? 'col-span-6' : 'col-span-12'
                  } h-full min-h-0 rounded-[24px] bg-[#0a0b10]/85 border border-white/[0.09] p-4 flex flex-col overflow-hidden`}
                >
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/[0.07] shrink-0">
                    <div>
                      <p className="text-[10px] font-mono tracking-[0.2em] uppercase text-white/40">
                        VISUAL POSTER WALL COLLAGE
                      </p>
                      <h3 className="text-base font-black text-white">视觉档案海报墙</h3>
                    </div>
                    <span className="text-[11px] font-mono text-white/45">
                      TOTAL {orderedScriptItems.length} WORKS
                    </span>
                  </div>
                  <div
                    className={`flex-1 min-h-0 overflow-y-auto no-scrollbar grid ${
                      finaleOverviewLayout === 'split'
                        ? 'grid-cols-2 xl:grid-cols-3'
                        : 'grid-cols-3 lg:grid-cols-5 xl:grid-cols-6'
                    } gap-3 content-start pr-1`}
                  >
                    {[...orderedScriptItems]
                      .sort((a, b) => b.targetScore - a.targetScore)
                      .map(item => (
                        <TopRightMetaSpotlightCard
                          key={`finale-poster-${item.animeId}`}
                          work={item}
                          scoreRevealed={true}
                          styleVariant={getWorkRandomMetaStyle(item.animeId)}
                          gradingSystem={gradingSystem}
                        />
                      ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        ) : (
        /* ====================================================================
            MAIN 16:9 THREE-COLUMN STAGE (Matches User's Sketch & Standee Layout)
            Left: Free-Standing Character Standees (立绘) + Hand-Drawn Boiling Bubble (手绘+手账风沸腾线条气泡框)
            Center: Top/Bottom Masked Auto-Camera Tier List + Fly-In & Active Card Spotlight
            Right: Top-Right Poster-Wall-Style Meta Card + Compact Candidate Pool
           ==================================================================== */
        <div className="flex-1 min-h-0 w-full grid grid-cols-12 gap-4 px-5 py-3 overflow-hidden">
          {/* ==================================================================
              LEFT COLUMN (col-span-3): FREE-STANDING STANDEES + HAND-DRAWN BUBBLES
              (Zero rectangular wrapper boxes around the characters!)
             ================================================================== */}
          <aside
            data-testid="studio-left-rpg-theater"
            style={{ '--studio-standee-scale': standeeScale } as React.CSSProperties}
            className={`studio-theater relative isolate z-20 col-span-3 h-full min-h-0 flex flex-col gap-3 py-2 ${currentStep?.userBubble.image ? 'studio-theater--with-image' : ''}`}
          >
            {currentStep?.userBubble.image && (
              <div className="studio-scene-image-position pointer-events-none" data-testid="studio-left-scene-image">
                <StudioSceneImage
                  key={`${currentStep.workOrderIndex}-${currentStep.userBubble.image}`}
                  src={currentStep.userBubble.image}
                  effect={currentStep.userBubble.imageEffect}
                  title={currentStep.activeWork?.anime.title || '本段配图'}
                />
              </div>
            )}
            {/* 1. UPPER STAGE: UP主 Free-Standing Standee (Left) + Hand-Drawn Boiling Bubble (Right) */}
            <div
              data-testid="studio-user-rpg-slot"
              className="studio-character-slot flex-1 min-h-0 flex flex-col justify-center"
            >
              {/* Left Free-Standing Standee (立绘) */}
              <div className="studio-character-portrait relative shrink-0 flex flex-col items-center justify-end">
                <div
                  className={`studio-character-art relative flex items-end justify-center transition-all duration-300 ${
                    isUserSpeaking
                      ? `${isUserGifStandee ? '' : 'standee-speaking '}scale-105 opacity-100 drop-shadow-[0_14px_24px_rgba(0,0,0,0.65)]`
                      : 'scale-100 opacity-100 drop-shadow-[0_10px_18px_rgba(0,0,0,0.55)]'
                  }`}
                >
                  <img
                    src={userStandeeSrc}
                    alt={userChar.name}
                    referrerPolicy="no-referrer"
                    className="max-w-full max-h-full object-contain select-none"
                  />
                  {enableEmotes && currentStep?.userBubble.visible && (
                    <ComicEmoteOverlay emote={userActiveCue.emote} side="left" />
                  )}
                </div>
                <span className="mt-1 px-2.5 py-0.5 rounded-full bg-black/55 border border-white/15 text-[11px] font-bold text-white/90 tracking-wide">
                  {userChar.name}
                </span>
              </div>

              {/* Right Hand-Drawn Boiling Line Speech Bubble (Matches `image_8d223ecf.png`) */}
              <div className="studio-character-bubble min-w-0">
                {currentStep?.userBubble.visible ? (
                  <StudioDialogueBubble
                    key={`user-bubble-${currentStep.workOrderIndex}-${currentStep.stepIndex}`}
                    text={userDisplayText}
                    fontSize={bubbleFontSize}
                    isSpeakingNow={Boolean(isUserSpeaking)}
                    isTypingComplete={isTypingComplete}
                    testId="studio-user-bubble-text"
                  />
                ) : null}
              </div>
            </div>

            {/* 2. LOWER STAGE: AI Companion Free-Standing Standee (Left) + Hand-Drawn Boiling Bubble (Right) */}
            <div
              data-testid="studio-ai-rpg-slot"
              className="studio-character-slot flex-1 min-h-0 flex flex-col justify-center"
            >
              {/* Left Free-Standing Standee (立绘, e.g. 大肥鱼 GIFs) */}
              <div className="studio-character-portrait relative shrink-0 flex flex-col items-center justify-end">
                <div
                  className={`studio-character-art relative flex items-end justify-center transition-all duration-300 ${
                    isAiSpeaking
                      ? `${isAiGifStandee ? '' : 'standee-speaking '}scale-105 opacity-100 drop-shadow-[0_14px_24px_rgba(0,0,0,0.65)]`
                      : 'scale-100 opacity-100 drop-shadow-[0_10px_18px_rgba(0,0,0,0.55)]'
                  }`}
                >
                  <img
                    src={aiStandeeSrc}
                    alt={activeCompanion.name}
                    referrerPolicy="no-referrer"
                    className="max-w-full max-h-full object-contain select-none"
                  />
                  {enableEmotes && currentStep?.aiBubble.visible && (
                    <ComicEmoteOverlay emote={aiActiveCue.emote} side="left" />
                  )}
                </div>
                <span className="mt-1 px-2.5 py-0.5 rounded-full bg-black/55 border border-white/15 text-[11px] font-bold text-white/90 tracking-wide truncate max-w-[122px]">
                  {activeCompanion.name}
                </span>
              </div>

              {/* Right Hand-Drawn Boiling Line Speech Bubble (Zero artificial tag pills inside!) */}
              <div className="studio-character-bubble min-w-0">
                {currentStep?.aiBubble.visible ? (
                  <StudioDialogueBubble
                    key={`ai-bubble-${currentStep.workOrderIndex}-${currentStep.aiBubble.segmentIndex}`}
                    text={aiDisplayText}
                    fontSize={bubbleFontSize}
                    isSpeakingNow={Boolean(isAiSpeaking)}
                    isTypingComplete={isTypingComplete}
                    testId="studio-ai-bubble-text"
                  />
                ) : null}
              </div>
            </div>
          </aside>

          {/* ==================================================================
              CENTER COLUMN (col-span-6): MASKED AUTO-CAMERA TIER TRACK + FLY-IN & SPOTLIGHT
             ================================================================== */}
          <main className="col-span-6 h-full min-h-0 flex flex-col">
            <div className="flex items-center justify-between px-2 pb-2 shrink-0">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                {boardTitle}
              </h1>
              <div className="flex items-center gap-2 text-xs font-mono text-white/55">
                <span>
                  已揭晓{' '}
                  <strong className="text-white">
                    {currentStep
                      ? Math.min(scriptItems.length, currentStep.workOrderIndex + (isEntryPending ? 0 : 1))
                      : 0}
                  </strong>{' '}
                  / {scriptItems.length} 部
                </span>
              </div>
            </div>

            <div
              ref={tierScrollContainerRef}
              data-testid="studio-center-tier-track"
              className="flex-1 min-h-0 overflow-y-auto no-scrollbar py-12 px-7 space-y-5 scroll-smooth"
              style={{
                maskImage:
                  'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.65) 5%, rgba(0,0,0,1) 11%, rgba(0,0,0,1) 89%, rgba(0,0,0,0.65) 95%, transparent 100%)',
                WebkitMaskImage:
                  'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.65) 5%, rgba(0,0,0,1) 11%, rgba(0,0,0,1) 89%, rgba(0,0,0,0.65) 95%, transparent 100%)',
              }}
            >
              {stageVisibleTiers.map(score => {
                const items = stageTiersMap[String(score)] || [];
                const isTargetRow = currentStep?.activeTargetScore === score && !['focus', 'commentary'].includes(entrancePhase);
                return (
                  <div
                    key={score}
                    ref={el => {
                      if (el) tierRowElementRefs.current.set(String(score), el);
                    }}
                    data-testid={`studio-tier-wrapper-${score}`}
                    data-active-focus={isTargetRow ? 'true' : 'false'}
                    className={`transition-all duration-500 rounded-[26px] ${
                      isTargetRow
                        ? 'ring-1 ring-inset ring-white/20'
                        : 'opacity-90'
                    }`}
                  >
                    <TierRow
                      score={score}
                      gradingSystem={gradingSystem}
                      items={items}
                      showTitles={showTitles}
                      tierRowStyle={tierRowStyle}
                      tierRowOpacity={tierRowOpacity}
                      highlightedTag={null}
                      commentedAnimeIds={new Set()}
                      readOnlyStage={true}
                      activeStageAnimeId={currentStep?.activeWork?.animeId || null}
                      stageEntryPending={isTierCardHiddenForEntry}
                      activeStagePosterRef={activeTierPosterRef}
                      onAddClick={() => {}}
                      onSelectAnimeDetail={() => {}}
                      onOpenCommentModal={() => {}}
                      onRemoveAnime={() => {}}
                      onMoveAnime={() => {}}
                    />
                  </div>
                );
              })}
            </div>
          </main>

          {/* ==================================================================
              RIGHT COLUMN (col-span-3): TOP-RIGHT POSTER CARD + COMPACT CANDIDATE POOL
             ================================================================== */}
          <aside className="col-span-3 h-full min-h-0 flex flex-col gap-3 py-1">
            {/* 1. TOP-RIGHT: Persistent Poster-Wall Horizontal Card (with Delayed Score Reveal & Random Per-Work Style!) */}
            <div className="shrink-0">
              {currentStep && currentStep.phase !== 'work' ? (
                <div data-testid="studio-bookend-title" className="px-5 py-6 rounded-2xl bg-white/[0.04] border border-white/10">
                  <p className="text-xl font-bold text-white">{currentStep.phase === 'opening' ? '开场聊聊' : '本期收尾'}</p>
                  <p className="text-sm text-white/55 mt-2">{currentStep.phase === 'opening' ? '先说说规则，再一起看榜。' : `${scriptItems.length} 部作品全部落位，聊聊这张榜。`}</p>
                </div>
              ) : (
              <TopRightMetaSpotlightCard
                work={currentStep?.activeWork || null}
                scoreRevealed={isScoreRevealedOnMetaCard}
                styleVariant={getWorkRandomMetaStyle(currentStep?.activeWork?.animeId)}
                gradingSystem={gradingSystem}
              />
              )}
            </div>

            {/* 2. BOTTOM-RIGHT: Compact Candidate Pool (4-Column Thumbnail Grid) */}
            <div
              data-testid="studio-candidate-pool"
              className="flex-1 min-h-0 rounded-[22px] bg-[#121217]/85 border border-white/[0.08] backdrop-blur-xl p-3.5 flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-white/[0.07] shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold text-white tracking-wide">
                    待排候选池
                  </span>
                  <span
                    data-testid="studio-candidate-pool-count"
                    className="px-2 py-0.5 rounded-full bg-white/[0.08] text-[10.5px] font-mono font-bold text-white/85"
                  >
                    {stageRemainingPool.length} 部
                  </span>
                </div>
                <span className="text-[10px] font-mono text-white/40">
                  {isPoolBlindBox ? 'BLIND BOX' : 'UP NEXT'}
                </span>
              </div>

              {stageRemainingPool.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                  <div className="w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white mb-2">
                    <Check className="w-4 h-4" />
                  </div>
                  <p className="text-xs font-bold text-white/80">全部候选作品已揭晓完毕</p>
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar grid grid-cols-4 gap-2 content-start pr-0.5">
                  {stageRemainingPool.map((anime, idx) => {
                    const isNextUp = idx === 0;
                    const isEntering = isEntryPending && anime.id === currentStep?.activeWork?.animeId;
                    return (
                      <div
                        key={anime.id}
                        data-testid={`studio-pool-card-${anime.id}`}
                        className={`group relative flex flex-col transition-opacity duration-300 ${
                          isEntering ? 'z-10 opacity-0' : isEntryPending ? 'opacity-35' : isNextUp ? 'z-10' : 'opacity-85 hover:opacity-100'
                        }`}
                      >
                        <div
                          ref={element => {
                            if (element) poolPosterRefs.current.set(anime.id, element);
                            else poolPosterRefs.current.delete(anime.id);
                          }}
                          className={`studio-pool-poster relative w-full aspect-[3/4] rounded-[9px] overflow-hidden bg-zinc-900 ${isNextUp ? 'studio-pool-poster--next' : ''}`}
                        >
                          <img
                            src={anime.cover}
                            alt={anime.title}
                            referrerPolicy="no-referrer"
                            className={`w-full h-full object-cover transition-all duration-500 ${
                              isPoolBlindBox && !isNextUp ? 'blur-[4px] scale-110 brightness-90' : ''
                            }`}
                          />
                          {isNextUp && (
                            <span data-testid="studio-next-label" className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-[#272219]/90 text-[8px] font-bold text-[#e8ca8a] tracking-wider">
                              <span aria-hidden="true" className="h-1 w-1 rounded-full bg-current" />
                              NEXT
                            </span>
                          )}
                        </div>
                        {!isPoolBlindBox && (
                          <p className="mt-1 text-[10px] text-white/70 font-medium truncate text-center px-0.5">
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
        </div>
        )}
        {/* ====================================================================
            BOTTOM DIRECTOR PLAYBACK BAR (Supports Pause, Step ←, Step →, Auto-Play, Timeline Scrub)
           ==================================================================== */}
        {!hideDirectorHud ? (
          <footer
            data-testid="studio-director-bar"
            className="relative z-40 h-14 px-5 flex items-center justify-between gap-4 bg-black/65 backdrop-blur-xl border-t border-white/[0.08] shrink-0"
          >
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                data-testid="studio-step-prev-btn"
                onClick={handleStepBackward}
                disabled={currentStepIndex < 0 && !showFinaleOverview}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.15] disabled:opacity-35 border border-white/[0.12] text-xs font-semibold text-white transition-colors cursor-pointer"
                title="退回上一步 (快捷键: ←)"
              >
                <SkipBack className="w-3.5 h-3.5" />
                <span>后退 (←)</span>
              </button>

              <button
                type="button"
                data-testid="studio-play-pause-btn"
                onClick={() => setIsAutoPlaying(prev => !prev)}
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  isAutoPlaying
                    ? 'bg-amber-400 text-zinc-950 shadow-[0_0_20px_rgba(251,191,36,0.4)]'
                    : 'bg-white text-zinc-950 hover:bg-zinc-200'
                }`}
                title="自动连播 / 暂停 (快捷键: P)"
              >
                {isAutoPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5 fill-current" />
                    <span>暂停连播 (P)</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>自动连播</span>
                  </>
                )}
              </button>

              <button
                type="button"
                data-testid="studio-step-next-btn"
                onClick={handleStepForward}
                disabled={playbackSteps.length === 0 || showFinaleOverview}
                className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-white/[0.1] hover:bg-white/[0.18] disabled:opacity-35 border border-white/[0.16] text-xs font-bold text-white transition-colors cursor-pointer"
                title="推进下一步 / 补全当前打字 / 进入终局总览 (快捷键: Space 或 →)"
              >
                <span>前进 (Space / →)</span>
                <SkipForward className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                data-testid="studio-reset-standby-btn"
                onClick={handleResetToStandby}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.08] text-[11px] text-white/70 hover:text-white transition-colors cursor-pointer"
                title="全部退回候选池初始待机状态 (快捷键: R)"
              >
                <RotateCcw className="w-3 h-3" />
                <span>重置全入池</span>
              </button>
              <StudioSpeechSpeedControl value={speechSpeed} onChange={setSpeechSpeed} />
            </div>

            <div className="flex-1 min-w-0 flex items-center gap-1">
              <button
                type="button"
                data-testid="studio-timeline-scroll-left"
                onClick={() => {
                  timelineStripRef.current?.scrollBy({ left: -240, behavior: 'smooth' });
                }}
                className="p-1 rounded-full bg-white/[0.06] hover:bg-white/[0.15] border border-white/[0.1] text-white/75 hover:text-white shrink-0 cursor-pointer"
                title="向左滚动进度条"
                aria-label="向左滚动进度条"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <div
                ref={timelineStripRef}
                data-testid="studio-timeline-strip"
                onWheel={e => {
                  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                    e.currentTarget.scrollLeft += e.deltaY;
                  }
                }}
                onMouseDown={e => {
                  if (e.button !== 0 || !timelineStripRef.current) return;
                  timelineDragRef.current = {
                    isDown: true,
                    startX: e.clientX,
                    scrollLeft: timelineStripRef.current.scrollLeft,
                    moved: false,
                  };
                  setIsDraggingTimeline(true);
                }}
                onMouseMove={e => {
                  const drag = timelineDragRef.current;
                  if (!drag.isDown || !timelineStripRef.current) return;
                  const dx = e.clientX - drag.startX;
                  if (Math.abs(dx) > 4) {
                    drag.moved = true;
                  }
                  timelineStripRef.current.scrollLeft = drag.scrollLeft - dx;
                }}
                onMouseUp={() => {
                  if (timelineDragRef.current.isDown) {
                    timelineDragRef.current.isDown = false;
                    setIsDraggingTimeline(false);
                  }
                }}
                onMouseLeave={() => {
                  if (timelineDragRef.current.isDown) {
                    timelineDragRef.current.isDown = false;
                    setIsDraggingTimeline(false);
                  }
                }}
                onClickCapture={e => {
                  if (timelineDragRef.current.moved) {
                    e.stopPropagation();
                    e.preventDefault();
                    timelineDragRef.current.moved = false;
                  }
                }}
                className={`flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 select-none ${
                  isDraggingTimeline ? 'cursor-grabbing' : 'cursor-grab'
                }`}
                title="支持鼠标按住左右拖动、滚轮滚动或点击两侧箭头移动"
              >
                {playbackSteps.some(step => step.phase === 'opening') && (
                  <button type="button" data-testid="studio-timeline-opening" onClick={() => { setIsAutoPlaying(false); setShowFinaleOverview(false); setEntranceReplay(prev => prev + 1); setCurrentStepIndex(0); }} className={`px-3 py-1 rounded-full text-[11px] shrink-0 border cursor-pointer ${!showFinaleOverview && currentStep?.phase === 'opening' ? 'bg-white text-zinc-950 border-white' : 'border-white/15 text-white/60'}`}>开场</button>
                )}
                {orderedScriptItems.map((item, idx) => {
                  const isCurrentWork = !showFinaleOverview && currentStep?.workOrderIndex === idx;
                  const isDoneWork = showFinaleOverview || (currentStep ? currentStep.workOrderIndex > idx : false);
                  return (
                    <button
                      key={item.animeId}
                      type="button"
                      data-testid={`studio-timeline-jump-${idx}`}
                      onClick={() => {
                        setIsAutoPlaying(false);
                        setShowFinaleOverview(false);
                        setEntranceReplay(prev => prev + 1);
                        const firstStepIdx = playbackSteps.findIndex(s => s.workOrderIndex === idx);
                        if (firstStepIdx !== -1) setCurrentStepIndex(firstStepIdx);
                      }}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all cursor-pointer shrink-0 border ${
                        isCurrentWork
                          ? 'bg-white text-zinc-950 border-white font-bold shadow-sm'
                          : isDoneWork
                          ? 'bg-white/[0.09] text-white/80 border-white/15'
                          : 'bg-white/[0.03] text-white/40 border-white/[0.06] hover:text-white/75'
                      }`}
                    >
                      #{idx + 1} {item.anime.title.slice(0, 8)}
                    </button>
                  );
                })}
                {playbackSteps.some(step => step.phase === 'finale') && (
                  <button type="button" data-testid="studio-timeline-ending" onClick={() => { setIsAutoPlaying(false); setShowFinaleOverview(false); setCurrentStepIndex(playbackSteps.findIndex(step => step.phase === 'finale')); }} className={`px-3 py-1 rounded-full text-[11px] shrink-0 border cursor-pointer ${!showFinaleOverview && currentStep?.phase === 'finale' ? 'bg-white text-zinc-950 border-white' : 'border-white/15 text-white/60'}`}>收尾</button>
                )}
                <button
                  type="button"
                  data-testid="studio-timeline-finale-overview"
                  onClick={() => {
                    setIsAutoPlaying(false);
                    setShowFinaleOverview(prev => !prev);
                  }}
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] shrink-0 border font-semibold cursor-pointer transition-colors ${
                    showFinaleOverview
                      ? 'bg-white text-zinc-950 border-white font-bold shadow-sm'
                      : 'bg-white/[0.06] border-white/20 text-white/85 hover:bg-white/[0.14]'
                  }`}
                >
                  <LayoutGrid className="w-3 h-3" />
                  <span>终局总览：全榜 + 海报墙</span>
                </button>
              </div>

              <button
                type="button"
                data-testid="studio-timeline-scroll-right"
                onClick={() => {
                  timelineStripRef.current?.scrollBy({ left: 240, behavior: 'smooth' });
                }}
                className="p-1 rounded-full bg-white/[0.06] hover:bg-white/[0.15] border border-white/[0.1] text-white/75 hover:text-white shrink-0 cursor-pointer"
                title="向右滚动进度条"
                aria-label="向右滚动进度条"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-3 shrink-0 text-[11px] font-mono text-white/55">
              <span>
                {showFinaleOverview ? (
                  <strong className="text-white">终局全景展示</strong>
                ) : (
                  <>
                    步骤{' '}
                    <strong className="text-white">
                      {currentStep ? currentStep.stepIndex + 1 : 0}
                    </strong>{' '}
                    / {playbackSteps.length}
                  </>
                )}
              </span>
            </div>
          </footer>
        ) : (
          <button
            type="button"
            data-testid="studio-restore-hud-btn"
            onClick={() => setHideDirectorHud(false)}
            className="fixed bottom-3 right-3 z-50 px-3 py-1 rounded-full bg-black/50 hover:bg-black/80 border border-white/15 text-[10px] text-white/45 hover:text-white transition-all cursor-pointer"
          >
            显示导播栏 (H)
          </button>
        )}
        {isEntryPending && currentStep?.activeWork && (
          <StudioEntrance
            key={`${entranceReplay}-${currentEntryStep?.stepIndex}-${currentStep.activeWork.animeId}`}
            anime={currentStep.activeWork.anime}
            poolPosters={poolPosterRefs}
            tierPoster={activeTierPosterRef}
            onPhaseChange={handleEntrancePhase}
          />
        )}
      </div>
    );
  }

  // ============================================================================
  // RENDER: 1. PREP & SCRIPT WORKBENCH (Restrained Dark Monochrome UI matching Figure 1 Left)
  // ============================================================================
  return (
    <div
      data-testid="recording-studio-prep"
      className="relative z-20 min-h-screen w-full pb-20 text-white"
    >
      {/* Sticky Top Header */}
      <header className="sticky top-0 z-40 h-16 px-6 flex items-center justify-between bg-[#0b0b0f]/90 backdrop-blur-xl border-b border-white/[0.08]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onExitStudio}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-semibold text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>返回排榜主页</span>
          </button>

          <div className="inline-flex items-center rounded-full bg-white/[0.06] border border-white/[0.1] p-1">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white text-zinc-950 text-xs font-bold shadow-xs cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>1. 台本与角色设置 ({scriptItems.length}部)</span>
            </button>
            <button
              type="button"
              data-testid="prep-enter-stage-btn"
              onClick={() => { setEntranceReplay(prev => prev + 1); setStudioMode('stage'); }}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold text-white/75 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <Film className="w-3.5 h-3.5" />
              <span>2. 进入 16:9 录屏演播舞台</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {generationStatus && (
            <span className="px-3 py-1.5 rounded-full bg-white/[0.08] border border-white/[0.14] text-xs font-medium text-white">
              {isLoadingContext ? contextStatus || '正在补充 Bangumi 资料…' : generationStatus}
            </span>
          )}

          <button
            type="button"
            data-testid="studio-ai-generate-all-btn"
            onClick={handleGenerateAiTimelineScript}
            disabled={isGeneratingScript || isLoadingContext || scriptItems.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
          >
            {isGeneratingScript ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>正在生成台本...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>生成全榜 AI 吐槽台本</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setCurrentStepIndex(0);
              setEntranceReplay(prev => prev + 1);
              setStudioMode('stage');
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.14] text-white text-xs font-bold transition-colors cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>开始 16:9 录屏演播</span>
          </button>
        </div>
      </header>

      <div className="max-w-[1440px] mx-auto px-6 pt-6 space-y-6">
        {/* ====================================================================
            TOP PANEL: RESTRAINED AI RP & WORLDBOOK & EXPRESSION PROMPT SETTINGS
            (Matches Figure 1 Left UI style: apple-glass-panel, monochrome white active pills)
           ==================================================================== */}
        <section
          data-testid="studio-restrained-settings-panel"
          className="rounded-[24px] p-6 apple-glass-panel space-y-5 border border-white/[0.12]"
        >
          {/* Clean Restrained Tab Bar (Matches TasteReportSection / Figure 1 Left) */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="studio-tab-worldbook"
                onClick={() => setPrepSettingsTab('worldbook')}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                  prepSettingsTab === 'worldbook'
                    ? 'bg-white text-zinc-950'
                    : 'bg-white/[0.05] text-white/70 hover:text-white'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>全局世界书</span>
              </button>

              <button
                type="button"
                data-testid="studio-tab-personas"
                onClick={() => setPrepSettingsTab('personas')}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                  prepSettingsTab === 'personas'
                    ? 'bg-white text-zinc-950'
                    : 'bg-white/[0.05] text-white/70 hover:text-white'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>人设设置</span>
              </button>

              <button
                type="button"
                data-testid="studio-tab-expressions"
                onClick={() => setPrepSettingsTab('expressions')}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                  prepSettingsTab === 'expressions'
                    ? 'bg-white text-zinc-950'
                    : 'bg-white/[0.05] text-white/70 hover:text-white'
                }`}
              >
                <Smile className="w-3.5 h-3.5" />
                <span>
                  表情差分与漫符规则 ({activeCompanion.customExpressions?.length || 0}项)
                </span>
              </button>

              <button
                type="button"
                data-testid="studio-tab-api"
                onClick={() => setPrepSettingsTab('api')}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                  prepSettingsTab === 'api'
                    ? 'bg-white text-zinc-950'
                    : 'bg-white/[0.05] text-white/70 hover:text-white'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>API 设置</span>
              </button>

              <button
                type="button"
                data-testid="studio-tab-preview"
                onClick={() => setPrepSettingsTab('preview')}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                  prepSettingsTab === 'preview'
                    ? 'bg-white text-zinc-950'
                    : 'bg-white/[0.05] text-white/70 hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Prompt 预览</span>
              </button>
            </div>

            {/* Global Toggle Switches for Expressions & Emotes */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-white/80">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableExpressions}
                  onChange={e => setEnableExpressions(e.target.checked)}
                  className="rounded border-white/25 bg-black/40 text-white focus:ring-0"
                />
                <span>启用立绘表情差分</span>
              </label>

              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableEmotes}
                  onChange={e => setEnableEmotes(e.target.checked)}
                  className="rounded border-white/25 bg-black/40 text-white focus:ring-0"
                />
                <span>启用头顶漫符</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <span>立绘 {standeeScale.toFixed(2)}x</span>
                <input
                  type="range"
                  aria-label="立绘大小"
                  min="0.75"
                  max="2.2"
                  step="0.05"
                  value={standeeScale}
                  onChange={event => setStandeeScale(Number(event.target.value))}
                  className="w-20 accent-white cursor-pointer"
                />
              </label>
              <label className="inline-flex items-center gap-2">
                <span>气泡 {bubbleFontSize}px</span>
                <input
                  type="range"
                  aria-label="气泡字号"
                  min="12"
                  max="36"
                  step="0.5"
                  value={bubbleFontSize}
                  onChange={event => setBubbleFontSize(Number(event.target.value))}
                  className="w-20 accent-white cursor-pointer"
                />
              </label>
              <StudioSpeechSpeedControl value={speechSpeed} onChange={setSpeechSpeed} />
            </div>
          </div>

          {/* ==================================================================
              TAB 1: GLOBAL WORLD BOOK (Shared entries with main page; wb-d0-default enabled by default)
             ================================================================== */}
          {prepSettingsTab === 'worldbook' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 space-y-3.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-white/75" />
                    <span>全局世界书词条列表</span>
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-white/50">
                      已启用 {enabledStudioWorldBooks.length} / {worldBookEntries.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowNewWbForm(prev => !prev)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white text-zinc-950 hover:bg-zinc-200 text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>新增词条</span>
                    </button>
                  </div>
                </div>

                {showNewWbForm && (
                  <div className="p-3.5 rounded-2xl bg-white/[0.05] border border-white/20 space-y-2.5">
                    <input
                      type="text"
                      value={newWbTitle}
                      onChange={e => setNewWbTitle(e.target.value)}
                      placeholder="词条标题（如：2025新番补充 / 个人偏好补充）"
                      className="w-full px-3 py-1.5 rounded-xl bg-black/45 border border-white/[0.12] text-xs text-white placeholder:text-white/35 focus:outline-none focus:border-white/40"
                    />
                    <input
                      type="text"
                      value={newWbShortDesc}
                      onChange={e => setNewWbShortDesc(e.target.value)}
                      placeholder="简短摘要（可选）"
                      className="w-full px-3 py-1.5 rounded-xl bg-black/45 border border-white/[0.12] text-xs text-white placeholder:text-white/35 focus:outline-none focus:border-white/40"
                    />
                    <textarea
                      rows={3}
                      value={newWbContent}
                      onChange={e => setNewWbContent(e.target.value)}
                      placeholder="词条详细内容..."
                      className="w-full px-3 py-2 rounded-xl bg-black/45 border border-white/[0.12] text-xs text-white/90 focus:outline-none focus:border-white/40"
                    />
                    <PromptPlacementControls label="新词条" value={newWbPlacement} showScope onChange={patch => setNewWbPlacement(prev => ({ ...prev, ...patch }))} />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowNewWbForm(false)}
                        className="px-3 py-1 rounded-lg text-xs text-white/60 hover:text-white cursor-pointer"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={handleAddSharedWorldBookEntry}
                        disabled={!newWbTitle.trim() || !newWbContent.trim()}
                        className="px-3.5 py-1 rounded-lg bg-white text-zinc-950 text-xs font-bold disabled:opacity-40 cursor-pointer"
                      >
                        保存词条
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-white/50 leading-relaxed">角色设定前 → 角色卡 → 角色设定后 → 作品资料 → D0。此处开关仅控制小剧场；报告专用条目不会混入台词。</p>
                <div className="space-y-2.5">
                  {worldBookEntries.length === 0 && <p className="p-4 text-xs text-white/50">还没有世界书条目，点击「新增词条」添加。</p>}
                  {sortPromptEntries(worldBookEntries).map(entry => {
                    const isSelected = selectedWbEntry?.id === entry.id;
                    const appliesToStudio = appliesToWorldBookScope(entry, 'studio');
                    const isEnabledInStudio =
                      appliesToStudio && promptRules.enabledWorldBookIds.includes(entry.id);
                    return (
                      <div
                        key={entry.id}
                        data-testid={`studio-wb-card-${entry.id}`}
                        onClick={() => setSelectedWbEntryId(entry.id)}
                        className={`rounded-2xl p-4 border transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'bg-white/[0.11] border-white/40 text-white shadow-md'
                            : isEnabledInStudio
                            ? 'bg-white/[0.06] border-white/15 text-white hover:bg-white/[0.09]'
                            : 'bg-white/[0.02] border-white/[0.07] text-white/50 hover:bg-white/[0.04]'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <span className="text-xs font-bold text-white leading-snug">
                              {entry.title}
                            </span>

                              <button
                                type="button"
                                role="switch"
                                aria-checked={isEnabledInStudio}
                                aria-label={`小剧场启用 ${entry.title}`}
                                disabled={!appliesToStudio}
                                onClick={e => {
                                  e.stopPropagation();
                                  handleToggleStudioWorldBookEntry(entry.id);
                                }}
                                className={`w-9 h-5 rounded-full shrink-0 transition-colors cursor-pointer relative ${
                                  isEnabledInStudio ? 'bg-white' : 'bg-white/20'
                                }`}
                              >
                                <span
                                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform ${
                                    isEnabledInStudio
                                      ? 'translate-x-4 bg-zinc-950'
                                      : 'translate-x-0 bg-white'
                                  }`}
                                />
                              </button>
                          </div>

                          <p className="text-[11px] text-white/60 leading-relaxed line-clamp-2">
                            {entry.shortDesc || entry.content.slice(0, 60)}
                          </p>
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-white/[0.07] flex items-center justify-between">
                          <span className="text-[10px] font-mono text-white/45">
                            {describePromptPlacement(entry)} · {WORLD_BOOK_SCOPE_LABELS[entry.scope || 'all']}
                          </span>
                          <span className="text-[11px] font-semibold text-white/85 underline">
                            {isSelected ? '正在右侧编辑' : '编辑词条'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="lg:col-span-7 p-5 rounded-2xl bg-white/[0.03] border border-white/[0.1] flex flex-col space-y-4">
                {selectedWbEntry && (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/[0.08]">
                      <div className="flex items-center gap-2">
                        <Edit3 className="w-4 h-4 text-white/75" />
                        <h4 className="text-sm font-bold text-white">
                          编辑词条：{selectedWbEntry.title}
                        </h4>
                      </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteSharedWorldBookEntry(selectedWbEntry.id)}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs text-rose-200 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>删除词条</span>
                        </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-white/55 mb-1">词条名称</label>
                        <input
                          type="text"
                          value={selectedWbEntry.title}
                          aria-label="词条名称"
                          onChange={e =>
                            handleUpdateSharedWorldBookEntry(selectedWbEntry.id, {
                              title: e.target.value,
                            })
                          }
                          className="w-full px-3.5 py-2 rounded-xl bg-black/45 border border-white/[0.12] text-xs font-bold text-white focus:outline-none focus:border-white/40"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-white/55 mb-1">卡片简述</label>
                        <input
                          type="text"
                          value={selectedWbEntry.shortDesc}
                          onChange={e =>
                            handleUpdateSharedWorldBookEntry(selectedWbEntry.id, {
                              shortDesc: e.target.value,
                            })
                          }
                          className="w-full px-3.5 py-2 rounded-xl bg-black/45 border border-white/[0.12] text-xs text-white focus:outline-none focus:border-white/40"
                        />
                      </div>
                    </div>

                    <PromptPlacementControls value={selectedWbEntry} showScope onChange={patch => handleUpdateSharedWorldBookEntry(selectedWbEntry.id, patch)} />
                    <div className="flex-1 flex flex-col">
                      <label className="block text-[11px] text-white/55 mb-1">
                        词条 Prompt 内容（与主页全局世界书实时同步）
                      </label>
                      <textarea
                        rows={11}
                        value={selectedWbEntry.content}
                        aria-label="词条内容"
                        onChange={e =>
                          handleUpdateSharedWorldBookEntry(selectedWbEntry.id, {
                            content: e.target.value,
                          })
                        }
                        className="w-full flex-1 px-4 py-3 rounded-xl bg-black/50 border border-white/[0.12] text-xs font-mono text-white/90 leading-relaxed focus:outline-none focus:border-white/40"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ==================================================================
              TAB 2: PERSONA & STANDEE SETTINGS (Matches Figure 1 Left UI)
             ================================================================== */}
          {prepSettingsTab === 'personas' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 4 Cols: Character List (AI Companions + UP主 Host) */}
              <div className="lg:col-span-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">AI 陪看搭档列表</h3>
                  <button
                    type="button"
                    onClick={() => {
                      const newId = `studio-custom-${Date.now()}`;
                      const nextComp: StudioCharacterConfig = {
                        id: newId,
                        name: '自定义搭档',
                        subtitle: '自定义人设',
                        defaultAvatarUrl: DEFAULT_STUDIO_AI_COMPANIONS[0].defaultAvatarUrl,
                        customExpressions: [
                          {
                            id: `expr-${Date.now()}`,
                            name: '默认',
                            url: DEFAULT_STUDIO_AI_COMPANIONS[0].defaultAvatarUrl,
                            note: '默认立绘',
                          },
                        ],
                        voicePreset: 'mochi_loli',
                        voicePitch: 1.12,
                        prompt: '你正在陪主人一起录制 Tier List 排榜视频，请用口语化、有活人感的语气简短吐槽每部作品（1～2句话）。',
                        isCustom: true,
                      };
                      setCompanions(prev => [...prev, nextComp]);
                      setSelectedCompanionId(newId);
                      setEditingTargetRole('ai');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white text-zinc-950 hover:bg-zinc-200 text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>新建人设</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {companions.map(comp => {
                    const isSelected = comp.id === activeCompanion.id;
                    const isEditing = editingTargetRole === 'ai' && isSelected;
                    return (
                      <div
                        key={comp.id}
                        onClick={() => {
                          setSelectedCompanionId(comp.id);
                          setEditingTargetRole('ai');

                        }}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isEditing
                            ? 'bg-white/[0.11] border-white/35'
                            : 'bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={comp.defaultAvatarUrl}
                            alt={comp.name}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-xl object-contain bg-black/40 border border-white/15 shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white truncate">
                              {comp.name}
                            </div>
                            <div className="text-[10px] text-white/45 truncate">
                              {comp.customExpressions?.length || 0} 个表情差分
                            </div>
                          </div>
                        </div>

                        {isSelected && (
                          <span className="px-2 py-0.5 rounded-full bg-white text-zinc-950 text-[10px] font-bold shrink-0">
                            当前使用
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="pt-3 border-t border-white/[0.08] space-y-2">
                  <h3 className="text-xs font-bold text-white/65">UP主本人立绘与嘴替音</h3>
                  <div
                    onClick={() => setEditingTargetRole('user')}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      editingTargetRole === 'user'
                        ? 'bg-white/[0.11] border-white/35'
                        : 'bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={userChar.defaultAvatarUrl}
                        alt={userChar.name}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-xl object-contain bg-black/40 border border-white/15 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">{userChar.name}</div>
                        <div className="text-[10px] text-white/45 truncate">左上角主理人立绘</div>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-white/75 underline">
                      编辑立绘
                    </span>
                  </div>
                </div>
              </div>

              {/* Right 8 Cols: Character & Persona Prompt Editor */}
              <div className="lg:col-span-8 p-5 rounded-2xl bg-white/[0.03] border border-white/[0.1] space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/[0.08]">
                  <h4 className="text-sm font-bold text-white">
                    编辑角色：{editingCharacter.name}
                  </h4>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        previewVoiceBlipPhrase(
                          editingCharacter.voicePreset,
                          editingCharacter.voicePitch,
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs text-white/85 cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>试听嘴替音</span>
                    </button>

                    {editingTargetRole === 'ai' && editingCharacter.isCustom && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = companions.filter(c => c.id !== editingCharacter.id);
                          setCompanions(next);
                          setSelectedCompanionId(next[0]?.id || 'studio-feiyu');
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs text-rose-200 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>删除人设</span>
                      </button>
                    )}

                    {(editingTargetRole === 'user' || !editingCharacter.isCustom) && (
                      <button
                        type="button"
                        onClick={() => {
                          const def = editingTargetRole === 'user'
                            ? DEFAULT_USER_STUDIO_CHARACTER
                            : DEFAULT_STUDIO_AI_COMPANIONS.find(d => d.id === editingCharacter.id);
                          if (def) updateEditingCharacter(def);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs text-white/75 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>恢复默认</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-white/55 mb-1">角色名称</label>
                    <input
                      type="text"
                      value={editingCharacter.name}
                      onChange={e => updateEditingCharacter({ name: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl bg-black/45 border border-white/[0.12] text-xs font-bold text-white focus:outline-none focus:border-white/40"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] text-white/55">默认立绘 URL / 本地上传</label>
                      <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.12] text-[10.5px] font-semibold text-white/85 cursor-pointer transition-colors">
                        <Upload className="w-3 h-3" />
                        <span>本地上传</span>
                        <input
                          type="file"
                          accept="image/*,.gif"
                          data-testid="studio-default-avatar-upload-input"
                          className="hidden"
                          onChange={async e => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (!file) return;
                            if (file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')) {
                              const reader = new FileReader();
                              reader.onload = () => {
                                if (typeof reader.result === 'string') {
                                  updateEditingCharacter({ defaultAvatarUrl: reader.result });
                                }
                              };
                              reader.readAsDataURL(file);
                              return;
                            }
                            const dataUrl = await compressImageFileToDataUrl(file, 720, 720, 0.88);
                            if (dataUrl) {
                              updateEditingCharacter({ defaultAvatarUrl: dataUrl });
                            }
                          }}
                        />
                      </label>
                    </div>
                    <input
                      type="text"
                      value={editingCharacter.defaultAvatarUrl}
                      aria-label="默认立绘 URL"
                      onChange={e => updateEditingCharacter({ defaultAvatarUrl: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl bg-black/45 border border-white/[0.12] text-xs font-mono text-white/85 focus:outline-none focus:border-white/40"
                    />
                  </div>
                </div>

                {/* Voice Synthesis Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-black/30 border border-white/[0.07]">
                  <div>
                    <label className="block text-[11px] text-white/55 mb-1">嘴替音色预设</label>
                    <select
                      value={editingCharacter.voicePreset}
                      onChange={e => {
                        const presetId = e.target.value as VoiceBlipPresetId;
                        const found = VOICE_BLIP_PRESETS.find(p => p.id === presetId);
                        updateEditingCharacter({
                          voicePreset: presetId,
                          voicePitch: found ? found.defaultPitch : editingCharacter.voicePitch,
                        });
                        previewVoiceBlipPhrase(
                          presetId,
                          found ? found.defaultPitch : editingCharacter.voicePitch,
                        );
                      }}
                      className="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/[0.12] text-xs text-white focus:outline-none"
                    >
                      {VOICE_BLIP_PRESETS.map(p => (
                        <option key={p.id} value={p.id} className="bg-zinc-900 text-white">
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[11px] text-white/55 mb-1">
                      <span>音高微调</span>
                      <span className="font-mono text-white/80">
                        {editingCharacter.voicePitch.toFixed(2)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.65"
                      max="1.55"
                      step="0.02"
                      value={editingCharacter.voicePitch}
                      onChange={e =>
                        updateEditingCharacter({ voicePitch: Number(e.target.value) })
                      }
                      className="w-full accent-white cursor-pointer mt-1.5"
                    />
                  </div>
                </div>

                {editingTargetRole === 'ai' ? (
                  <div>
                    <label className="block text-[11px] text-white/55 mb-1">
                      人设 Prompt
                    </label>
                    <textarea
                      rows={11}
                      value={editingCharacter.prompt || ''}
                      onChange={e => updateEditingCharacter({ prompt: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-black/50 border border-white/[0.12] text-xs font-mono text-white/90 leading-relaxed focus:outline-none focus:border-white/40"
                    />
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-black/30 border border-white/[0.07] text-xs text-white/60 leading-relaxed">
                    UP主的台词由你在下方时间线列表中亲自填写（或留空由 AI 搭档单人控场）。你也可以切换到「表情差分与漫符规则」标签页为 UP 主添加更多立绘差分。
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================================================================
              TAB 3: CUSTOM EXPRESSIONS & TRANSPARENT PROMPT TEMPLATES
              (Full custom expression editor with optional scene notes + live {{EXPRESSION_LIST}} & {{EMOTE_LIST}} templates!)
             ================================================================== */}
          {prepSettingsTab === 'expressions' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 6 Cols: Custom Expression Manager for Current Character */}
              <div className="lg:col-span-6 p-5 rounded-2xl bg-white/[0.03] border border-white/[0.1] flex flex-col space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/[0.08]">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-white">
                      {editingCharacter.name} 的自定义立绘表情包 (
                      {editingCharacter.customExpressions?.length || 0}项)
                    </h4>
                  </div>

                  <div className="inline-flex rounded-full bg-white/[0.06] border border-white/[0.1] p-0.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setEditingTargetRole('ai')}
                      className={`px-2.5 py-0.5 rounded-full cursor-pointer ${
                        editingTargetRole === 'ai'
                          ? 'bg-white text-zinc-950 font-bold'
                          : 'text-white/65'
                      }`}
                    >
                      {activeCompanion.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingTargetRole('user')}
                      className={`px-2.5 py-0.5 rounded-full cursor-pointer ${
                        editingTargetRole === 'user'
                          ? 'bg-white text-zinc-950 font-bold'
                          : 'text-white/65'
                      }`}
                    >
                      {userChar.name}
                    </button>
                  </div>
                </div>

                {/* Add New Custom Expression Bar */}
                <div className="p-3.5 rounded-xl bg-black/40 border border-white/[0.1] space-y-2.5">
                  <div className="text-[11px] font-bold text-white/80">
                    新增自定义表情差分（添加后自动同步至右侧 {'{{EXPRESSION_LIST}}'} 占位符）
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <input
                      type="text"
                      data-testid="new-custom-expr-name"
                      value={newExprName}
                      onChange={e => setNewExprName(e.target.value)}
                      placeholder="表情名 (如: 摇头)"
                      className="sm:col-span-4 px-3 py-1.5 rounded-lg bg-black/60 border border-white/[0.12] text-xs text-white placeholder:text-white/35 focus:outline-none focus:border-white/40"
                    />
                    <div className="sm:col-span-8 flex items-center gap-1.5">
                      <input
                        type="text"
                        data-testid="new-custom-expr-url"
                        value={newExprUrl}
                        onChange={e => setNewExprUrl(e.target.value)}
                        placeholder="立绘图片/GIF URL 或右侧本地上传..."
                        className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-black/60 border border-white/[0.12] text-xs font-mono text-white placeholder:text-white/35 focus:outline-none focus:border-white/40"
                      />
                      <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.16] border border-white/[0.14] text-[11px] font-semibold text-white/90 shrink-0 cursor-pointer">
                        <Upload className="w-3 h-3" />
                        <span>本地上传</span>
                        <input
                          type="file"
                          accept="image/*,.gif"
                          className="hidden"
                          onChange={async e => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (!file) return;
                            if (!newExprName.trim()) {
                              setNewExprName(file.name.replace(/\.[^.]+$/, '').replace(/^大肥鱼[-_]?/, ''));
                            }
                            if (file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')) {
                              const reader = new FileReader();
                              reader.onload = () => {
                                if (typeof reader.result === 'string') setNewExprUrl(reader.result);
                              };
                              reader.readAsDataURL(file);
                              return;
                            }
                            const dataUrl = await compressImageFileToDataUrl(file, 720, 720, 0.88);
                            if (dataUrl) setNewExprUrl(dataUrl);
                          }}
                        />
                      </label>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      data-testid="new-custom-expr-note"
                      value={newExprNote}
                      onChange={e => setNewExprNote(e.target.value)}
                      placeholder="使用场景备注（选填，如：遇到烂作无语叹气时使用；不填则只注入表情名）"
                      className="flex-1 px-3 py-1.5 rounded-lg bg-black/60 border border-white/[0.12] text-xs text-white placeholder:text-white/35 focus:outline-none focus:border-white/40"
                    />
                    <button
                      type="button"
                      data-testid="add-custom-expr-btn"
                      onClick={handleAddCustomExpression}
                      disabled={!newExprName.trim() || !newExprUrl.trim()}
                      className="px-3.5 py-1.5 rounded-lg bg-white text-zinc-950 text-xs font-bold disabled:opacity-40 cursor-pointer shrink-0"
                    >
                      + 添加表情
                    </button>
                  </div>
                </div>

                {/* Custom Expression List */}
                <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
                  {(editingCharacter.customExpressions || []).map(expr => (
                    <div
                      key={expr.id}
                      data-testid={`custom-expr-item-${expr.name}`}
                      className="p-2.5 rounded-xl bg-black/35 border border-white/[0.08] flex items-center gap-3"
                    >
                      <img
                        src={expr.url}
                        alt={expr.name}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded-lg object-contain bg-black/50 border border-white/10 shrink-0"
                      />
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-white/[0.1] text-[11px] font-mono font-bold text-white shrink-0">
                            [{expr.name}]
                          </span>
                          <input
                            type="text"
                            value={expr.name}
                            onChange={e =>
                              handleUpdateCustomExpression(expr.id, { name: e.target.value })
                            }
                            className="w-28 px-2 py-0.5 rounded bg-black/50 border border-white/[0.1] text-xs font-bold text-white focus:outline-none"
                            title="表情名称"
                          />
                          <input
                            type="text"
                            value={expr.url}
                            onChange={e =>
                              handleUpdateCustomExpression(expr.id, { url: e.target.value })
                            }
                            className="flex-1 min-w-0 px-2 py-0.5 rounded bg-black/50 border border-white/[0.1] text-[10.5px] font-mono text-white/70 focus:outline-none"
                            title="图片/GIF URL"
                          />
                        </div>
                        <input
                          type="text"
                          value={expr.note || ''}
                          onChange={e =>
                            handleUpdateCustomExpression(expr.id, { note: e.target.value })
                          }
                          placeholder="备注（可选：指定在什么场景下使用该表情）"
                          className="w-full px-2.5 py-1 rounded bg-black/40 border border-white/[0.08] text-[11px] text-white/80 placeholder:text-white/30 focus:outline-none focus:border-white/30"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteCustomExpression(expr.id)}
                        className="p-1.5 rounded-lg text-white/40 hover:text-rose-300 hover:bg-rose-500/15 transition-colors cursor-pointer shrink-0"
                        title="删除此表情"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right 6 Cols: Unified Output Format, Expressions, Bubble Effects & Timeline Prompt Rules */}
              <div className="lg:col-span-6 p-5 rounded-2xl bg-white/[0.03] border border-white/[0.1] flex flex-col space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/[0.08]">
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      输出格式、立绘差分、气泡特效与时间线总规则模板
                    </h4>
                    <p className="text-[11px] text-white/50 mt-0.5">
                      已合并为单一输出总规则框，支持占位符{' '}
                      <code className="text-white/90">{'{{EXPRESSION_LIST}}'}</code>、
                      <code className="text-white/90">{'{{EMOTE_LIST}}'}</code>、
                      <code className="text-white/90">{'{{TOTAL_WORKS}}'}</code> 及气泡文字特效{' '}
                      <code className="text-white/90">&lt;big&gt;</code> /{' '}
                      <code className="text-white/90">&lt;shake&gt;</code> /{' '}
                      <code className="text-white/90">&lt;mask&gt;</code> /{' '}
                      <code className="text-white/90">&lt;whisper&gt;</code> /{' '}
                      <code className="text-white/90">[换页]</code>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setPromptRules({
                        ...promptRules,
                        expressionRuleTemplate: DEFAULT_EXPRESSION_RULE_TEMPLATE,
                        timelineRuleTemplate: DEFAULT_TIMELINE_RULE_TEMPLATE,
                        expressionRulePlacement: DEFAULT_STUDIO_PROMPT_RULES_CONFIG.expressionRulePlacement,
                        timelineRulePlacement: DEFAULT_STUDIO_PROMPT_RULES_CONFIG.timelineRulePlacement,
                      })
                    }
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs text-white/75 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>恢复默认模板</span>
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <PromptPlacementControls
                      label="表情与特效规则定位"
                      value={promptRules.expressionRulePlacement}
                      onChange={patch =>
                        setPromptRules(prev => ({
                          ...prev,
                          expressionRulePlacement: { ...prev.expressionRulePlacement, ...patch },
                        }))
                      }
                    />
                    <PromptPlacementControls
                      label="时间线与输出格式定位"
                      value={promptRules.timelineRulePlacement}
                      onChange={patch =>
                        setPromptRules(prev => ({
                          ...prev,
                          timelineRulePlacement: { ...prev.timelineRulePlacement, ...patch },
                        }))
                      }
                    />
                  </div>

                  <textarea
                    data-testid="expression-rule-template-textarea"
                    rows={15}
                    value={
                      promptRules.timelineRuleTemplate
                        ? `${promptRules.expressionRuleTemplate}\n\n${promptRules.timelineRuleTemplate}`
                        : promptRules.expressionRuleTemplate
                    }
                    onChange={e => {
                      const val = e.target.value;
                      const splitIdx = val.search(/\n\n(?=【录屏时间线)/);
                      if (splitIdx !== -1) {
                        setPromptRules(prev => ({
                          ...prev,
                          expressionRuleTemplate: val.slice(0, splitIdx),
                          timelineRuleTemplate: val.slice(splitIdx + 2),
                        }));
                      } else {
                        setPromptRules(prev => ({
                          ...prev,
                          expressionRuleTemplate: val,
                          timelineRuleTemplate: '',
                        }));
                      }
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/[0.12] text-xs font-mono text-white/90 leading-relaxed focus:outline-none focus:border-white/40"
                  />
                </div>

                {/* Live Preview of {{EXPRESSION_LIST}} Expansion */}
                <div className="p-3 rounded-xl bg-black/40 border border-white/[0.08]">
                  <div className="text-[10.5px] font-mono text-white/50 mb-1.5">
                    当前 {'{{EXPRESSION_LIST}}'} 自动展开结果预览：
                  </div>
                  <pre className="max-h-28 overflow-y-auto text-[11px] font-mono text-white/80 whitespace-pre-wrap leading-relaxed">
                    {formatExpressionListPlaceholder(activeCompanion.customExpressions || [])}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================================
              TAB 4: API SETTINGS (Shared with main page aiConfig)
             ================================================================== */}
          {prepSettingsTab === 'api' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 rounded-2xl bg-white/[0.03] border border-white/[0.1]">
              <div>
                <label className="block text-[11px] text-white/55 mb-1">
                  OpenAI 兼容接口地址 (Base URL)
                </label>
                <input
                  type="text"
                  value={aiConfig.baseUrl}
                  onChange={e => updateSharedAiConfig({ baseUrl: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-black/45 border border-white/[0.12] text-xs font-mono text-white focus:outline-none focus:border-white/40"
                />
              </div>
              <div>
                <label className="block text-[11px] text-white/55 mb-1">
                  {IS_STATIC_HOSTING ? 'API Key（填写你自己的密钥）' : 'API Key（留空则使用服务端默认密钥）'}
                </label>
                <input
                  type="password"
                  value={aiConfig.apiKey}
                  onChange={e => updateSharedAiConfig({ apiKey: e.target.value })}
                  placeholder="sk-..."
                  className="w-full px-3.5 py-2 rounded-xl bg-black/45 border border-white/[0.12] text-xs font-mono text-white focus:outline-none focus:border-white/40"
                />
              </div>
              <div>
                <label className="block text-[11px] text-white/55 mb-1">模型名称 (Model)</label>
                <input
                  type="text"
                  value={aiConfig.model}
                  onChange={e => updateSharedAiConfig({ model: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-black/45 border border-white/[0.12] text-xs font-mono text-white focus:outline-none focus:border-white/40"
                />
              </div>
            </div>
          )}

          {/* ==================================================================
              TAB 5: FULL TRANSPARENT PROMPT PREVIEW (Zero black box!)
             ================================================================== */}
          {prepSettingsTab === 'preview' && (
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.1] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">
                    {showLastSentPrompt ? '上次发送给 AI 的完整 Prompt' : '完整组装 Prompt 实时预览'}
                  </h4>
                  <p className="text-[11px] text-white/50">
                    包含角色人设、已启用的全局世界书、展开后的自定义表情差分与漫符规则、防剧透时间线与全部作品 Bangumi 数据
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(displayedPrompt);
                    setCopiedPrompt(true);
                    setTimeout(() => setCopiedPrompt(false), 2000);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white text-zinc-950 text-xs font-bold cursor-pointer"
                >
                  {copiedPrompt ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>已复制完整 Prompt</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>复制完整 Prompt</span>
                    </>
                  )}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex gap-1 rounded-full bg-white/5 p-1 text-xs">
                  <button type="button" onClick={() => setShowLastSentPrompt(false)} className={`rounded-full px-3 py-1 cursor-pointer ${!showLastSentPrompt ? 'bg-white text-zinc-950' : 'text-white/60'}`}>当前预览</button>
                  <button type="button" onClick={() => setShowLastSentPrompt(true)} disabled={!lastSentPrompt} className={`rounded-full px-3 py-1 cursor-pointer disabled:opacity-35 ${showLastSentPrompt ? 'bg-white text-zinc-950' : 'text-white/60'}`}>上次发送</button>
                </div>
                <button
                  type="button"
                  onClick={() => void loadStudioContext(true)}
                  disabled={isLoadingContext || isGeneratingScript || scriptItems.length === 0}
                  className="px-3 py-1.5 rounded-full border border-white/15 text-xs text-white/85 hover:bg-white/10 disabled:opacity-40 cursor-pointer"
                >
                  {isLoadingContext ? '正在刷新…' : '刷新 Prompt'}
                </button>
                <p role="status" className="text-[11px] text-white/55">
                  {contextStatus || '重新读取作品资料和公开吐槽，更新下方预览；不会改写你的台词。'}
                </p>
              </div>
              <p data-testid="studio-prompt-world-books" className="text-xs text-white/65 leading-relaxed">
                包含 {displayedWorldBookTitles.length} 个世界书条目：{displayedWorldBookTitles.join('、')} · {displayedPrompt.length.toLocaleString()} 字符
              </p>
              <pre
                data-testid="studio-full-prompt-preview"
                className="max-h-[460px] overflow-y-auto p-4 rounded-xl bg-black/60 border border-white/[0.1] text-[11px] font-mono text-white/85 whitespace-pre-wrap leading-relaxed"
              >
                {displayedPrompt}
              </pre>
            </div>
          )}
        </section>

        {/* ====================================================================
            BOTTOM PANEL: TIMELINE SCRIPT INSPECTOR & EDITOR
            (Clean, restrained cards without `[#分段1: 嫌弃]` clutter)
           ==================================================================== */}
        <section className="rounded-[24px] p-6 apple-glass-panel border border-white/[0.12] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
            <div>
              <h2 className="text-base font-bold text-white">
                出场时间线与台本编辑（共 {orderedScriptItems.length} 部）
              </h2>
              <p className="text-xs text-white/50 mt-0.5">
                作品按 #1 → #{orderedScriptItems.length} 依次揭晓（与分数高低无关）。你可以填写你的先行吐槽、附带一张配图，或编辑 {activeCompanion.name} 的台词。
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="studio-shuffle-order-btn"
                onClick={handleShuffleScriptOrder}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-semibold text-white cursor-pointer"
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>随机打乱出场顺序</span>
              </button>

              <button
                type="button"
                onClick={() => handleRegenerateLocalFallbackAll(activeCompanion.id)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-semibold text-white/80 hover:text-white cursor-pointer"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>重置为默认台本</span>
              </button>
            </div>
          </div>

          <StudioBookendEditor scene={bookends.opening} kind="opening" userName={userChar.name} companionName={activeCompanion.name} onChange={opening => setBookends(prev => ({ ...prev, opening }))} />

          {orderedScriptItems.length === 0 ? (
            <div className="py-14 text-center space-y-3">
              <p className="text-sm font-bold text-white/75">
                当前排行榜还没有已打分的作品
              </p>
              <button
                type="button"
                onClick={onExitStudio}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-zinc-950 text-xs font-bold cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>返回排榜主页添加作品</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {orderedScriptItems.map((item, idx) => (
                <div
                  key={item.animeId}
                  data-testid={`studio-script-card-${item.animeId}`}
                  className="rounded-2xl bg-white/[0.025] hover:bg-white/[0.04] border border-white/[0.08] p-4 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-white/[0.06]">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="px-2.5 py-1 rounded-lg bg-white text-zinc-950 text-xs font-black font-mono shrink-0">
                        #{idx + 1}
                      </span>
                      <img
                        src={item.anime.cover}
                        alt={item.anime.title}
                        referrerPolicy="no-referrer"
                        className="w-9 h-12 rounded-lg object-cover border border-white/15 shrink-0 bg-zinc-900"
                      />
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-white truncate">
                          《{item.anime.title}》
                        </h4>
                        <div className="flex items-center gap-2 text-[11px] text-white/50 mt-0.5">
                          <span>
                            目标档位:{' '}
                            <strong className="text-white">
                              {formatTierLabel(item.targetScore, gradingSystem)} 档
                            </strong>
                          </span>
                          {item.anime.bgmScore && <span>· BGM {item.anime.bgmScore}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMoveScriptOrder(idx, -1)}
                        disabled={idx === 0}
                        className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] disabled:opacity-25 text-white/75 cursor-pointer"
                        title="上移出场顺位"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveScriptOrder(idx, 1)}
                        disabled={idx === orderedScriptItems.length - 1}
                        className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] disabled:opacity-25 text-white/75 cursor-pointer"
                        title="下移出场顺位"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left: UP主 Commentary + Optional Image + Hidden Note */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-white/70">
                          {userChar.name} 的先行吐槽（支持 Ctrl+V 粘贴配图；写 &lt;备注内容&gt; 仅发给 AI 识图互动，舞台气泡自动隐藏）
                        </span>
                        <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/[0.07] hover:bg-white/[0.14] text-[10.5px] font-medium text-white/85 shrink-0 cursor-pointer">
                          <ImageIcon className="w-3 h-3" />
                          <span>{item.userImage ? '更换配图' : '附带一张图'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={e => {
                              const f = e.target.files?.[0];
                              if (f) handleAttachUserImageFile(item.animeId, f);
                            }}
                          />
                        </label>
                      </div>

                      <textarea
                        rows={3}
                        value={item.userText}
                        onChange={e =>
                          handleUpdateScriptItem(item.animeId, { userText: e.target.value })
                        }
                        onPaste={e => {
                          const items = e.clipboardData?.items;
                          if (!items) return;
                          for (let i = 0; i < items.length; i++) {
                            if (items[i].type.startsWith('image/')) {
                              const file = items[i].getAsFile();
                              if (file) {
                                e.preventDefault();
                                handleAttachUserImageFile(item.animeId, file);
                                break;
                              }
                            }
                          }
                        }}
                        placeholder={`留空则由 ${activeCompanion.name} 控场；支持直接写 <这张图是名场面截图，帮我吐槽一下> 隐藏备注，舞台不会渲染尖括号内的文字`}
                        className="w-full px-3 py-2 rounded-xl bg-black/45 border border-white/[0.1] text-xs text-white/90 leading-relaxed focus:outline-none focus:border-white/35"
                      />

                      {(item.userImage || item.userImageNote) && (
                        <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 space-y-2">
                          {item.userImage && (
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <img
                                  src={item.userImage}
                                  alt="配图预览"
                                  className="w-12 h-10 rounded object-cover border border-white/15 shrink-0"
                                />
                                <span className="text-[11px] text-white/60 truncate">
                                  已附带舞台配图（可填写下方识图备注让 AI 互动）
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateScriptItem(item.animeId, {
                                    userImage: undefined,
                                    userImageNote: undefined,
                                  })
                                }
                                className="p-1 text-white/50 hover:text-rose-300 cursor-pointer shrink-0"
                                title="移除配图"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                          <input
                            type="text"
                            data-testid={`studio-image-note-input-${item.animeId}`}
                            value={item.userImageNote || ''}
                            onChange={e =>
                              handleUpdateScriptItem(item.animeId, {
                                userImageNote: e.target.value,
                              })
                            }
                            placeholder="配图隐藏备注（仅 AI 可见，前端舞台不渲染，如：图里是千束躲子弹名场面，吐槽一下）"
                            className="w-full px-2.5 py-1.5 rounded-lg bg-black/50 border border-white/[0.1] text-[11px] text-white/85 placeholder:text-white/35 focus:outline-none focus:border-white/35"
                          />
                        </div>
                      )}
                    </div>

                    {/* Right: AI Companion Line + Quick Custom Expression Tag Inserter */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-white/70">
                          {activeCompanion.name} 台词（支持 [表情名] 切换立绘）
                        </span>

                        {/* Quick insert dropdown for any of the character's custom expressions */}
                        <select
                          value=""
                          onChange={e => {
                            const exprName = e.target.value;
                            if (!exprName) return;
                            handleUpdateScriptItem(item.animeId, {
                              aiRawText: `[${exprName}] ${item.aiRawText}`,
                            });
                          }}
                          className="px-2 py-0.5 rounded bg-white/[0.07] border border-white/[0.12] text-[10.5px] text-white/85 focus:outline-none cursor-pointer"
                        >
                          <option value="" className="bg-zinc-900">
                            + 插入立绘表情...
                          </option>
                          {(activeCompanion.customExpressions || []).map(expr => (
                            <option
                              key={expr.id}
                              value={expr.name}
                              className="bg-zinc-900 text-white"
                            >
                              [{expr.name}] {expr.note ? `— ${expr.note.slice(0, 18)}` : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      <textarea
                        rows={3}
                        value={item.aiRawText}
                        onChange={e =>
                          handleUpdateScriptItem(item.animeId, { aiRawText: e.target.value })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-black/45 border border-white/[0.1] text-xs text-white/95 leading-relaxed focus:outline-none focus:border-white/35"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <StudioBookendEditor scene={bookends.ending} kind="ending" userName={userChar.name} companionName={activeCompanion.name} onChange={ending => setBookends(prev => ({ ...prev, ending }))} />
        </section>
      </div>
    </div>
  );
};
