import { useState } from 'react';
import { AudioLines } from 'lucide-react';

interface VoiceAvatarProps {
  src?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

const GRADIENTS = [
  'from-indigo-500/30 via-violet-500/20 to-slate-900',
  'from-blue-500/30 via-indigo-500/20 to-slate-900',
  'from-violet-500/30 via-fuchsia-500/15 to-slate-900',
  'from-sky-500/30 via-blue-500/20 to-slate-900',
];

function pickGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return GRADIENTS[hash % GRADIENTS.length];
}

export function VoiceAvatar({ src, name, size = 'md' }: VoiceAvatarProps) {
  const [failed, setFailed] = useState(false);

  const dims =
    size === 'sm'
      ? 'w-9 h-9 rounded-lg text-xs'
      : size === 'lg'
        ? 'w-12 h-12 rounded-xl text-sm'
        : 'w-10 h-10 rounded-lg text-xs';

  const initial = name.trim().charAt(0).toUpperCase();

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${dims} object-cover shrink-0 border border-white/10 bg-[#111727]`}
      />
    );
  }

  return (
    <div
      className={`${dims} shrink-0 border border-white/10 bg-gradient-to-br ${pickGradient(name)} flex items-center justify-center font-semibold text-indigo-200 select-none`}
      aria-hidden="true"
    >
      {initial ? <span>{initial}</span> : <AudioLines className="w-4 h-4 text-indigo-300" />}
    </div>
  );
}
