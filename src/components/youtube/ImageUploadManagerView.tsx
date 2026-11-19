import { useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react';
import type { YouTubeTranslations } from '../../i18n/ytTranslations';
import { formatFileSize } from '../../lib/formatters';
import { ytApi } from '../../lib/ytApi';
import type { YouTubeProject } from '../../types/youtube';

interface ImageUploadManagerViewProps {
  project: YouTubeProject;
  onProjectChange: (next: YouTubeProject) => void;
  yt: YouTubeTranslations;
}

interface UploadLogItem {
  name: string;
  progress: number;
  status: 'uploading' | 'matched' | 'unassigned' | 'error';
  detail: string;
}

export function ImageUploadManagerView({
  project,
  onProjectChange,
  yt,
}: ImageUploadManagerViewProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadLogs, setUploadLogs] = useState<UploadLogItem[]>([]);
  const [filterMode, setFilterMode] = useState<'all' | 'missing' | 'uploaded'>('all');
  const [manualTargets, setManualTargets] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const bulkInputRef = useRef<HTMLInputElement | null>(null);
  const singleInputRef = useRef<HTMLInputElement | null>(null);
  const singleTargetSceneRef = useRef<string | null>(null);

  const scenes = project.scenes || [];
  const uploadedCount = scenes.filter((s) => s.uploadStatus === 'uploaded').length;
  const missingScenes = scenes.filter((s) => s.uploadStatus === 'missing');
  const unassigned = project.unassignedImages || [];

  const visibleScenes = scenes.filter((s) => {
    if (filterMode === 'missing') return s.uploadStatus === 'missing';
    if (filterMode === 'uploaded') return s.uploadStatus === 'uploaded';
    return true;
  });

  const handleBulkFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => /\.(png|jpe?g|webp)$/i.test(f.name));
    if (list.length === 0) {
      setError('Select valid PNG, JPG, or WebP image files.');
      return;
    }

    setError(null);
    setUploading(true);
    setUploadLogs(
      list.map((f) => ({
        name: f.name,
        progress: 0,
        status: 'uploading',
        detail: 'Waiting...',
      }))
    );

    let latestProject = project;
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      try {
        const res = await ytApi.uploadSceneImage(project.id, file, {
          onProgress: (pct) => {
            setUploadLogs((prev) =>
              prev.map((item, idx) =>
                idx === i ? { ...item, progress: pct, detail: `Uploading ${pct}%` } : item
              )
            );
          },
        });
        latestProject = res.project;
        onProjectChange(latestProject);

        const dupNote = res.duplicateOfSceneNumber
          ? ` (duplicate of Scene #${res.duplicateOfSceneNumber})`
          : '';
        setUploadLogs((prev) =>
          prev.map((item, idx) =>
            idx === i
              ? {
                  ...item,
                  progress: 100,
                  status: res.matchedSceneId ? 'matched' : 'unassigned',
                  detail: res.matchedSceneNumber
                    ? `Matched Scene #${res.matchedSceneNumber}${dupNote}`
                    : `Needs manual assignment${dupNote}`,
                }
              : item
          )
        );
      } catch (err) {
        setUploadLogs((prev) =>
          prev.map((item, idx) =>
            idx === i
              ? {
                  ...item,
                  status: 'error',
                  detail: err instanceof Error ? err.message : 'Upload failed',
                }
              : item
          )
        );
      }
    }

    setUploading(false);
  };

  const handleSingleUpload = async (file: File, sceneId: string) => {
    setError(null);
    try {
      const res = await ytApi.uploadSceneImage(project.id, file, { sceneId });
      onProjectChange(res.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image replacement failed.');
    }
  };

  const handleAssignManual = async (unassignedId: string) => {
    const sceneId = manualTargets[unassignedId] || missingScenes[0]?.id;
    if (!sceneId) return;
    setError(null);
    try {
      const res = await ytApi.assignUnassignedImage(project.id, unassignedId, sceneId);
      onProjectChange(res.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to assign image.');
    }
  };

  return (
    <div className="space-y-6">
      <input
        ref={bulkInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          if (e.target.files?.length) handleBulkFiles(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />
      <input
        ref={singleInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          const scId = singleTargetSceneRef.current;
          e.target.value = '';
          if (f && scId) handleSingleUpload(f, scId);
        }}
        className="hidden"
      />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {yt.nav['yt-uploads']}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
            <span>
              {uploadedCount}/{scenes.length} scenes covered
            </span>
            <span aria-hidden="true">·</span>
            <span>{missingScenes.length} missing</span>
            <span aria-hidden="true">·</span>
            <span>{unassigned.length} unassigned</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => bulkInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          <span>Select Images to Upload</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Drag and Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) {
            handleBulkFiles(e.dataTransfer.files);
          }
        }}
        onClick={() => bulkInputRef.current?.click()}
        className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
          dragging
            ? 'border-indigo-400 bg-indigo-500/10'
            : 'border-white/15 bg-[#0c101b] hover:border-indigo-400/50'
        }`}
      >
        <Upload className="w-8 h-8 text-indigo-400 mx-auto mb-2.5" />
        <p className="text-sm font-medium text-white">
          Drag & drop multiple scene images here, or click to browse
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Numbered filenames like <code className="font-mono text-indigo-300">scene_001.png</code>,{' '}
          <code className="font-mono text-indigo-300">scene_002.jpg</code> automatically match their scenes. Unclear filenames go to the manual assignment queue below.
        </p>
      </div>

      {/* Upload Batch Progress Log */}
      {uploadLogs.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-4 space-y-2 max-h-52 overflow-y-auto">
          <div className="text-xs font-semibold text-white">Recent Upload Matching Results</div>
          {uploadLogs.map((log, i) => (
            <div key={i} className="flex items-center justify-between gap-3 text-xs">
              <span className="font-mono text-slate-200 truncate">{log.name}</span>
              <span
                className={
                  log.status === 'matched'
                    ? 'text-emerald-300'
                    : log.status === 'unassigned'
                      ? 'text-amber-300'
                      : log.status === 'error'
                        ? 'text-rose-300'
                        : 'text-indigo-300'
                }
              >
                {log.detail}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Manual Assignment Queue for Unconfident Filenames */}
      {unassigned.length > 0 && (
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/[0.07] p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>Unassigned Images Requiring Manual Scene Selection ({unassigned.length})</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {unassigned.map((img) => (
              <div
                key={img.id}
                className="rounded-lg border border-white/10 bg-[#070910] p-3 flex items-center gap-3"
              >
                <img
                  src={img.imageUrl}
                  alt={img.originalName}
                  className="w-20 h-14 object-cover rounded border border-white/10 shrink-0"
                />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="text-xs font-mono text-white truncate">{img.originalName}</div>
                  <div className="text-[11px] text-amber-300 truncate">{img.reason}</div>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={manualTargets[img.id] || missingScenes[0]?.id || scenes[0]?.id || ''}
                      onChange={(e) =>
                        setManualTargets((prev) => ({ ...prev, [img.id]: e.target.value }))
                      }
                      className="flex-1 min-w-0 rounded border border-white/10 bg-[#0c101b] px-2 py-1 text-xs text-white"
                    >
                      {scenes.map((s) => (
                        <option key={s.id} value={s.id}>
                          Scene #{s.sceneNumber} {s.uploadStatus === 'missing' ? '(Missing)' : '(Replace)'}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleAssignManual(img.id)}
                      className="px-2.5 py-1 rounded bg-indigo-500 hover:bg-indigo-400 text-xs font-semibold text-white whitespace-nowrap"
                    >
                      Assign
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await ytApi.deleteUnassignedImage(project.id, img.id);
                        onProjectChange(res.project);
                      }}
                      className="p-1 rounded text-rose-300 hover:bg-rose-500/20"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scene Image Matrix */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#0c101b] border border-white/[0.08]">
          {(
            [
              ['all', `All Scenes (${scenes.length})`],
              ['missing', `Missing Images (${missingScenes.length})`],
              ['uploaded', `Uploaded (${uploadedCount})`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilterMode(k)}
              className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap ${
                filterMode === k ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleScenes.map((sc) => (
            <div
              key={sc.id}
              className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-3.5 space-y-2.5"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono font-semibold text-white">
                  scene_{String(sc.sceneNumber).padStart(3, '0')}
                </span>
                {sc.uploadStatus === 'uploaded' ? (
                  <span className="inline-flex items-center gap-1 text-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Uploaded</span>
                  </span>
                ) : (
                  <span className="text-amber-300">Missing</span>
                )}
              </div>

              <div className="aspect-video rounded-lg bg-[#070910] border border-white/[0.06] overflow-hidden flex items-center justify-center">
                {sc.image ? (
                  <img
                    src={sc.image.imageUrl}
                    alt={`Scene ${sc.sceneNumber}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImagePlus className="w-6 h-6 text-slate-600" />
                )}
              </div>

              {sc.image && (
                <div className="text-[11px] font-mono text-slate-400 truncate">
                  {sc.image.originalName} · {formatFileSize(sc.image.sizeBytes)}
                  {sc.image.width ? ` · ${sc.image.width}×${sc.image.height}` : ''}
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    singleTargetSceneRef.current = sc.id;
                    singleInputRef.current?.click();
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-slate-200"
                >
                  <ImagePlus className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{sc.image ? 'Replace' : 'Upload Image'}</span>
                </button>
                {sc.image && (
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await ytApi.deleteSceneImage(project.id, sc.id);
                      onProjectChange(res.project);
                    }}
                    className="p-1.5 rounded-lg border border-rose-500/25 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300"
                    title="Remove image"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
