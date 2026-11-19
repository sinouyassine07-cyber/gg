import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { TranscriptCue } from './transcriptEngine.ts';
import { getProjectSubdir, getProject, saveProject } from './ytStorage.ts';
import type {
  ActiveRenderJob,
  AspectRatio,
  AudioTrackAsset,
  ExportArtifact,
  MotionEffect,
  MotionIntensity,
  QualityPreset,
  SubtitleStyle,
  TransitionType,
  VideoFps,
  VideoResolution,
  YouTubeProject,
} from './ytTypes.ts';

const execFileAsync = promisify(execFile);

interface RenderControl {
  abortController: AbortController;
  cancelled: boolean;
}

const activeRenderJobs = new Map<string, RenderControl>();

export function isRenderRunning(projectId: string): boolean {
  return activeRenderJobs.has(projectId);
}

export function cancelRenderJob(projectId: string): boolean {
  const ctrl = activeRenderJobs.get(projectId);
  if (!ctrl) return false;
  ctrl.cancelled = true;
  ctrl.abortController.abort();
  return true;
}

export function getVideoDimensions(
  resolution: VideoResolution,
  aspectRatio: AspectRatio
): { width: number; height: number } {
  if (aspectRatio === '9:16') {
    if (resolution === '4k') return { width: 2160, height: 3840 };
    if (resolution === '1080p') return { width: 1080, height: 1920 };
    return { width: 720, height: 1280 };
  }
  if (aspectRatio === '1:1') {
    if (resolution === '4k') return { width: 2160, height: 2160 };
    if (resolution === '1080p') return { width: 1080, height: 1080 };
    return { width: 720, height: 720 };
  }
  // Default 16:9 YouTube landscape
  if (resolution === '4k') return { width: 3840, height: 2160 };
  if (resolution === '1080p') return { width: 1920, height: 1080 };
  return { width: 1280, height: 720 };
}

function getMotionZoomDelta(intensity: MotionIntensity): number {
  if (intensity === 'subtle') return 0.08;
  if (intensity === 'cinematic') return 0.22;
  return 0.14;
}

function buildMotionFilter(params: {
  effect: MotionEffect;
  intensity: MotionIntensity;
  disabled: boolean;
  width: number;
  height: number;
  fps: VideoFps;
  durationSec: number;
}): string {
  const { effect, intensity, disabled, width, height, fps, durationSec } = params;
  const frames = Math.max(2, Math.round(durationSec * fps));

  if (disabled || effect === 'static') {
    return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=${fps},format=yuv420p`;
  }

  const amp = getMotionZoomDelta(intensity);
  const ovW = width * 2;
  const ovH = height * 2;
  const maxZoom = (1 + amp).toFixed(3);
  const ampStr = amp.toFixed(3);
  const fDenom = Math.max(1, frames - 1);

  let zExpr = '1';
  let xExpr = 'iw/2-(iw/zoom/2)';
  let yExpr = 'ih/2-(ih/zoom/2)';

  switch (effect) {
    case 'slow-zoom-in':
      zExpr = `1+${ampStr}*on/${fDenom}`;
      xExpr = 'iw/2-(iw/zoom/2)';
      yExpr = 'ih/2-(ih/zoom/2)';
      break;
    case 'slow-zoom-out':
      zExpr = `${maxZoom}-${ampStr}*on/${fDenom}`;
      xExpr = 'iw/2-(iw/zoom/2)';
      yExpr = 'ih/2-(ih/zoom/2)';
      break;
    case 'pan-left':
      zExpr = maxZoom;
      xExpr = `(iw-iw/zoom)*(1-on/${fDenom})`;
      yExpr = '(ih-ih/zoom)/2';
      break;
    case 'pan-right':
      zExpr = maxZoom;
      xExpr = `(iw-iw/zoom)*(on/${fDenom})`;
      yExpr = '(ih-ih/zoom)/2';
      break;
    case 'pan-up':
      zExpr = maxZoom;
      xExpr = '(iw-iw/zoom)/2';
      yExpr = `(ih-ih/zoom)*(1-on/${fDenom})`;
      break;
    case 'pan-down':
      zExpr = maxZoom;
      xExpr = '(iw-iw/zoom)/2';
      yExpr = `(ih-ih/zoom)*(on/${fDenom})`;
      break;
    case 'ken-burns':
      zExpr = `1+${ampStr}*on/${fDenom}`;
      xExpr = `(iw-iw/zoom)*(0.25+0.45*on/${fDenom})`;
      yExpr = `(ih-ih/zoom)*(0.25+0.35*on/${fDenom})`;
      break;
    case 'diagonal-drift':
      zExpr = maxZoom;
      xExpr = `(iw-iw/zoom)*(on/${fDenom})`;
      yExpr = `(ih-ih/zoom)*(on/${fDenom})`;
      break;
    case 'cinematic-drift': {
      const baseZ = (1 + amp * 0.65).toFixed(3);
      const pulseZ = (amp * 0.35).toFixed(3);
      zExpr = `${baseZ}+${pulseZ}*sin(PI*on/${fDenom})`;
      xExpr = `(iw-iw/zoom)*(0.25+0.5*on/${fDenom})`;
      yExpr = `(ih-ih/zoom)*0.45`;
      break;
    }
  }

  return [
    `scale=${ovW}:${ovH}:force_original_aspect_ratio=increase`,
    `crop=${ovW}:${ovH}`,
    `setsar=1`,
    `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=${frames}:s=${width}x${height}:fps=${fps}`,
    `format=yuv420p`,
  ].join(',');
}

function mapXfadeTransition(type: TransitionType): string {
  switch (type) {
    case 'dissolve':
      return 'dissolve';
    case 'fade-black':
      return 'fadeblack';
    case 'cinematic-fade':
      return 'smoothleft';
    case 'crossfade':
    default:
      return 'fade';
  }
}

function hexToAssColor(hex: string, alphaPercent = 0): string {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const r = full.slice(0, 2).toUpperCase();
  const g = full.slice(2, 4).toUpperCase();
  const b = full.slice(4, 6).toUpperCase();
  const alphaByte = Math.max(0, Math.min(255, Math.round((alphaPercent / 100) * 255)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
  // ASS color format is &HAABBGGRR
  return `&H${alphaByte}${b}${g}${r}`;
}

function formatAssTime(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const h = Math.floor(safe / 3600000);
  const m = Math.floor((safe % 3600000) / 60000);
  const s = Math.floor((safe % 60000) / 1000);
  const cs = Math.floor((safe % 1000) / 10);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function formatSrtTime(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const h = Math.floor(safe / 3600000);
  const m = Math.floor((safe % 3600000) / 60000);
  const s = Math.floor((safe % 60000) / 1000);
  const rem = safe % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(rem).padStart(3, '0')}`;
}

function formatVttTime(ms: number): string {
  return formatSrtTime(ms).replace(',', '.');
}

function wrapSubtitleLines(text: string, maxChars: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const lines: string[] = [];
  let buf = '';
  for (const w of words) {
    const cand = buf ? `${buf} ${w}` : w;
    if (cand.length <= maxChars || !buf) {
      buf = cand;
    } else {
      lines.push(buf);
      buf = w;
    }
  }
  if (buf) lines.push(buf);
  return lines.slice(0, 3).join('\\N');
}

export function buildSrtContent(cues: TranscriptCue[]): string {
  return (
    cues
      .map((c, idx) => `${idx + 1}\n${formatSrtTime(c.startMs)} --> ${formatSrtTime(c.endMs)}\n${c.text}`)
      .join('\n\n') + '\n'
  );
}

export function buildVttContent(cues: TranscriptCue[]): string {
  return (
    'WEBVTT\n\n' +
    cues.map((c) => `${formatVttTime(c.startMs)} --> ${formatVttTime(c.endMs)}\n${c.text}`).join('\n\n') +
    '\n'
  );
}

export function buildAssSubtitleContent(params: {
  cues: TranscriptCue[];
  style: SubtitleStyle;
  width: number;
  height: number;
}): string {
  const { cues, style, width, height } = params;
  const alignment = style.position === 'top' ? 8 : style.position === 'middle' ? 5 : 2;
  const marginV = Math.round(height * (style.position === 'middle' ? 0.04 : 0.075));
  const scaledFontSize = Math.max(18, Math.round((style.fontSize || 44) * (height / 1080)));
  const primary = hexToAssColor(style.textColor || '#FFFFFF', 0);
  const secondary = hexToAssColor(style.highlightColor || '#FACC15', 0);
  const outline = hexToAssColor(style.outlineColor || '#000000', 0);
  const bgAlphaPct = Math.round((1 - Math.max(0, Math.min(1, style.backgroundOpacity ?? 0.45))) * 100);
  const backColor = hexToAssColor(style.backgroundColor || '#070910', bgAlphaPct);
  const borderStyle = (style.backgroundOpacity ?? 0) > 0.05 ? 3 : 1;

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${style.fontFamily || 'Noto Sans'},${scaledFontSize},${primary},${secondary},${outline},${backColor},${style.fontWeight === 'bold' ? -1 : 0},0,0,0,100,100,0,0,${borderStyle},${style.outlineWidth ?? 3},${style.shadowDepth ?? 2},${alignment},60,60,${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const highlightAss = hexToAssColor(style.highlightColor || '#FACC15', 0);
  const primaryAss = hexToAssColor(style.textColor || '#FFFFFF', 0);

  const events = cues.map((cue) => {
    let wrapped = wrapSubtitleLines(cue.text, style.maxCharsPerLine || 44)
      .replace(/\{/g, '(')
      .replace(/\}/g, ')');

    if (style.highlightKeywords) {
      // Highlight longest impactful word(s) > 6 chars when highlightKeywords is enabled
      const tokens = wrapped.split(' ');
      let highlightedOnce = false;
      wrapped = tokens
        .map((tok) => {
          const clean = tok.replace(/\\N/g, '').replace(/[^\p{L}\p{N}]/gu, '');
          if (!highlightedOnce && clean.length >= 7) {
            highlightedOnce = true;
            return `{\\c${highlightAss}}${tok}{\\c${primaryAss}}`;
          }
          return tok;
        })
        .join(' ');
    }

    const animTag =
      style.animation === 'fade'
        ? '{\\fad(120,120)}'
        : style.animation === 'pop'
          ? '{\\fscx92\\fscy92\\t(0,120,\\fscx100\\fscy100)}'
          : '';

    return `Dialogue: 0,${formatAssTime(cue.startMs)},${formatAssTime(cue.endMs)},Default,,0,0,0,,${animTag}${wrapped}`;
  });

  return [...header, ...events, ''].join('\n');
}

export async function generateBuiltinAmbientTrack(params: {
  projectId: string;
  preset: 'documentary-pad' | 'dark-tension' | 'warm-piano-drone';
}): Promise<AudioTrackAsset> {
  const musicDir = getProjectSubdir(params.projectId, 'music');
  await fsp.mkdir(musicDir, { recursive: true });
  const fileName = `ambient_${params.preset}_${crypto.randomUUID().slice(0, 6)}.mp3`;
  const outPath = path.join(musicDir, fileName);

  // Synthesize rich 30-second loopable ambient stereo beds natively with FFmpeg
  const exprMap: Record<typeof params.preset, { label: string; expr: string; filter: string }> = {
    'documentary-pad': {
      label: 'Documentary Warm Pad (Ambient)',
      expr: '0.18*sin(2*PI*110*t)+0.12*sin(2*PI*164.81*t)+0.10*sin(2*PI*220*t)+0.07*sin(2*PI*277.18*t)*(0.6+0.4*sin(2*PI*0.1*t))',
      filter: 'lowpass=f=650,aecho=0.8:0.85:60|90:0.35|0.25,afade=t=in:st=0:d=1.5,afade=t=out:st=28.5:d=1.5',
    },
    'dark-tension': {
      label: 'Dark Cinematic Tension Drone',
      expr: '0.22*sin(2*PI*55*t)+0.14*sin(2*PI*82.41*t)+0.09*sin(2*PI*116.54*t)*(0.5+0.5*sin(2*PI*0.2*t))',
      filter: 'lowpass=f=420,aecho=0.8:0.88:80:0.4,afade=t=in:st=0:d=1.5,afade=t=out:st=28.5:d=1.5',
    },
    'warm-piano-drone': {
      label: 'Reflective Narrative Underscore',
      expr: '0.16*sin(2*PI*130.81*t)+0.12*sin(2*PI*196.0*t)+0.09*sin(2*PI*246.94*t)+0.06*sin(2*PI*329.63*t)*(0.5+0.5*cos(2*PI*0.15*t))',
      filter: 'lowpass=f=850,aecho=0.8:0.82:50:0.3,afade=t=in:st=0:d=1.5,afade=t=out:st=28.5:d=1.5',
    },
  };

  const cfg = exprMap[params.preset];
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      `aevalsrc=${cfg.expr}:d=30:s=44100`,
      '-af',
      `${cfg.filter},aformat=channel_layouts=stereo`,
      '-c:a',
      'libmp3lame',
      '-b:a',
      '128k',
      outPath,
    ],
    { maxBuffer: 1024 * 1024 }
  );

  const stat = await fsp.stat(outPath);
  return {
    id: `trk_${crypto.randomUUID().slice(0, 8)}`,
    name: cfg.label,
    fileName,
    audioUrl: `/api/yt/projects/${params.projectId}/media/music/${fileName}`,
    durationMs: 30000,
    sizeBytes: stat.size,
    source: 'builtin-ambient',
  };
}

function getEncodingPresetArgs(preset: QualityPreset): { preset: string; crf: string } {
  if (preset === 'high') return { preset: 'medium', crf: '18' };
  if (preset === 'economy') return { preset: 'ultrafast', crf: '24' };
  return { preset: 'veryfast', crf: '21' };
}

async function runExecFfmpeg(args: string[], signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    throw new Error('Render cancelled.');
  }
  await execFileAsync('ffmpeg', args, { maxBuffer: 1024 * 1024 * 8, signal });
}

/**
 * Starts full background MP4 assembly for a YouTube project.
 * Renders cached per-scene Ken Burns clips -> batched xfade transitions -> subtitle burn-in -> audio mixing/ducking -> verified MP4.
 */
export function startBackgroundVideoRender(
  projectId: string,
  overrideOptions?: {
    resolution?: VideoResolution;
    fps?: VideoFps;
    qualityPreset?: QualityPreset;
    embeddedSubtitles?: boolean;
  }
): { jobId: string } {
  if (activeRenderJobs.has(projectId)) {
    throw Object.assign(new Error('A video render job is already running for this project.'), {
      status: 409,
    });
  }

  const jobId = `job_${crypto.randomUUID().slice(0, 10)}`;
  const ctrl: RenderControl = {
    abortController: new AbortController(),
    cancelled: false,
  };
  activeRenderJobs.set(projectId, ctrl);

  const updateJob = async (patch: Partial<ActiveRenderJob>) => {
    const latest = await getProject(projectId);
    if (!latest) return;
    const now = new Date().toISOString();
    latest.activeRenderJob = {
      jobId,
      status: 'running',
      phase: 'video_assembly',
      percent: 0,
      completedScenes: 0,
      totalScenes: latest.scenes.length,
      message: 'Preparing video assembly...',
      startedAt: latest.activeRenderJob?.startedAt || now,
      ...(latest.activeRenderJob || {}),
      ...patch,
      updatedAt: now,
    };
    await saveProject(latest);
  };

  void (async () => {
    const startMs = Date.now();
    try {
      const project = await getProject(projectId);
      if (!project) throw new Error('Project not found.');
      if (!project.voiceover.audioFileName || project.voiceover.durationMs <= 0) {
        throw new Error('Voiceover audio is required before rendering video.');
      }
      if (project.scenes.length === 0) {
        throw new Error('Planned scenes are required before rendering video.');
      }

      const missingImages = project.scenes.filter((s) => s.uploadStatus !== 'uploaded' || !s.image);
      if (missingImages.length > 0) {
        throw new Error(
          `${missingImages.length} scene(s) are still missing uploaded images (starting at Scene #${missingImages[0].sceneNumber}).`
        );
      }

      const resolution = overrideOptions?.resolution || project.settings.resolution || '1080p';
      const fps = overrideOptions?.fps || project.settings.fps || 30;
      const qualityPreset = overrideOptions?.qualityPreset || project.settings.qualityPreset || 'balanced';
      const embeddedSubtitles =
        overrideOptions?.embeddedSubtitles !== undefined
          ? overrideOptions.embeddedSubtitles
          : project.subtitles.enabled && project.subtitles.embedded;

      const { width, height } = getVideoDimensions(resolution, project.settings.aspectRatio);
      const { preset, crf } = getEncodingPresetArgs(qualityPreset);
      const signal = ctrl.abortController.signal;

      const cacheDir = getProjectSubdir(projectId, 'cache');
      const imagesDir = getProjectSubdir(projectId, 'images');
      const audioDir = getProjectSubdir(projectId, 'audio');
      const musicDir = getProjectSubdir(projectId, 'music');
      const sfxDir = getProjectSubdir(projectId, 'sfx');
      const exportsDir = getProjectSubdir(projectId, 'exports');
      await Promise.all([
        fsp.mkdir(cacheDir, { recursive: true }),
        fsp.mkdir(exportsDir, { recursive: true }),
      ]);

      const scenes = [...project.scenes].sort((a, b) => a.sceneNumber - b.sceneNumber);
      const totalScenes = scenes.length;

      await updateJob({
        status: 'running',
        phase: 'video_assembly',
        percent: 2,
        completedScenes: 0,
        totalScenes,
        message: `Rendering cinematic motion for ${totalScenes} scenes...`,
        error: undefined,
      });

      // Group scenes in batches of 10 so xfade never runs out of memory on 100+ scene timelines
      const batchSize = 10;
      const sceneClipPaths: string[] = new Array(totalScenes);
      const sceneOutTransitions: number[] = new Array(totalScenes).fill(0);

      for (let i = 0; i < totalScenes; i++) {
        const isBatchEnd = (i + 1) % batchSize === 0 || i === totalScenes - 1;
        const sc = scenes[i];
        const nextSc = scenes[i + 1];
        if (!isBatchEnd && nextSc && sc.transitionType !== 'smooth-cut' && sc.transitionDurationMs > 0) {
          const maxOverlapSec = Math.min(
            sc.durationMs / 2500,
            nextSc.durationMs / 2500,
            sc.transitionDurationMs / 1000
          );
          sceneOutTransitions[i] = Number(Math.max(0, maxOverlapSec).toFixed(3));
        }
      }

      // Render individual motion clips (2 parallel FFmpeg workers, cached by hash for instant resume!)
      let nextSceneIdx = 0;
      let completedScenes = 0;

      const renderSceneWorker = async () => {
        while (true) {
          if (ctrl.cancelled || signal.aborted) return;
          const idx = nextSceneIdx++;
          if (idx >= totalScenes) return;

          const sc = scenes[idx];
          const imgPath = path.join(imagesDir, sc.image!.fileName);
          const renderDurationSec = Number(
            (Math.max(0.5, sc.durationMs / 1000) + sceneOutTransitions[idx]).toFixed(3)
          );

          const clipKey = crypto
            .createHash('sha1')
            .update(
              JSON.stringify({
                sha: sc.image!.sha256,
                effect: sc.motionEffect,
                intensity: sc.motionIntensity,
                disabled: sc.motionDisabled,
                dur: renderDurationSec,
                width,
                height,
                fps,
                preset,
                crf,
              })
            )
            .digest('hex')
            .slice(0, 16);

          const clipPath = path.join(cacheDir, `sc_${String(idx + 1).padStart(4, '0')}_${clipKey}.mp4`);
          const exists = await fsp
            .stat(clipPath)
            .then((st) => st.size > 1000)
            .catch(() => false);

          if (!exists) {
            const tmpClip = `${clipPath}.tmp.mp4`;
            const vf = buildMotionFilter({
              effect: sc.motionEffect,
              intensity: sc.motionIntensity,
              disabled: sc.motionDisabled,
              width,
              height,
              fps,
              durationSec: renderDurationSec,
            });

            await runExecFfmpeg(
              [
                '-y',
                '-v',
                'error',
                '-loop',
                '1',
                '-framerate',
                String(fps),
                '-i',
                imgPath,
                '-vf',
                vf,
                '-t',
                String(renderDurationSec),
                '-c:v',
                'libx264',
                '-preset',
                preset,
                '-crf',
                crf,
                '-pix_fmt',
                'yuv420p',
                '-an',
                tmpClip,
              ],
              signal
            );
            await fsp.rename(tmpClip, clipPath);
          }

          sceneClipPaths[idx] = clipPath;
          completedScenes += 1;
          const pct = Math.min(58, Math.round(4 + (completedScenes / totalScenes) * 54));
          await updateJob({
            phase: 'video_assembly',
            percent: pct,
            completedScenes,
            totalScenes,
            message: `Rendered scene ${completedScenes} of ${totalScenes}...`,
          });
        }
      };

      const workerCount = Math.min(2, totalScenes);
      await Promise.all(Array.from({ length: workerCount }, () => renderSceneWorker()));
      if (ctrl.cancelled || signal.aborted) throw new Error('Render cancelled by user.');

      // Assemble batch segments with xfade transitions
      await updateJob({
        phase: 'video_assembly',
        percent: 62,
        message: 'Applying cinematic transitions and assembling video timeline...',
      });

      const batchVideoPaths: string[] = [];
      for (let start = 0; start < totalScenes; start += batchSize) {
        const end = Math.min(totalScenes, start + batchSize);
        const batchClips = sceneClipPaths.slice(start, end);
        const batchScenes = scenes.slice(start, end);
        const batchOut = path.join(cacheDir, `batch_${jobId}_${start}.mp4`);

        if (batchClips.length === 1) {
          batchVideoPaths.push(batchClips[0]);
          continue;
        }

        const hasTransitions = batchScenes.some(
          (sc, localIdx) => localIdx < batchClips.length - 1 && sceneOutTransitions[start + localIdx] > 0
        );

        if (!hasTransitions) {
          const listPath = path.join(cacheDir, `concat_${jobId}_${start}.txt`);
          await fsp.writeFile(
            listPath,
            batchClips.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n')
          );
          await runExecFfmpeg(
            ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', batchOut],
            signal
          );
          batchVideoPaths.push(batchOut);
        } else {
          const inputArgs: string[] = [];
          for (const clip of batchClips) {
            inputArgs.push('-i', clip);
          }

          const filterSteps: string[] = [];
          let runningLabel = '[0:v]';
          let runningTimelineSec = batchScenes[0].durationMs / 1000;

          for (let j = 0; j < batchClips.length - 1; j++) {
            const globalIdx = start + j;
            const trDur = sceneOutTransitions[globalIdx];
            const outLabel = j === batchClips.length - 2 ? '[vout]' : `[v${j}]`;
            const effectiveTrDur = trDur > 0 ? trDur : 0.04;
            const transitionName =
              trDur > 0 ? mapXfadeTransition(batchScenes[j].transitionType) : 'fade';
            const offsetSec = Math.max(0.05, Number(runningTimelineSec.toFixed(3)));

            filterSteps.push(
              `${runningLabel}[${j + 1}:v]xfade=transition=${transitionName}:duration=${effectiveTrDur.toFixed(3)}:offset=${offsetSec.toFixed(3)}${outLabel}`
            );
            runningLabel = outLabel;
            runningTimelineSec += batchScenes[j + 1].durationMs / 1000;
          }

          await runExecFfmpeg(
            [
              '-y',
              '-v',
              'error',
              ...inputArgs,
              '-filter_complex',
              filterSteps.join(';'),
              '-map',
              '[vout]',
              '-c:v',
              'libx264',
              '-preset',
              preset,
              '-crf',
              crf,
              '-pix_fmt',
              'yuv420p',
              '-r',
              String(fps),
              batchOut,
            ],
            signal
          );
          batchVideoPaths.push(batchOut);
        }
      }

      // Concatenate batch videos cleanly into silent master video
      const silentVideoPath = path.join(cacheDir, `silent_${jobId}.mp4`);
      if (batchVideoPaths.length === 1) {
        await fsp.copyFile(batchVideoPaths[0], silentVideoPath);
      } else {
        const masterListPath = path.join(cacheDir, `master_concat_${jobId}.txt`);
        await fsp.writeFile(
          masterListPath,
          batchVideoPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n')
        );
        await runExecFfmpeg(
          [
            '-y',
            '-v',
            'error',
            '-f',
            'concat',
            '-safe',
            '0',
            '-i',
            masterListPath,
            '-c',
            'copy',
            silentVideoPath,
          ],
          signal
        );
      }

      // Stage: Subtitle Processing
      await updateJob({
        phase: 'subtitle_processing',
        percent: 72,
        message: 'Generating synchronized SRT, VTT, and styled ASS subtitles...',
      });

      const cues = project.voiceover.cues || [];
      const srtFileName = `subtitles_${jobId}.srt`;
      const vttFileName = `subtitles_${jobId}.vtt`;
      const assFileName = `subtitles_${jobId}.ass`;

      await fsp.writeFile(path.join(exportsDir, srtFileName), buildSrtContent(cues), 'utf8');
      await fsp.writeFile(path.join(exportsDir, vttFileName), buildVttContent(cues), 'utf8');

      let videoForFinalMux = silentVideoPath;
      if (embeddedSubtitles && cues.length > 0) {
        const assPath = path.join(cacheDir, assFileName);
        await fsp.writeFile(
          assPath,
          buildAssSubtitleContent({ cues, style: project.subtitles, width, height }),
          'utf8'
        );
        const subVideoPath = path.join(cacheDir, `subbed_${jobId}.mp4`);
        const escapedAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
        await runExecFfmpeg(
          [
            '-y',
            '-v',
            'error',
            '-i',
            silentVideoPath,
            '-vf',
            `ass='${escapedAss}'`,
            '-c:v',
            'libx264',
            '-preset',
            preset,
            '-crf',
            crf,
            '-pix_fmt',
            'yuv420p',
            subVideoPath,
          ],
          signal
        );
        videoForFinalMux = subVideoPath;
      }

      // Stage: Audio Mixing (Voiceover + Loudness Normalization + Auto-Ducked Music + SFX)
      await updateJob({
        phase: 'audio_mixing',
        percent: 82,
        message: 'Mixing voiceover, music auto-ducking, and sound effects...',
      });

      const voiceoverPath = path.join(audioDir, project.voiceover.audioFileName);
      const totalDurSec = Math.max(1, project.voiceover.durationMs / 1000);
      const mix = project.audioMix;
      const mixedAudioPath = path.join(cacheDir, `mixed_${jobId}.m4a`);

      const audioInputs: string[] = ['-i', voiceoverPath];
      const audioFilters: string[] = [];

      const voVol = Number(Math.max(0, Math.min(2, mix.voiceoverVolume ?? 1)).toFixed(2));
      const voNorm = mix.loudnessNormalization ? ',loudnorm=I=-14:TP=-1.5:LRA=11' : '';
      audioFilters.push(
        `[0:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${voVol}${voNorm}[vo_base]`
      );

      let hasMusic = false;
      if (mix.musicEnabled && mix.musicTrack?.fileName) {
        const musicPath = path.join(musicDir, mix.musicTrack.fileName);
        const musicExists = await fsp
          .stat(musicPath)
          .then((s) => s.size > 0)
          .catch(() => false);
        if (musicExists) {
          hasMusic = true;
          audioInputs.push('-stream_loop', '-1', '-i', musicPath);
          const fadeInSec = Math.max(0, (mix.fadeInMs || 0) / 1000);
          const fadeOutSec = Math.max(0, (mix.fadeOutMs || 0) / 1000);
          const fadeOutStart = Math.max(0, totalDurSec - fadeOutSec);
          const musVol = Number(Math.max(0.01, Math.min(1.0, mix.musicVolume ?? 0.22)).toFixed(2));

          let musChain = `[1:a]atrim=0:${totalDurSec.toFixed(3)},asetpts=PTS-STARTPTS,aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${musVol}`;
          if (fadeInSec > 0.05) musChain += `,afade=t=in:st=0:d=${fadeInSec.toFixed(2)}`;
          if (fadeOutSec > 0.05 && fadeOutStart > fadeInSec) {
            musChain += `,afade=t=out:st=${fadeOutStart.toFixed(2)}:d=${fadeOutSec.toFixed(2)}`;
          }
          musChain += '[mus_pre]';
          audioFilters.push(musChain);

          if (mix.duckingEnabled) {
            const ratio = Math.max(2, Math.min(12, Math.round(2 + (mix.duckingAmount ?? 0.7) * 10)));
            audioFilters.push('[vo_base]asplit=2[vo_mix][vo_sc]');
            audioFilters.push(
              `[mus_pre][vo_sc]sidechaincompress=threshold=0.025:ratio=${ratio}:attack=120:release=550:makeup=1[mus_final]`
            );
          } else {
            audioFilters.push('[vo_base]acopy[vo_mix]');
            audioFilters.push('[mus_pre]acopy[mus_final]');
          }
        }
      }

      if (!hasMusic) {
        audioFilters.push('[vo_base]acopy[vo_mix]');
      }

      const mixChannels: string[] = ['[vo_mix]'];
      if (hasMusic) mixChannels.push('[mus_final]');

      // Optional SFX inputs
      const validSfx = [];
      for (const sfx of mix.soundEffects || []) {
        const sfxPath = path.join(sfxDir, sfx.fileName);
        const ok = await fsp
          .stat(sfxPath)
          .then((s) => s.size > 0)
          .catch(() => false);
        if (ok) validSfx.push({ sfx, sfxPath });
      }

      validSfx.forEach((item, idx) => {
        const inputIdx = (hasMusic ? 2 : 1) + idx;
        audioInputs.push('-i', item.sfxPath);
        const delayMs = Math.max(0, Math.round(item.sfx.startMs));
        const vol = Number(Math.max(0.05, Math.min(2, item.sfx.volume ?? 0.7)).toFixed(2));
        audioFilters.push(
          `[${inputIdx}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${vol},adelay=${delayMs}|${delayMs}[sfx${idx}]`
        );
        mixChannels.push(`[sfx${idx}]`);
      });

      if (mixChannels.length === 1) {
        audioFilters.push('[vo_mix]alimiter=limit=0.96[aout]');
      } else {
        audioFilters.push(
          `${mixChannels.join('')}amix=inputs=${mixChannels.length}:duration=first:dropout_transition=0,volume=${mixChannels.length},alimiter=limit=0.96[aout]`
        );
      }

      await runExecFfmpeg(
        [
          '-y',
          '-v',
          'error',
          ...audioInputs,
          '-filter_complex',
          audioFilters.join(';'),
          '-map',
          '[aout]',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          '-t',
          totalDurSec.toFixed(3),
          mixedAudioPath,
        ],
        signal
      );

      // Stage: Final Rendering / Muxing
      await updateJob({
        phase: 'final_rendering',
        percent: 92,
        message: 'Encoding final MP4 H.264 stream with faststart optimization...',
      });

      const safeSlug =
        project.settings.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 32) || 'youtube-video';
      const exportFileName = `${safeSlug}-${resolution}-${jobId.slice(-6)}.mp4`;
      const finalMp4Path = path.join(exportsDir, exportFileName);

      await runExecFfmpeg(
        [
          '-y',
          '-v',
          'error',
          '-i',
          videoForFinalMux,
          '-i',
          mixedAudioPath,
          '-map',
          '0:v:0',
          '-map',
          '1:a:0',
          '-c:v',
          'copy',
          '-c:a',
          'copy',
          '-movflags',
          '+faststart',
          '-shortest',
          finalMp4Path,
        ],
        signal
      );

      // Verify output MP4 using ffprobe before marking Export completed!
      const { stdout: probeRaw } = await execFileAsync(
        'ffprobe',
        [
          '-v',
          'error',
          '-show_entries',
          'format=duration,size:stream=width,height',
          '-of',
          'json',
          finalMp4Path,
        ],
        { maxBuffer: 1024 * 512 }
      );
      const probe = JSON.parse(probeRaw) as {
        format?: { duration?: string; size?: string };
        streams?: Array<{ width?: number; height?: number }>;
      };
      const stat = await fsp.stat(finalMp4Path);
      const verifiedDurSec = Number(Number(probe.format?.duration || totalDurSec).toFixed(2));
      const vStream = probe.streams?.find((s) => s.width && s.height);

      if (stat.size < 1024 || verifiedDurSec <= 0) {
        throw new Error('Rendered MP4 failed integrity verification.');
      }

      const artifact: ExportArtifact = {
        id: jobId,
        fileName: exportFileName,
        videoUrl: `/api/yt/projects/${projectId}/media/exports/${exportFileName}`,
        downloadUrl: `/api/yt/projects/${projectId}/exports/${exportFileName}/download`,
        resolution,
        aspectRatio: project.settings.aspectRatio,
        fps,
        qualityPreset,
        embeddedSubtitles,
        durationSeconds: verifiedDurSec,
        width: vStream?.width || width,
        height: vStream?.height || height,
        fileSizeBytes: stat.size,
        createdAt: new Date().toISOString(),
        srtUrl: `/api/yt/projects/${projectId}/media/exports/${srtFileName}`,
        vttUrl: `/api/yt/projects/${projectId}/media/exports/${vttFileName}`,
      };

      const refreshed = await getProject(projectId);
      if (refreshed) {
        refreshed.exports.unshift(artifact);
        refreshed.usage.renderTimeSeconds += Math.round((Date.now() - startMs) / 1000);
        refreshed.activeRenderJob = {
          jobId,
          status: 'completed',
          phase: 'export',
          percent: 100,
          completedScenes: totalScenes,
          totalScenes,
          message: `Exported ${exportFileName} (${verifiedDurSec}s)`,
          startedAt: refreshed.activeRenderJob?.startedAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await saveProject(refreshed);
      }

      // Clean temporary batch/mixed files while keeping per-scene clip cache for quick re-exports
      await Promise.all([
        fsp.unlink(silentVideoPath).catch(() => undefined),
        fsp.unlink(mixedAudioPath).catch(() => undefined),
        ...batchVideoPaths
          .filter((p) => p.includes(`batch_${jobId}`))
          .map((p) => fsp.unlink(p).catch(() => undefined)),
      ]);
    } catch (err) {
      const cancelled = ctrl.cancelled;
      const errMsg = err instanceof Error ? err.message : 'Video rendering failed.';
      const latest = await getProject(projectId);
      if (latest) {
        latest.activeRenderJob = {
          jobId,
          status: cancelled ? 'cancelled' : 'failed',
          phase: latest.activeRenderJob?.phase || 'video_assembly',
          percent: latest.activeRenderJob?.percent || 0,
          completedScenes: latest.activeRenderJob?.completedScenes || 0,
          totalScenes: latest.scenes.length,
          message: cancelled ? 'Render cancelled safely. Completed clip cache preserved.' : errMsg,
          error: cancelled ? undefined : errMsg,
          startedAt: latest.activeRenderJob?.startedAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await saveProject(latest);
      }
    } finally {
      activeRenderJobs.delete(projectId);
    }
  })();

  return { jobId };
}
