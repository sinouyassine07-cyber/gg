import type { DirectedSegment, FishAudioModel } from '../types';

export interface ExpressionTagOption {
  id: string;
  tag: string;
  category: 'emotion' | 'delivery';
  labelEn: string;
  labelAr: string;
}

export const S2_EXPRESSION_TAGS: ExpressionTagOption[] = [
  { id: 'calm', tag: '[calm]', category: 'emotion', labelEn: 'Calm', labelAr: 'هادئ' },
  { id: 'happy', tag: '[happy]', category: 'emotion', labelEn: 'Happy', labelAr: 'سعيد' },
  { id: 'excited', tag: '[excited]', category: 'emotion', labelEn: 'Excited', labelAr: 'متحمس' },
  { id: 'confident', tag: '[confident]', category: 'emotion', labelEn: 'Confident', labelAr: 'واثق' },
  { id: 'serious', tag: '[serious]', category: 'emotion', labelEn: 'Serious', labelAr: 'جاد' },
  { id: 'sad', tag: '[sad]', category: 'emotion', labelEn: 'Sad', labelAr: 'حزين' },
  { id: 'worried', tag: '[worried]', category: 'emotion', labelEn: 'Worried', labelAr: 'قلق' },
  { id: 'friendly', tag: '[friendly]', category: 'emotion', labelEn: 'Friendly', labelAr: 'ودود' },
  { id: 'empathetic', tag: '[empathetic]', category: 'emotion', labelEn: 'Empathetic', labelAr: 'متعاطف' },
  { id: 'surprised', tag: '[surprised]', category: 'emotion', labelEn: 'Surprised', labelAr: 'متفاجئ' },
  { id: 'angry', tag: '[angry]', category: 'emotion', labelEn: 'Angry', labelAr: 'غاضب' },
  { id: 'whispering', tag: '[whispering]', category: 'delivery', labelEn: 'Whispering', labelAr: 'همس' },
  { id: 'emphasis', tag: '[emphasis]', category: 'delivery', labelEn: 'Emphasis', labelAr: 'تأكيد' },
  { id: 'sigh', tag: '[sigh]', category: 'delivery', labelEn: 'Sigh', labelAr: 'تنهيدة' },
  { id: 'chuckle', tag: '[chuckle]', category: 'delivery', labelEn: 'Chuckle', labelAr: 'ضحكة خفيفة' },
  { id: 'voice breaking', tag: '[voice breaking]', category: 'delivery', labelEn: 'Voice breaking', labelAr: 'نبرة متأثرة' },
];

export const S1_LEGACY_TAGS: ExpressionTagOption[] = [
  { id: 'calm', tag: '(calm)', category: 'emotion', labelEn: 'Calm', labelAr: 'هادئ' },
  { id: 'excited', tag: '(excited)', category: 'emotion', labelEn: 'Excited', labelAr: 'متحمس' },
  { id: 'happy', tag: '(happy)', category: 'emotion', labelEn: 'Happy', labelAr: 'سعيد' },
  { id: 'sad', tag: '(sad)', category: 'emotion', labelEn: 'Sad', labelAr: 'حزين' },
  { id: 'whispering', tag: '(whispering)', category: 'delivery', labelEn: 'Whispering', labelAr: 'همس' },
  { id: 'serious', tag: '(serious)', category: 'emotion', labelEn: 'Serious', labelAr: 'جاد' },
];

export function getExpressionTagsForModel(model: FishAudioModel): ExpressionTagOption[] {
  return model === 's1' ? S1_LEGACY_TAGS : S2_EXPRESSION_TAGS;
}

export function normalizeTagSyntax(raw: string, model: FishAudioModel): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const inner = trimmed.replace(/^[\[(]+|[\])]+$/g, '').trim();
  if (!inner) return '';
  return model === 's1' ? `(${inner})` : `[${inner}]`;
}

function splitLongPiece(piece: string, maxChars: number): string[] {
  const trimmed = piece.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const clauseParts = trimmed.split(/(?<=[،,;؛:—-])\s+/);
  const results: string[] = [];
  let current = '';

  const pushWordSplit = (text: string) => {
    const words = text.split(/\s+/);
    let buf = '';
    for (const word of words) {
      if (!word) continue;
      if (word.length > maxChars) {
        if (buf) {
          results.push(buf);
          buf = '';
        }
        for (let i = 0; i < word.length; i += maxChars) {
          results.push(word.slice(i, i + maxChars));
        }
        continue;
      }
      const candidate = buf ? `${buf} ${word}` : word;
      if (candidate.length <= maxChars) {
        buf = candidate;
      } else {
        if (buf) results.push(buf);
        buf = word;
      }
    }
    if (buf) results.push(buf);
  };

  for (const part of clauseParts) {
    if (part.length > maxChars) {
      if (current) {
        results.push(current);
        current = '';
      }
      pushWordSplit(part);
      continue;
    }
    const candidate = current ? `${current} ${part}` : part;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) results.push(current);
      current = part;
    }
  }
  if (current) results.push(current);
  return results;
}

export function splitScriptIntoSegments(rawText: string, maxChars = 480): string[] {
  const normalized = rawText.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const paragraphs = normalized
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const segments: string[] = [];

  for (const paragraph of paragraphs) {
    const rawSentences = paragraph.split(/(?<=[.!?؟۔…])\s+/);
    let buffer = '';

    for (const sentence of rawSentences) {
      const s = sentence.trim();
      if (!s) continue;

      if (s.length > maxChars) {
        if (buffer) {
          segments.push(buffer);
          buffer = '';
        }
        segments.push(...splitLongPiece(s, maxChars));
        continue;
      }

      const candidate = buffer ? `${buffer} ${s}` : s;
      if (candidate.length <= maxChars) {
        buffer = candidate;
      } else {
        if (buffer) segments.push(buffer);
        buffer = s;
      }
    }

    if (buffer) {
      segments.push(buffer);
    }
  }

  for (let i = 0; i < segments.length - 1; i++) {
    const match = segments[i].match(/\s+(\[[^\]]{1,80}\]|\([a-zA-Z\s]{1,32}\))$/);
    if (match) {
      segments[i] = segments[i].slice(0, segments[i].length - match[0].length).trim();
      segments[i + 1] = `${match[1]} ${segments[i + 1]}`.trim();
    }
  }

  return segments.filter(Boolean);
}

export function extractLeadingTag(segmentText: string): { emotionTag: string; cleanText: string } {
  const trimmed = segmentText.trim();
  const s2Match = trimmed.match(/^(\[[^\]]{1,80}\])\s*(.*)$/s);
  if (s2Match) {
    return { emotionTag: s2Match[1].trim(), cleanText: s2Match[2].trim() };
  }
  const s1Match = trimmed.match(/^(\([a-zA-Z\s]{1,32}\))\s*(.*)$/s);
  if (s1Match) {
    return { emotionTag: s1Match[1].trim(), cleanText: s1Match[2].trim() };
  }
  return { emotionTag: '', cleanText: trimmed };
}

export function composeDirectedSegmentText(seg: Pick<DirectedSegment, 'emotionTag' | 'text'>): string {
  const tag = seg.emotionTag.trim();
  const body = seg.text.trim();
  if (!tag) return body;
  if (!body) return tag;
  if (body.startsWith(tag)) return body;
  return `${tag} ${body}`;
}

export function buildDirectedSegmentsFromScript(
  script: string,
  previous?: DirectedSegment[]
): DirectedSegment[] {
  const chunks = splitScriptIntoSegments(script, 480);
  if (chunks.length === 0) return [];

  return chunks.map((chunk, idx) => {
    const { emotionTag, cleanText } = extractLeadingTag(chunk);
    const prev = previous?.[idx];
    const matchesPrev =
      prev &&
      prev.text.trim() === cleanText &&
      prev.emotionTag.trim() === emotionTag;

    if (matchesPrev) {
      return prev;
    }

    return {
      id: prev?.id || `seg_${idx}_${Math.random().toString(36).slice(2, 8)}`,
      text: cleanText || chunk,
      emotionTag: cleanText ? emotionTag : '',
      speed: null,
      voiceMode: 'global',
      voiceId: null,
      voiceName: undefined,
    };
  });
}

export function serializeDirectedSegmentsToScript(segments: DirectedSegment[]): string {
  return segments
    .map((seg) => composeDirectedSegmentText(seg))
    .filter(Boolean)
    .join('\n');
}
