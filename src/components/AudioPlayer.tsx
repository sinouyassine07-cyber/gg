import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import type { TranslationDictionary } from '../i18n/translations';
import { createPlayablePcmUrl } from '../lib/api';
import {
  downloadGenerationAudio,
  getAudioDownloadFilename,
  getAudioDownloadHref,
} from '../lib/download';
import { formatBytes, formatTime } from '../lib/formatters';
import type { GenerationRecord } from '../types';
import { TranscriptPanel } from './TranscriptPanel';

interface AudioPlayerProps {
  record: GenerationRecord;
  t: TranslationDictionary;
  autoPlaySignal?: number;
  onRecordUpdated?: (updated: GenerationRecord) => void;
}

const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5];

export function AudioPlayer({
  record,
  t,
  autoPlaySignal,
  onRecordUpdated,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playableUrl, setPlayableUrl] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    let revokedUrl: string | null = null;
    let cancelled = false;
    setLoadError(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    async function prepareAudio() {
      if (record.format === 'pcm') {
        try {
          const url = await createPlayablePcmUrl(record.audioUrl, record.sampleRate || 44100);
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          revokedUrl = url;
          setPlayableUrl(url);
        } catch (err) {
          if (!cancelled) {
            setLoadError(err instanceof Error ? err.message : 'Unable to decode PCM stream.');
          }
        }
      } else {
        setPlayableUrl(record.audioUrl);
      }
    }

    prepareAudio();
    return () => {
      cancelled = true;
      if (revokedUrl) {
        URL.revokeObjectURL(revokedUrl);
      }
    };
  }, [record.id, record.audioUrl, record.format, record.sampleRate]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !playableUrl) return;
    audio.volume = muted ? 0 : volume;
    audio.playbackRate = playbackRate;
  }, [volume, muted, playbackRate, playableUrl]);

  useEffect(() => {
    if (!autoPlaySignal || !playableUrl) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.play().catch(() => {
      // Autoplay may be blocked by browser policy
    });
  }, [autoPlaySignal, playableUrl]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !playableUrl) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setLoadError('Playback could not be started.');
      }
    } else {
      audio.pause();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value);
    setCurrentTime(next);
    if (audioRef.current) {
      audioRef.current.currentTime = next;
    }
  };

  const cycleRate = () => {
    const idx = PLAYBACK_RATES.indexOf(playbackRate);
    const next = PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length];
    setPlaybackRate(next);
  };

  const seekToSeconds = (seconds: number) => {
    const clamped = Math.max(0, seconds);
    setCurrentTime(clamped);
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = clamped;
      if (audio.paused && playableUrl) {
        audio.play().catch(() => undefined);
      }
    }
  };

  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="rounded-xl border border-white/10 bg-[#0c101b] p-4 sm:p-5">
      <audio
        ref={audioRef}
        src={playableUrl || undefined}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          setDuration(Number.isFinite(el.duration) ? el.duration : 0);
        }}
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={() => setLoadError('Unable to stream generated audio.')}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="text-xs font-medium text-indigo-300">{t.player.nowPlaying}</div>
          <div className="text-sm font-semibold text-slate-100 truncate mt-0.5">
            {record.voiceName}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
          <span>{record.format.toUpperCase()}</span>
          {record.bitrate && record.bitrate > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>{record.bitrate} kbps</span>
            </>
          )}
          {record.sampleRate && (
            <>
              <span aria-hidden="true">·</span>
              <span>{(record.sampleRate / 1000).toFixed(1)} kHz</span>
            </>
          )}
          {record.segmentCount && record.segmentCount > 1 && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {record.segmentCount} {t.studio.segmentsEstimate}
              </span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span>{formatBytes(record.fileSizeBytes)}</span>
        </div>
      </div>

      {loadError ? (
        <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 mb-3">
          {loadError}
        </div>
      ) : null}

      {record.format === 'pcm' && (
        <div className="text-xs text-slate-400 mb-3">{t.player.pcmNotice}</div>
      )}

      <div className="flex items-center gap-3 sm:gap-4">
        <button
          type="button"
          onClick={togglePlay}
          disabled={!playableUrl}
          aria-label={isPlaying ? t.player.pause : t.player.play}
          className="w-10 h-10 shrink-0 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 disabled:opacity-50 text-white flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="relative flex items-center">
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.05}
              value={currentTime}
              onChange={handleSeek}
              aria-label="Audio progress"
              dir="ltr"
              className="studio-range w-full"
              style={{
                background: `linear-gradient(to right, #6366f1 ${progressPct}%, rgba(148,163,184,0.18) ${progressPct}%)`,
              }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums mt-1.5" dir="ltr">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-white/[0.06]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? t.player.unmute : t.player.mute}
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={muted ? 0 : volume}
            onChange={(e) => {
              setMuted(false);
              setVolume(Number(e.target.value));
            }}
            aria-label={t.player.volume}
            dir="ltr"
            className="studio-range w-24"
          />
          <button
            type="button"
            onClick={cycleRate}
            title={t.player.playbackRate}
            className="px-2.5 py-1 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-mono tabular-nums text-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            {playbackRate}x
          </button>
        </div>

        <a
          href={getAudioDownloadHref(record)}
          download={getAudioDownloadFilename(record)}
          onClick={async (e) => {
            e.preventDefault();
            if (isDownloading) return;
            setLoadError(null);
            setIsDownloading(true);
            try {
              await downloadGenerationAudio(record);
            } catch (err) {
              setLoadError(err instanceof Error ? err.message : 'Unable to download audio file.');
            } finally {
              setIsDownloading(false);
            }
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/12 bg-white/[0.05] hover:bg-white/[0.1] text-xs font-semibold text-slate-100 transition-colors whitespace-nowrap shrink-0"
        >
          {isDownloading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{t.player.downloading}</span>
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5" />
              <span>
                {t.player.download} ({record.format.toUpperCase()})
              </span>
            </>
          )}
        </a>
      </div>

      <TranscriptPanel
        key={`${record.id}_${record.transcript?.length ?? 0}`}
        record={record}
        currentTimeMs={Math.round(currentTime * 1000)}
        onSeekToSeconds={seekToSeconds}
        onRecordUpdated={onRecordUpdated}
        t={t}
      />
    </div>
  );
}
