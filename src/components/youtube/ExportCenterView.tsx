import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Film,
  Loader2,
  Play,
  Square,
} from 'lucide-react';
import type { YouTubeTranslations } from '../../i18n/ytTranslations';
import { formatFileSize } from '../../lib/formatters';
import { ytApi } from '../../lib/ytApi';
import { downloadRemoteBinaryFile, formatShortClock } from '../../lib/ytExport';
import type {
  QualityPreset,
  VideoFps,
  VideoResolution,
  YouTubeProject,
} from '../../types/youtube';

interface ExportCenterViewProps {
  project: YouTubeProject;
  renderActive: boolean;
  onRefreshProject: () => Promise<void>;
  yt: YouTubeTranslations;
}

export function ExportCenterView({
  project,
  renderActive,
  onRefreshProject,
  yt,
}: ExportCenterViewProps) {
  const [resolution, setResolution] = useState<VideoResolution>(project.settings.resolution || '1080p');
  const [fps, setFps] = useState<VideoFps>(project.settings.fps || 30);
  const [qualityPreset, setQualityPreset] = useState<QualityPreset>(
    project.settings.qualityPreset || 'balanced'
  );
  const [embeddedSubtitles, setEmbeddedSubtitles] = useState(
    project.subtitles.enabled && project.subtitles.embedded
  );
  const [starting, setStarting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const job = project.activeRenderJob;
  const isJobActive =
    renderActive || job?.status === 'running' || job?.status === 'queued';

  // Poll render status automatically while a render job is active
  useEffect(() => {
    if (!isJobActive) return;
    const timer = setInterval(() => {
      onRefreshProject().catch(() => undefined);
    }, 1500);
    return () => clearInterval(timer);
  }, [isJobActive, onRefreshProject]);

  const missingCount = project.scenes.filter(
    (s) => s.uploadStatus !== 'uploaded' || !s.image
  ).length;
  const canRender =
    Boolean(project.voiceover.audioFileName) &&
    project.scenes.length > 0 &&
    missingCount === 0 &&
    !isJobActive;

  const latestExport = project.exports[0] || null;

  const handleStartRender = async () => {
    setError(null);
    setStarting(true);
    try {
      await ytApi.startRender(project.id, {
        resolution,
        fps,
        qualityPreset,
        embeddedSubtitles,
      });
      await onRefreshProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start video render.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {yt.nav['yt-export']}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Assemble cinematic motion clips, transitions, auto-ducked audio mix, and subtitles into a verified H.264 MP4 video.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {isJobActive ? (
            <button
              type="button"
              onClick={async () => {
                await ytApi.cancelRender(project.id);
                await onRefreshProject();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Cancel Render</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartRender}
              disabled={!canRender || starting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap"
            >
              {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              <span>Render Final MP4 Video</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {missingCount > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            Upload all remaining scene images ({missingCount} missing) in Image Upload Manager before rendering the final MP4.
          </span>
        </div>
      )}

      {/* Render Configuration & Live Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 rounded-xl border border-white/[0.08] bg-[#0c101b] p-5 space-y-4">
          <div className="text-sm font-semibold text-white">MP4 Export Specifications</div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Format & Codec</label>
              <div className="rounded-lg border border-white/10 bg-[#070910] px-3 py-2 font-mono text-slate-200">
                MP4 · H.264 (libx264) · {project.settings.aspectRatio}
              </div>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Resolution</label>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value as VideoResolution)}
                disabled={isJobActive}
                className="w-full rounded-lg border border-white/10 bg-[#070910] px-3 py-2 text-white"
              >
                <option value="1080p">1080p Full HD (1920×1080)</option>
                <option value="4k">4K Ultra HD (3840×2160)</option>
                <option value="720p">720p HD Fast (1280×720)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">Frame Rate</label>
                <select
                  value={fps}
                  onChange={(e) => setFps(Number(e.target.value) as VideoFps)}
                  disabled={isJobActive}
                  className="w-full rounded-lg border border-white/10 bg-[#070910] px-2.5 py-2 text-white"
                >
                  <option value={24}>24 FPS</option>
                  <option value={25}>25 FPS</option>
                  <option value={30}>30 FPS</option>
                  <option value={60}>60 FPS</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Quality Preset</label>
                <select
                  value={qualityPreset}
                  onChange={(e) => setQualityPreset(e.target.value as QualityPreset)}
                  disabled={isJobActive}
                  className="w-full rounded-lg border border-white/10 bg-[#070910] px-2.5 py-2 text-white"
                >
                  <option value="high">High Quality</option>
                  <option value="balanced">Balanced</option>
                  <option value="economy">Economy</option>
                </select>
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-slate-200 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={embeddedSubtitles}
                onChange={(e) => setEmbeddedSubtitles(e.target.checked)}
                disabled={isJobActive}
                className="accent-indigo-500 h-4 w-4"
              />
              <span>Embed Styled Subtitles into Video</span>
            </label>
          </div>

          {job && (
            <div className="pt-4 border-t border-white/[0.06] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-white">
                  {job.status === 'running'
                    ? 'Rendering...'
                    : job.status === 'completed'
                      ? 'Render Completed'
                      : job.status === 'failed'
                        ? 'Render Failed'
                        : 'Render Cancelled'}
                </span>
                <span className="font-mono tabular-nums text-indigo-300">{job.percent}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    job.status === 'failed'
                      ? 'bg-rose-500'
                      : job.status === 'completed'
                        ? 'bg-emerald-500'
                        : 'bg-indigo-500'
                  }`}
                  style={{ width: `${job.percent}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400">{job.error || job.message}</p>
            </div>
          )}
        </div>

        {/* Verified Final Video Preview & Exports List */}
        <div className="lg:col-span-8 space-y-5">
          {latestExport ? (
            <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Verified Final MP4 Output</span>
                </div>
                <div className="text-xs font-mono tabular-nums text-slate-400">
                  {latestExport.width}×{latestExport.height} · {latestExport.fps} FPS ·{' '}
                  {formatShortClock(latestExport.durationSeconds * 1000)} ·{' '}
                  {formatFileSize(latestExport.fileSizeBytes)}
                </div>
              </div>

              <video
                key={latestExport.videoUrl}
                controls
                src={latestExport.videoUrl}
                className="w-full aspect-video rounded-lg bg-black border border-white/10"
              />

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  {latestExport.srtUrl && (
                    <a
                      href={latestExport.srtUrl}
                      download
                      className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-mono text-slate-200"
                    >
                      Download SRT
                    </a>
                  )}
                  {latestExport.vttUrl && (
                    <a
                      href={latestExport.vttUrl}
                      download
                      className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-mono text-slate-200"
                    >
                      Download VTT
                    </a>
                  )}
                </div>

                <button
                  type="button"
                  disabled={downloadingId === latestExport.id}
                  onClick={async () => {
                    setDownloadingId(latestExport.id);
                    try {
                      await downloadRemoteBinaryFile(
                        latestExport.downloadUrl,
                        latestExport.fileName
                      );
                    } finally {
                      setDownloadingId(null);
                    }
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-xs font-semibold text-white"
                >
                  {downloadingId === latestExport.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>Download MP4 ({formatFileSize(latestExport.fileSizeBytes)})</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-12 text-center space-y-2">
              <Film className="w-10 h-10 text-indigo-400 mx-auto" />
              <div className="text-base font-semibold text-white">No Rendered MP4 Yet</div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Click <strong>Render Final MP4 Video</strong> when all scene images are uploaded. Only verified playable MP4 files appear here for download.
              </p>
            </div>
          )}

          {project.exports.length > 1 && (
            <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-5 space-y-2">
              <div className="text-xs font-semibold text-white">Export History</div>
              <div className="divide-y divide-white/[0.06] text-xs">
                {project.exports.map((ex) => (
                  <div key={ex.id} className="py-2 flex items-center justify-between gap-3">
                    <span className="font-mono text-slate-200 truncate">{ex.fileName}</span>
                    <span className="font-mono tabular-nums text-slate-400 shrink-0">
                      {ex.resolution} · {ex.fps}fps · {formatFileSize(ex.fileSizeBytes)}
                    </span>
                    <button
                      type="button"
                      onClick={() => downloadRemoteBinaryFile(ex.downloadUrl, ex.fileName)}
                      className="text-indigo-300 hover:text-indigo-200 font-medium shrink-0"
                    >
                      Download
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
