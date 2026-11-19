import { useState } from 'react';
import { Captions, Download, Sparkles } from 'lucide-react';
import type { YouTubeTranslations } from '../../i18n/ytTranslations';
import { formatShortClock } from '../../lib/ytExport';
import type {
  SubtitleAnimation,
  SubtitlePosition,
  SubtitleStyle,
  YouTubeProject,
} from '../../types/youtube';

interface SubtitleStudioViewProps {
  project: YouTubeProject;
  onProjectChange: (next: YouTubeProject) => void;
  onSavePatch: (patch: Partial<YouTubeProject>) => Promise<void>;
  yt: YouTubeTranslations;
}

const FONT_FAMILIES = [
  'Noto Sans',
  'Noto Sans Arabic',
  'Noto Kufi Arabic',
  'DejaVu Sans',
  'Liberation Sans',
  'JetBrains Mono',
];

export function SubtitleStudioView({
  project,
  onProjectChange,
  onSavePatch,
  yt,
}: SubtitleStudioViewProps) {
  const [previewCueIdx, setPreviewCueIdx] = useState(0);

  const sub = project.subtitles;
  const cues = project.voiceover.cues || [];
  const sampleImage = project.scenes.find((s) => s.image)?.image?.imageUrl;
  const sampleCue = cues[previewCueIdx] || cues[0];
  const sampleText =
    sampleCue?.text || 'Synchronized subtitles appear here with your selected typography and highlight style.';

  const updateStyle = async (patch: Partial<SubtitleStyle>) => {
    const next = { ...sub, ...patch };
    onProjectChange({ ...project, subtitles: next });
    await onSavePatch({ subtitles: next });
  };

  const updateCueText = async (index: number, text: string) => {
    const nextCues = cues.map((c, i) => (i === index ? { ...c, text } : c));
    const nextVo = { ...project.voiceover, cues: nextCues };
    onProjectChange({ ...project, voiceover: nextVo });
    await onSavePatch({ voiceover: nextVo });
  };

  // Highlight first long word in preview if enabled
  const renderHighlightedPreview = (txt: string) => {
    if (!sub.highlightKeywords) return txt;
    let highlighted = false;
    return txt.split(' ').map((word, idx) => {
      const clean = word.replace(/[^\p{L}\p{N}]/gu, '');
      if (!highlighted && clean.length >= 6) {
        highlighted = true;
        return (
          <span key={idx} style={{ color: sub.highlightColor }}>
            {word}{' '}
          </span>
        );
      }
      return <span key={idx}>{word} </span>;
    });
  };

  const posClass =
    sub.position === 'top'
      ? 'items-start pt-6'
      : sub.position === 'middle'
        ? 'items-center'
        : 'items-end pb-6';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {yt.nav['yt-subtitles']}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Customize subtitle typography, positioning, keyword highlighting, and export synchronized SRT/VTT tracks.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`/api/yt/projects/${encodeURIComponent(project.id)}/subtitles/export/srt`}
            download
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/10 bg-[#0c101b] hover:bg-white/[0.06] text-xs font-mono font-semibold text-slate-200 ${
              cues.length === 0 ? 'pointer-events-none opacity-40' : ''
            }`}
          >
            <Download className="w-3.5 h-3.5 text-indigo-400" />
            <span>Export SRT</span>
          </a>
          <a
            href={`/api/yt/projects/${encodeURIComponent(project.id)}/subtitles/export/vtt`}
            download
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/10 bg-[#0c101b] hover:bg-white/[0.06] text-xs font-mono font-semibold text-slate-200 ${
              cues.length === 0 ? 'pointer-events-none opacity-40' : ''
            }`}
          >
            <Download className="w-3.5 h-3.5 text-indigo-400" />
            <span>Export VTT</span>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Style Controls */}
        <div className="lg:col-span-5 rounded-xl border border-white/[0.08] bg-[#0c101b] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-white">
              <Captions className="w-4 h-4 text-indigo-400" />
              <span>Subtitle Styling & Embedding</span>
            </span>
          </div>

          <div className="flex flex-wrap gap-4 pb-3 border-b border-white/[0.06]">
            <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={sub.enabled}
                onChange={(e) => updateStyle({ enabled: e.target.checked })}
                className="accent-indigo-500 h-4 w-4"
              />
              <span>Enable Subtitles</span>
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={sub.embedded}
                onChange={(e) => updateStyle({ embedded: e.target.checked })}
                className="accent-indigo-500 h-4 w-4"
              />
              <span>Embed into Final MP4</span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Font Family</label>
              <select
                value={sub.fontFamily}
                onChange={(e) => updateStyle({ fontFamily: e.target.value })}
                className="w-full rounded-lg border border-white/10 bg-[#070910] px-2.5 py-2 text-xs text-white"
              >
                {FONT_FAMILIES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Font Weight</label>
              <select
                value={sub.fontWeight}
                onChange={(e) =>
                  updateStyle({ fontWeight: e.target.value as 'normal' | 'bold' })
                }
                className="w-full rounded-lg border border-white/10 bg-[#070910] px-2.5 py-2 text-xs text-white"
              >
                <option value="bold">Bold</option>
                <option value="normal">Regular</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Font Size</span>
                <span className="font-mono text-white">{sub.fontSize}px</span>
              </div>
              <input
                type="range"
                min={24}
                max={72}
                step={2}
                value={sub.fontSize}
                onChange={(e) => updateStyle({ fontSize: Number(e.target.value) })}
                className="studio-range w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Outline Width</span>
                <span className="font-mono text-white">{sub.outlineWidth}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={6}
                step={1}
                value={sub.outlineWidth}
                onChange={(e) => updateStyle({ outlineWidth: Number(e.target.value) })}
                className="studio-range w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Text Color</label>
              <input
                type="color"
                value={sub.textColor}
                onChange={(e) => updateStyle({ textColor: e.target.value })}
                className="w-full h-9 rounded border border-white/10 bg-[#070910] cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Outline Color</label>
              <input
                type="color"
                value={sub.outlineColor}
                onChange={(e) => updateStyle({ outlineColor: e.target.value })}
                className="w-full h-9 rounded border border-white/10 bg-[#070910] cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Background</label>
              <input
                type="color"
                value={sub.backgroundColor}
                onChange={(e) => updateStyle({ backgroundColor: e.target.value })}
                className="w-full h-9 rounded border border-white/10 bg-[#070910] cursor-pointer"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">Box Opacity</span>
              <span className="font-mono text-white">
                {Math.round(sub.backgroundOpacity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={sub.backgroundOpacity}
              onChange={(e) => updateStyle({ backgroundOpacity: Number(e.target.value) })}
              className="studio-range w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Position</label>
              <select
                value={sub.position}
                onChange={(e) => updateStyle({ position: e.target.value as SubtitlePosition })}
                className="w-full rounded-lg border border-white/10 bg-[#070910] px-2.5 py-2 text-xs text-white"
              >
                <option value="bottom">Bottom Safe Zone</option>
                <option value="middle">Center Frame</option>
                <option value="top">Top Frame</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Animation</label>
              <select
                value={sub.animation}
                onChange={(e) => updateStyle({ animation: e.target.value as SubtitleAnimation })}
                className="w-full rounded-lg border border-white/10 bg-[#070910] px-2.5 py-2 text-xs text-white"
              >
                <option value="fade">Smooth Fade</option>
                <option value="pop">Dynamic Pop</option>
                <option value="highlight">Keyword Focus</option>
                <option value="none">Static</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/[0.06]">
            <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={sub.highlightKeywords}
                onChange={(e) => updateStyle({ highlightKeywords: e.target.checked })}
                className="accent-indigo-500 h-4 w-4"
              />
              <span className="inline-flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Highlight Keywords
              </span>
            </label>
            <input
              type="color"
              value={sub.highlightColor}
              onChange={(e) => updateStyle({ highlightColor: e.target.value })}
              disabled={!sub.highlightKeywords}
              className="w-12 h-8 rounded border border-white/10 bg-[#070910] cursor-pointer"
            />
          </div>
        </div>

        {/* Live Subtitle Preview + Synchronized Cue Editor */}
        <div className="lg:col-span-7 space-y-5">
          <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-5 space-y-3">
            <div className="text-xs font-semibold text-white">Live Video Frame Preview</div>
            <div className="aspect-video rounded-lg overflow-hidden bg-[#06080f] border border-white/10 relative">
              {sampleImage ? (
                <img
                  src={sampleImage}
                  alt="Subtitle preview backdrop"
                  className="w-full h-full object-cover opacity-80"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-slate-900 via-[#0b1020] to-slate-950" />
              )}

              {sub.enabled && (
                <div className={`absolute inset-0 flex justify-center px-6 ${posClass}`}>
                  <div
                    dir="auto"
                    style={{
                      fontFamily: sub.fontFamily,
                      fontWeight: sub.fontWeight,
                      fontSize: `${Math.max(14, Math.round(sub.fontSize * 0.42))}px`,
                      color: sub.textColor,
                      backgroundColor: `rgba(${parseInt(sub.backgroundColor.slice(1, 3) || '07', 16)}, ${parseInt(sub.backgroundColor.slice(3, 5) || '09', 16)}, ${parseInt(sub.backgroundColor.slice(5, 7) || '10', 16)}, ${sub.backgroundOpacity})`,
                      textShadow:
                        sub.outlineWidth > 0
                          ? `0 0 ${sub.outlineWidth * 1.5}px ${sub.outlineColor}, 0 ${sub.shadowDepth}px 4px ${sub.outlineColor}`
                          : undefined,
                    }}
                    className="px-3.5 py-1.5 rounded-md text-center max-w-[85%] leading-snug"
                  >
                    {renderHighlightedPreview(sampleText)}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">
                Synchronized Subtitle Cues ({cues.length})
              </div>
              {project.voiceover.words && project.voiceover.words.length > 0 && (
                <span className="text-xs font-mono tabular-nums text-indigo-300">
                  {project.voiceover.words.length} word-level timestamps aligned
                </span>
              )}
            </div>

            {cues.length === 0 ? (
              <p className="text-xs text-slate-400">
                Generate and analyze your voiceover first to edit synchronized subtitle cues.
              </p>
            ) : (
              <div className="max-h-80 overflow-y-auto space-y-2 pe-1">
                {cues.map((cue, idx) => (
                  <div
                    key={cue.index}
                    onClick={() => setPreviewCueIdx(idx)}
                    className={`rounded-lg border p-2.5 flex items-center gap-3 cursor-pointer ${
                      previewCueIdx === idx
                        ? 'border-indigo-400/50 bg-indigo-500/10'
                        : 'border-white/[0.06] bg-[#070910]'
                    }`}
                  >
                    <span
                      dir="ltr"
                      className="text-[11px] font-mono tabular-nums text-indigo-300 shrink-0"
                    >
                      {formatShortClock(cue.startMs)} → {formatShortClock(cue.endMs)}
                    </span>
                    <input
                      type="text"
                      dir="auto"
                      value={cue.text}
                      onChange={(e) => updateCueText(idx, e.target.value)}
                      className="flex-1 bg-transparent text-xs text-slate-100 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
