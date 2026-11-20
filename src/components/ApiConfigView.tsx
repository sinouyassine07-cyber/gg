import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { TranslationDictionary } from '../i18n/translations';
import { api } from '../lib/api';
import type { ApiConfigStatus } from '../types';

interface ApiConfigViewProps {
  status: ApiConfigStatus | null;
  onStatusUpdated: (next: ApiConfigStatus) => void;
  t: TranslationDictionary;
}

export function ApiConfigView({ status, onStatusUpdated, t }: ApiConfigViewProps) {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = apiKeyInput.trim();
    if (!trimmed) return;

    setSaving(true);
    setFeedback(null);
    try {
      const updated = await api.saveApiKey(trimmed);
      onStatusUpdated(updated);
      setApiKeyInput('');
      setShowKey(false);
      const latencyNote = updated.latencyMs ? ` (${updated.latencyMs} ms)` : '';
      setFeedback({ type: 'success', message: `${t.apiConfig.saveSuccess}${latencyNote}` });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to verify Fish Audio API key.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setFeedback(null);
    try {
      const res = await api.testConnection();
      if (status) {
        onStatusUpdated({
          ...status,
          credit: res.credit ?? status.credit,
        });
      }
      setFeedback({
        type: 'success',
        message: `${t.apiConfig.testSuccess} (${res.latencyMs} ms)`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Connection test failed.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    setFeedback(null);
    try {
      const updated = await api.removeApiKey();
      onStatusUpdated(updated);
      setFeedback({ type: 'success', message: t.apiConfig.removeSuccess });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to remove saved API key.',
      });
    } finally {
      setRemoving(false);
    }
  };

  const sourceLabel =
    status?.source === 'user'
      ? t.apiConfig.sourceUser
      : status?.source === 'env'
        ? t.apiConfig.sourceEnv
        : t.apiConfig.sourceNone;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{t.apiConfig.title}</h1>
          <p className="text-sm text-slate-400 mt-1">{t.apiConfig.subtitle}</p>
        </div>

        <a
          href="https://docs.fish.audio/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-300 hover:text-indigo-200 transition-colors"
        >
          <span>{t.apiConfig.docsLinkLabel}</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Status Summary */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <div className="text-xs text-slate-400">{t.apiConfig.statusLabel}</div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              {status?.configured ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-emerald-300">{t.apiConfig.connected}</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-amber-300">{t.apiConfig.notConfigured}</span>
                </>
              )}
            </div>
            <div className="text-xs text-slate-500">{sourceLabel}</div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-slate-400">{t.apiConfig.maskedKeyLabel}</div>
            <div className="text-sm font-mono tabular-nums text-slate-100">
              {status?.maskedKey || '—'}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-slate-400">{t.apiConfig.creditsLabel}</div>
            <div className="text-sm font-mono tabular-nums text-slate-100">
              {typeof status?.credit === 'number' ? status.credit.toLocaleString() : '—'}
            </div>
          </div>
        </div>

        {status?.configured && (
          <div className="flex flex-wrap items-center gap-3 mt-5 pt-4 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-60 text-xs font-semibold text-slate-100 transition-colors"
            >
              {testing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{testing ? t.apiConfig.testing : t.apiConfig.testConnection}</span>
            </button>

            {status.source === 'user' && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={removing}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-60 text-xs font-semibold text-rose-200 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t.apiConfig.removeKey}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {feedback && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm flex items-center gap-2.5 ${
            feedback.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Save New Key Form */}
      <form
        onSubmit={handleSave}
        className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-5 space-y-4"
      >
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-indigo-400" />
          <label htmlFor="fish-api-key" className="text-sm font-semibold text-white">
            {t.apiConfig.keyInputLabel}
          </label>
        </div>

        <div className="relative">
          <input
            id="fish-api-key"
            type={showKey ? 'text' : 'password'}
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder={t.apiConfig.keyInputPlaceholder}
            autoComplete="off"
            spellCheck={false}
            dir="ltr"
            className="w-full rounded-lg border border-white/10 bg-[#070910] ps-3.5 pe-10 py-2.5 text-sm font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
          />
          <button
            type="button"
            onClick={() => setShowKey((s) => !s)}
            aria-label={showKey ? 'Hide API key' : 'Show API key'}
            className="absolute end-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded text-slate-400 hover:text-white"
          >
            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <div className="flex items-start gap-2 text-xs text-slate-400 max-w-lg">
            <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <span>{t.apiConfig.securityNote}</span>
          </div>

          <button
            type="submit"
            disabled={saving || !apiKeyInput.trim()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 disabled:opacity-50 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{saving ? t.apiConfig.verifying : t.apiConfig.saveAndVerify}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
