import React, { useState, useEffect, useMemo } from 'react';
import {
  Trash2,
  Edit3,
  X,
  Check,
  Columns,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  PanelBottom,
  Sparkles,
  Dices,
  Wand2,
  Quote,
} from 'lucide-react';
import type {
  AnimeItem,
  CommentCardStyle,
  CommentItem,
  TierGradingSystem,
  TierScore,
} from '../types';
import { formatTierLabel } from '../lib/tierLogic';

interface CommentsSectionProps {
  comments: CommentItem[];
  gradingSystem?: TierGradingSystem;
  editingTarget: { anime: AnimeItem; score: TierScore } | null;
  onCloseModal: () => void;
  onSaveComment: (comment: Omit<CommentItem, 'id' | 'updatedAt'>) => void;
  onDeleteComment: (commentId: string) => void;
  onEditExistingComment: (comment: CommentItem) => void;
  onCycleCardStyle: (commentId: string) => void;
  onShuffleAllStyles: () => void;
}

const CARD_STYLE_OPTIONS: Array<{
  id: CommentCardStyle;
  name: string;
  desc: string;
  icon: React.ReactNode;
}> = [
  {
    id: 1,
    name: '右封流光渐变',
    desc: '右侧封面无痕羽化溶入左侧高饱和封面色彩渐变，配左上巨型分值暗纹',
    icon: <Columns className="w-4 h-4" />,
  },
  {
    id: 2,
    name: '顶封画幅消融',
    desc: '顶部封面自然向下羽化过渡至封面同色系弥散暗房底座與右上分值暗纹',
    icon: <ImageIcon className="w-4 h-4" />,
  },
  {
    id: 3,
    name: '全幅光影画报',
    desc: '整张卡片由封面景深流光铺满，杂志引言式排版浮于柔光渐变之上',
    icon: <Layers className="w-4 h-4" />,
  },
  {
    id: 4,
    name: '左封悬浮画册',
    desc: '左侧完整 2:3 竖向立体海报 + 右侧封面弥散光渐变与右上角巨型分值暗纹',
    icon: <LayoutGrid className="w-4 h-4" />,
  },
  {
    id: 5,
    name: '底封破界羽化',
    desc: '上方封面色彩渐变与右上巨型分值暗纹，底部全景封面向上无痕消融',
    icon: <PanelBottom className="w-4 h-4" />,
  },
  {
    id: 6,
    name: '左封流光画报',
    desc: '左侧封面无痕向右羽化融入封面同色系渐变 + 右上角巨型数字分值暗纹',
    icon: <Sparkles className="w-4 h-4" />,
  },
];

function estimateCardHeight(comment: CommentItem): number {
  const textLines = Math.ceil((comment.text?.length || 20) / 18);
  switch (comment.cardStyle) {
    case 2:
      return 270 + textLines * 22;
    case 5:
      return 250 + textLines * 22;
    case 1:
      return Math.max(210, 120 + textLines * 24);
    case 6:
      return Math.max(210, 120 + textLines * 24);
    case 4:
      return Math.max(195, 110 + textLines * 22);
    case 3:
    default:
      return 185 + textLines * 22;
  }
}

export const CommentsSection: React.FC<CommentsSectionProps> = ({
  comments,
  gradingSystem = 'numeric',
  editingTarget,
  onCloseModal,
  onSaveComment,
  onDeleteComment,
  onEditExistingComment,
  onCycleCardStyle,
  onShuffleAllStyles,
}) => {
  const [text, setText] = useState('');
  const [cardStyle, setCardStyle] = useState<CommentCardStyle>(1);
  const [error, setError] = useState('');
  const [columnCount, setColumnCount] = useState<number>(4);

  useEffect(() => {
    const updateColumns = () => {
      const w = window.innerWidth;
      if (w < 680) setColumnCount(1);
      else if (w < 1024) setColumnCount(2);
      else if (w < 1340) setColumnCount(3);
      else setColumnCount(4);
    };
    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, []);

  useEffect(() => {
    if (editingTarget) {
      const existing = comments.find(c => c.animeId === editingTarget.anime.id);
      if (existing) {
        setText(existing.text);
        setCardStyle(existing.cardStyle);
      } else {
        setText('');
        const nextStyle = (((comments.length % 6) + 1) as CommentCardStyle);
        setCardStyle(nextStyle);
      }
      setError('');
    }
  }, [editingTarget, comments]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTarget) return;
    const trimmed = text.trim();
    if (!trimmed) {
      setError('请输入你的观看短评内容');
      return;
    }
    onSaveComment({
      animeId: editingTarget.anime.id,
      animeTitle: editingTarget.anime.title,
      animeCover: editingTarget.anime.cover,
      tierScore: editingTarget.score,
      text: trimmed,
      cardStyle,
    });
    onCloseModal();
  };

  // Distribute comments into shortest masonry columns so heights stagger organically
  const masonryColumns = useMemo(() => {
    const cols: CommentItem[][] = Array.from({ length: columnCount }, () => []);
    const heights: number[] = Array.from({ length: columnCount }, () => 0);

    for (const item of comments) {
      let shortestIdx = 0;
      for (let i = 1; i < columnCount; i++) {
        if (heights[i] < heights[shortestIdx]) {
          shortestIdx = i;
        }
      }
      cols[shortestIdx].push(item);
      heights[shortestIdx] += estimateCardHeight(item) + 20;
    }
    return cols;
  }, [comments, columnCount]);

  const renderCard = (comment: CommentItem) => {
    // Top-right floating action bar (never overlaps bottom paragraph text or triggers backdrop-filter tile glitches)
    const actionsOverlay = (
      <div className="absolute top-3 right-3 z-30 flex items-center gap-1 px-1.5 py-1 rounded-full bg-zinc-950/92 border border-white/15 shadow-lg opacity-0 group-hover/comment:opacity-100 transition-opacity duration-200">
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onCycleCardStyle(comment.id);
          }}
          aria-label={`切换 ${comment.animeTitle} 卡片样式`}
          title={`切换卡片样式 (当前样式 #${comment.cardStyle})`}
          className="p-1.5 rounded-full hover:bg-white hover:text-zinc-950 text-white/85 transition-colors cursor-pointer"
        >
          <Wand2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onEditExistingComment(comment);
          }}
          aria-label={`编辑 ${comment.animeTitle} 评论`}
          title="编辑短评 / 选择样式"
          className="p-1.5 rounded-full hover:bg-white hover:text-zinc-950 text-white/85 transition-colors cursor-pointer"
        >
          <Edit3 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onDeleteComment(comment.id);
          }}
          aria-label={`删除 ${comment.animeTitle} 评论`}
          title="删除短评"
          className="p-1.5 rounded-full hover:bg-rose-500 text-white/85 transition-colors cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    );

    // Full-bleed Cover Color-Bleed Gradient Base (single GPU-safe blurred layer without mix-blend-screen tile bugs)
    const renderColorBleedBackdrop = (direction: 'left-text' | 'right-text' | 'bottom-text' | 'top-text') => {
      const gradientCss =
        direction === 'left-text'
          ? 'linear-gradient(100deg, rgba(14, 15, 22, 0.90) 0%, rgba(16, 18, 26, 0.74) 46%, rgba(12, 13, 18, 0.28) 100%)'
          : direction === 'right-text'
          ? 'linear-gradient(260deg, rgba(14, 15, 22, 0.90) 0%, rgba(16, 18, 26, 0.74) 46%, rgba(12, 13, 18, 0.28) 100%)'
          : direction === 'bottom-text'
          ? 'linear-gradient(0deg, rgba(13, 14, 20, 0.92) 0%, rgba(15, 16, 23, 0.76) 48%, rgba(12, 13, 18, 0.22) 100%)'
          : 'linear-gradient(180deg, rgba(13, 14, 20, 0.92) 0%, rgba(15, 16, 23, 0.76) 48%, rgba(12, 13, 18, 0.22) 100%)';

      return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 bg-[#10121a]">
          <img
            src={comment.animeCover}
            alt=""
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover scale-150 blur-[36px] opacity-85 saturate-[2.0]"
          />
          <div className="absolute inset-0" style={{ background: gradientCss }} />
        </div>
      );
    };

    // Sculpted Giant Corner Watermark Number
    const renderWatermarkScore = (position: 'top-right' | 'top-left' | 'bottom-left' = 'top-right') => {
      const posClass =
        position === 'top-left'
          ? '-top-2.5 left-3.5'
          : position === 'bottom-left'
          ? '-bottom-3 left-3.5'
          : '-top-2.5 right-3.5';
      const displayScore = formatTierLabel(comment.tierScore, gradingSystem);
      return (
        <span
          aria-hidden="true"
          className={`absolute ${posClass} text-[68px] font-black leading-none tracking-tighter select-none pointer-events-none tabular-nums z-10 bg-gradient-to-b from-white/[0.26] via-white/[0.10] to-transparent bg-clip-text text-transparent drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)] group-hover/comment:opacity-20 transition-opacity`}
        >
          {displayScore}
        </span>
      );
    };

    // Clean, unboxed editorial score kicker
    const renderScoreKicker = () => {
      const displayScore = formatTierLabel(comment.tierScore, gradingSystem);
      return (
        <div className="inline-flex items-center gap-1.5 text-[11px] font-mono tracking-wider uppercase text-white/70 mb-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/80 shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
          <span className="font-bold text-white">
            {gradingSystem === 'letter' ? `TIER ${displayScore}` : `SCORE ${displayScore}`}
          </span>
          <span className="text-white/35">·</span>
          <span className="text-white/50">REVIEW</span>
        </div>
      );
    };

    // Style 1: Right Cover Feathered Seamlessly into Left Cover-Tinted Gradient
    if (comment.cardStyle === 1) {
      return (
        <article
          key={comment.id}
          data-testid={`comment-card-${comment.id}`}
          className="group/comment relative isolate rounded-[24px] overflow-hidden bg-[#10121a] shadow-[0_18px_44px_rgba(0,0,0,0.5)] transition-transform duration-300 hover:-translate-y-1 min-h-[215px]"
        >
          {renderColorBleedBackdrop('left-text')}
          {actionsOverlay}
          {renderWatermarkScore('top-right')}

          {/* Right 64% Cover feathered smoothly to the left + subtle top/bottom edge vignette so top cover logos never slice harshly */}
          <div className="absolute inset-y-0 right-0 w-[64%] z-0 pointer-events-none overflow-hidden">
            <img
              src={comment.animeCover}
              alt={comment.animeTitle}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-center scale-[1.12] origin-bottom mask-fade-left opacity-95 transition-transform duration-700 group-hover/comment:scale-[1.16]"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(180deg, rgba(14, 15, 22, 0.42) 0%, transparent 16%, transparent 84%, rgba(14, 15, 22, 0.45) 100%)',
              }}
            />
          </div>

          {/* Left Editorial Typography */}
          <div className="relative z-10 p-5 pb-6 pr-[35%] flex flex-col justify-between min-h-[215px]">
            <div>
              {renderScoreKicker()}
              <h3 className="text-[18px] font-extrabold text-white leading-snug tracking-tight mb-2.5 drop-shadow-[0_2px_12px_rgba(0,0,0,0.75)]">
                {comment.animeTitle}
              </h3>
              <p className="text-[13.5px] leading-[1.72] text-white/90 font-normal m-0 break-words drop-shadow-[0_1px_8px_rgba(0,0,0,0.85)]">
                {comment.text}
              </p>
            </div>
          </div>
        </article>
      );
    }

    // Style 2: Top Widescreen Cover Feathered Downward into Cover-Tinted Gradient + Top-Right Watermark
    if (comment.cardStyle === 2) {
      return (
        <article
          key={comment.id}
          data-testid={`comment-card-${comment.id}`}
          className="group/comment relative isolate rounded-[24px] overflow-hidden bg-[#10121a] shadow-[0_18px_44px_rgba(0,0,0,0.5)] transition-transform duration-300 hover:-translate-y-1"
        >
          {renderColorBleedBackdrop('bottom-text')}
          {actionsOverlay}
          {renderWatermarkScore('top-right')}

          {/* Top Full-Bleed Cover with smooth bottom alpha mask feathering */}
          <div className="relative w-full h-[180px] overflow-hidden z-0 pointer-events-none">
            <img
              src={comment.animeCover}
              alt={comment.animeTitle}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover mask-fade-bottom transition-transform duration-700 group-hover/comment:scale-105"
            />
          </div>

          {/* Seamless Editorial Text Container below */}
          <div className="relative z-10 px-5 pb-6 -mt-6">
            {renderScoreKicker()}
            <h3 className="text-[18px] font-extrabold text-white leading-snug tracking-tight mb-2 drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
              {comment.animeTitle}
            </h3>
            <p className="text-[13.5px] leading-[1.72] text-white/88 m-0 break-words">
              {comment.text}
            </p>
          </div>
        </article>
      );
    }

    // Style 3: Full-Bleed Cinema Backdrop + Rich Color Gradient + Top-Right Giant Watermark Score
    if (comment.cardStyle === 3) {
      return (
        <article
          key={comment.id}
          data-testid={`comment-card-${comment.id}`}
          className="group/comment relative isolate rounded-[24px] overflow-hidden bg-[#10121a] min-h-[215px] shadow-[0_18px_44px_rgba(0,0,0,0.55)] transition-transform duration-300 hover:-translate-y-1 flex flex-col justify-end"
        >
          {actionsOverlay}
          {renderWatermarkScore('top-right')}

          <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
            <img
              src={comment.animeCover}
              alt={comment.animeTitle}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover saturate-[1.2] transition-transform duration-700 group-hover/comment:scale-105"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(180deg, rgba(10, 11, 16, 0.32) 0%, rgba(12, 13, 19, 0.72) 48%, rgba(10, 11, 16, 0.95) 100%)',
              }}
            />
          </div>

          <div className="relative z-10 p-5 pb-6 pt-14 flex flex-col justify-end">
            {renderScoreKicker()}
            <h3 className="text-[18px] font-extrabold text-white leading-snug tracking-tight mb-2 drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
              {comment.animeTitle}
            </h3>
            <p className="text-[13.5px] leading-[1.72] text-white/90 m-0 break-words drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)]">
              {comment.text}
            </p>
          </div>
        </article>
      );
    }

    // Style 4: Left Uncut 2:3 Portrait Poster + Right Cover-Diffused Gradient + Top-Right Giant Watermark Score
    if (comment.cardStyle === 4) {
      return (
        <article
          key={comment.id}
          data-testid={`comment-card-${comment.id}`}
          className="group/comment relative isolate rounded-[24px] p-5 pb-6 overflow-hidden bg-[#10121a] shadow-[0_18px_44px_rgba(0,0,0,0.5)] transition-transform duration-300 hover:-translate-y-1"
        >
          {renderColorBleedBackdrop('right-text')}
          {actionsOverlay}
          {renderWatermarkScore('top-right')}

          <div className="relative z-10 flex items-start gap-4">
            <div className="relative w-[92px] aspect-[2/3] rounded-[14px] overflow-hidden shrink-0 shadow-[0_12px_28px_rgba(0,0,0,0.6)]">
              <img
                src={comment.animeCover}
                alt={comment.animeTitle}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover transition-transform duration-500 group-hover/comment:scale-105"
              />
            </div>

            <div className="flex-1 min-w-0 pr-3">
              {renderScoreKicker()}
              <h3 className="text-[17px] font-extrabold text-white mb-2 leading-snug tracking-tight">
                {comment.animeTitle}
              </h3>
              <p className="text-[13.5px] text-white/88 leading-[1.68] m-0 break-words">
                {comment.text}
              </p>
            </div>
          </div>
        </article>
      );
    }

    // Style 5: Top Color-Diffused Review + Giant Top-Right Watermark + Bottom Feathered Panorama
    if (comment.cardStyle === 5) {
      return (
        <article
          key={comment.id}
          data-testid={`comment-card-${comment.id}`}
          className="group/comment relative isolate rounded-[24px] overflow-hidden bg-[#10121a] shadow-[0_18px_44px_rgba(0,0,0,0.5)] transition-transform duration-300 hover:-translate-y-1"
        >
          {renderColorBleedBackdrop('top-text')}
          {actionsOverlay}
          {renderWatermarkScore('top-right')}

          <div className="relative z-10 p-5 pb-2 pr-10">
            {renderScoreKicker()}
            <h3 className="text-[18px] font-extrabold text-white leading-snug tracking-tight mb-2">
              {comment.animeTitle}
            </h3>
            <p className="text-[13.5px] leading-[1.72] text-white/88 m-0 break-words">
              {comment.text}
            </p>
          </div>

          {/* Bottom Full-Bleed Cover with smooth alpha mask fade-in from top */}
          <div className="relative z-0 w-full h-[155px] overflow-hidden -mt-3 pointer-events-none">
            <img
              src={comment.animeCover}
              alt={comment.animeTitle}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-center mask-fade-top opacity-95 transition-transform duration-700 group-hover/comment:scale-105"
            />
          </div>
        </article>
      );
    }

    // Style 6: Left Feathered Cover + Right Cover-Tinted Gradient + Top-Right Giant Watermark Score
    return (
      <article
        key={comment.id}
        data-testid={`comment-card-${comment.id}`}
        className="group/comment relative isolate rounded-[24px] overflow-hidden bg-[#10121a] shadow-[0_18px_44px_rgba(0,0,0,0.5)] transition-transform duration-300 hover:-translate-y-1 min-h-[215px]"
      >
        {renderColorBleedBackdrop('right-text')}
        {actionsOverlay}
        {renderWatermarkScore('top-right')}

        {/* Left 64% Cover feathered smoothly to the right + subtle top/bottom edge vignette */}
        <div className="absolute inset-y-0 left-0 w-[64%] z-0 pointer-events-none overflow-hidden">
          <img
            src={comment.animeCover}
            alt={comment.animeTitle}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-center scale-[1.12] origin-bottom mask-fade-right opacity-95 transition-transform duration-700 group-hover/comment:scale-[1.16]"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(16, 18, 26, 0.92) 0%, rgba(16, 18, 26, 0.35) 14%, transparent 26%, transparent 82%, rgba(16, 18, 26, 0.55) 100%)',
            }}
          />
        </div>

        <div className="relative z-10 p-5 pb-6 pl-[36%] pr-5 flex flex-col justify-between min-h-[215px]">
          <div>
            {renderScoreKicker()}
            <h3 className="text-[18px] font-extrabold text-white leading-snug tracking-tight mb-2.5 drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
              {comment.animeTitle}
            </h3>
            <p className="text-[13.5px] leading-[1.72] text-white/90 m-0 break-words drop-shadow-[0_1px_8px_rgba(0,0,0,0.85)]">
              {comment.text}
            </p>
          </div>
        </div>
      </article>
    );
  };

  return (
    <section id="comments" className="pt-8">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 mb-7 border-b border-white/[0.07]">
        <div>
          <p className="text-[11px] font-semibold tracking-widest uppercase text-white/40 mb-1.5">
            EDITORIAL MASONRY GALLERY · 封面色彩弥散渐变与不对称瀑布流
          </p>
          <h2 className="text-2xl sm:text-[26px] font-bold tracking-tight text-white">
            我的主观漫评
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs text-white/40 hidden sm:inline">
            悬停卡片右下角魔棒可单独切换 6 种无痕羽化渐变构图
          </span>
          {comments.length > 0 && (
            <button
              type="button"
              data-testid="shuffle-comment-styles-btn"
              onClick={onShuffleAllStyles}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-medium text-white transition-colors cursor-pointer"
            >
              <Dices className="w-3.5 h-3.5" />
              <span>随机混排卡片构图</span>
            </button>
          )}
        </div>
      </div>

      {comments.length === 0 ? (
        <div className="py-14 px-6 text-center rounded-[22px] apple-glass-panel">
          <Quote className="w-8 h-8 text-white/25 mx-auto mb-3" />
          <p className="text-sm font-medium text-white/75 mb-1">
            还没有添加主观短评
          </p>
          <p className="text-xs text-white/45">
            将鼠标悬停在上方排行榜的任意封面上，点击「写短评」图标即可生成封面渐变漫评卡
          </p>
        </div>
      ) : (
        /* True Multi-Column Asymmetric Masonry Waterfall */
        <div
          data-testid="comments-masonry-waterfall"
          className="flex items-start gap-5 w-full"
        >
          {masonryColumns.map((colItems, colIdx) => (
            <div
              key={colIdx}
              className="flex-1 min-w-0 flex flex-col gap-5"
            >
              {colItems.map(comment => renderCard(comment))}
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Comment Modal with 6 Feathering Card Style Picker */}
      {editingTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="comment-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
          onClick={onCloseModal}
        >
          <div
            className="w-full max-w-xl rounded-[24px] bg-[#111114] border border-white/[0.1] shadow-[0_24px_80px_rgba(0,0,0,0.85)] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07] bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <img
                  src={editingTarget.anime.cover}
                  alt={editingTarget.anime.title}
                  referrerPolicy="no-referrer"
                  className="w-9 h-12 rounded-lg object-cover border border-white/10"
                />
                <div>
                  <h3 id="comment-modal-title" className="text-sm font-bold text-white">
                    {editingTarget.anime.title}
                  </h3>
                  <span className="text-xs text-white/55 font-mono">
                    当前评分: {editingTarget.score} 分
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onCloseModal}
                aria-label="关闭评论窗口"
                className="p-1.5 text-white/50 hover:text-white hover:bg-white/[0.08] rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="px-3.5 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-white/75 mb-2">
                  选择卡片构图（6 种无痕封面色彩羽化渐变样式）
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {CARD_STYLE_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setCardStyle(opt.id)}
                      className={`flex items-start gap-2 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        cardStyle === opt.id
                          ? 'bg-white text-zinc-950 border-white shadow-sm'
                          : 'bg-white/[0.04] border-white/[0.08] text-white/85 hover:bg-white/[0.08]'
                      }`}
                    >
                      <div className={`mt-0.5 shrink-0 ${cardStyle === opt.id ? 'text-zinc-950' : 'text-white/70'}`}>
                        {opt.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">{opt.name}</div>
                        <div
                          className={`text-[10.5px] mt-0.5 leading-tight line-clamp-2 ${
                            cardStyle === opt.id ? 'text-zinc-700' : 'text-white/45'
                          }`}
                        >
                          {opt.desc}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="comment-textarea"
                  className="block text-xs font-medium text-white/75 mb-1.5"
                >
                  个人短评 / 吐槽感想
                </label>
                <textarea
                  id="comment-textarea"
                  rows={4}
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="写下你对这部作品的作画、演出、音乐或名场面的评价..."
                  className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/35 leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={onCloseModal}
                  className="px-4 py-2 rounded-full text-xs font-medium text-white/70 hover:bg-white/[0.08] transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-xs font-semibold text-zinc-950 bg-white hover:bg-zinc-200 transition-colors cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>保存评论卡片</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
