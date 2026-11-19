import crypto from 'node:crypto';
import { generateStructuredAi, generateTextAi, type PortableJsonSchema } from './aiClient.ts';
import type { TranscriptCue } from './transcriptEngine.ts';
import type {
  AspectRatio,
  MotionEffect,
  MotionIntensity,
  ProjectScript,
  ProjectSettings,
  ScriptChapter,
  TransitionType,
  VideoCategory,
  VisualStyle,
  YouTubeScene,
} from './ytTypes.ts';

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

const VISUAL_STYLE_DESCRIPTORS: Record<VisualStyle, string> = {
  'cinematic-photorealism':
    'cinematic photorealism, shot on ARRI Alexa 65, anamorphic lens, natural film grain, volumetric lighting, ultra-detailed skin and material textures',
  'documentary-photography':
    'authentic documentary photography, Leica 35mm reportage aesthetic, natural available light, candid realism, editorial color grading',
  'historical-realism':
    'period-accurate historical realism, museum-grade costume and architecture fidelity, natural candlelight or overcast daylight, textured oil-and-stone authenticity',
  'dark-cinematic':
    'moody dark chiaroscuro cinematography, deep shadows, rim lighting, teal-and-amber desaturated palette, tense atmospheric mist',
  '3d-animation':
    'high-end stylized 3D CGI feature animation, physically based rendering, subsurface scattering, sculpted silhouettes, rich volumetric depth',
  illustration:
    'editorial narrative digital illustration, expressive brushwork, layered depth, cohesive tonal palette, crisp storytelling silhouette',
  'realistic-photography':
    'crisp realistic DSLR photography, 50mm prime lens, natural depth of field, true-to-life color balance and daylight shadows',
};

const ASPECT_RATIO_LABEL: Record<AspectRatio, string> = {
  '16:9': '16:9 widescreen cinematic frame (--ar 16:9)',
  '9:16': '9:16 vertical portrait frame (--ar 9:16)',
  '1:1': '1:1 square composition (--ar 1:1)',
};

function selectInitialMotion(
  visualDesc: string,
  durationMs: number,
  prevMotion: MotionEffect | null
): { effect: MotionEffect; intensity: MotionIntensity } {
  const lower = visualDesc.toLowerCase();
  const isPortraitOrFace = /\b(face|portrait|close-up|closeup|person|man|woman|character|eyes)\b/.test(
    lower
  );
  const isWideLandscape = /\b(wide|panoramic|landscape|city|skyline|horizon|hall|corridor|street|ocean|desert)\b/.test(
    lower
  );
  const isTallVertical = /\b(tower|building|skyscraper|tree|mountain|monument|cathedral|staircase)\b/.test(
    lower
  );

  let candidates: MotionEffect[];
  if (isPortraitOrFace) {
    candidates = ['slow-zoom-in', 'cinematic-drift', 'slow-zoom-out', 'ken-burns'];
  } else if (isTallVertical) {
    candidates = ['pan-up', 'pan-down', 'slow-zoom-out', 'diagonal-drift'];
  } else if (isWideLandscape) {
    candidates = ['pan-right', 'pan-left', 'ken-burns', 'slow-zoom-out', 'diagonal-drift'];
  } else {
    candidates = [
      'slow-zoom-in',
      'ken-burns',
      'pan-right',
      'slow-zoom-out',
      'pan-left',
      'cinematic-drift',
      'diagonal-drift',
    ];
  }

  const chosen = candidates.find((c) => c !== prevMotion) || candidates[0];
  const intensity: MotionIntensity =
    durationMs >= 13000 ? 'subtle' : durationMs <= 6500 ? 'cinematic' : 'balanced';
  return { effect: chosen, intensity };
}

export interface VideoIdeaItem {
  title: string;
  topicPremise: string;
  description: string;
  hookPreview: string;
}

export async function generateVideoConcepts(params: {
  seedTopic?: string;
  category: VideoCategory;
  language: string;
  targetAudience?: string;
  workspaceId?: string;
}): Promise<{
  ideas: VideoIdeaItem[];
  provider: string;
  model: string;
  tokensUsed: number;
}> {
  const schema: PortableJsonSchema = {
    type: 'object',
    properties: {
      ideas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            topicPremise: { type: 'string' },
            description: { type: 'string' },
            hookPreview: { type: 'string' },
          },
        },
      },
    },
  };

  const prompt = [
    `You are a veteran YouTube creative producer and channel strategist.`,
    `Generate 4 compelling long-form YouTube video concepts.`,
    `Language: ${params.language} (Write ALL titles, topics, descriptions, and hooks in ${params.language})`,
    `Category: ${params.category}`,
    `Target Audience: ${params.targetAudience || 'Curious general viewers'}`,
    params.seedTopic?.trim()
      ? `Seed Topic / Keyword / Angle: "${params.seedTopic.trim()}" — create 4 high-retention variations, titles, and angles around this subject.`
      : `Suggest 4 original, fascinating, high-retention documentary/storytelling video concepts for this category.`,
    `For each concept provide:`,
    `- title: clickable yet credible YouTube video title (no spammy all-caps clickbait)`,
    `- topicPremise: a clear 2-3 sentence production premise describing narrative arc & key beats`,
    `- description: ready-to-publish YouTube video description with strong opening lines`,
    `- hookPreview: a gripping 1-2 sentence opening spoken hook`,
  ].join('\n');

  const res = await generateStructuredAi<{ ideas?: VideoIdeaItem[] }>({
    task: 'scriptGeneration',
    prompt,
    schema,
    defaultThinkingLevel: 'LOW',
    workspaceId: params.workspaceId,
  });

  const ideas = Array.isArray(res.data.ideas)
    ? res.data.ideas.filter((it) => it && typeof it.title === 'string' && it.title.trim())
    : [];

  if (ideas.length === 0) {
    throw new Error('AI provider returned no video concepts. Please refine your prompt and retry.');
  }

  return {
    ideas,
    provider: res.provider,
    model: res.model,
    tokensUsed: res.totalTokens,
  };
}

export async function generateFullYouTubeScript(params: {
  settings: ProjectSettings;
  narrationStyle: string;
  workspaceId?: string;
}): Promise<{
  script: ProjectScript;
  tokensApprox: number;
  calls: number;
  provider: string;
  model: string;
}> {
  const { settings, narrationStyle, workspaceId } = params;
  const totalWordsTarget = Math.max(450, Math.round(settings.targetDurationMinutes * 145));
  const chapterCount = Math.min(
    14,
    Math.max(4, Math.round(settings.targetDurationMinutes / 2.5))
  );
  let aiCalls = 0;
  let totalTokens = 0;
  let usedProvider = 'gemini';
  let usedModel = '';

  const blueprintSchema: PortableJsonSchema = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      hook: { type: 'string', description: 'Spoken opening hook (60-120 words)' },
      introduction: {
        type: 'string',
        description: 'Spoken introduction setting stakes (100-180 words)',
      },
      chapters: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            summary: { type: 'string' },
            estimatedMinutes: { type: 'number' },
            targetWords: { type: 'integer' },
          },
        },
      },
      conclusion: { type: 'string', description: 'Spoken conclusion & takeaway (100-180 words)' },
      researchNotes: {
        type: 'array',
        items: { type: 'string' },
      },
    },
  };

  const blueprintPrompt = [
    `You are an elite YouTube long-form scriptwriter and documentary showrunner.`,
    `Create a detailed structural blueprint for a ${settings.targetDurationMinutes}-minute YouTube video (~${totalWordsTarget} total spoken words).`,
    `Topic: ${settings.topic}`,
    `Title / Project Name: ${settings.name}`,
    `Language: ${settings.language} (ALL output text MUST be written naturally in ${settings.language})`,
    `Category: ${settings.category}`,
    `Target Audience: ${settings.targetAudience || 'General curious YouTube viewers'}`,
    `Narration Style: ${narrationStyle || 'Engaging, authoritative, natural storytelling'}`,
    `Exact chapter count: ${chapterCount} chapters.`,
    settings.includeResearchNotes
      ? `Include factual research notes / verifiable historical or scientific context points. STRICT RULE: NEVER fabricate citations, study names, URLs, or quotes. If something is debated or uncertain, mark it explicitly as unverified/debated.`
      : `Include 2-3 brief narrative continuity notes in researchNotes.`,
    `Make the hook immediately gripping without clickbait clichés, ensure logical flow with zero repetition across chapters, and give every chapter a clear target word count summing near ${totalWordsTarget}.`,
  ].join('\n');

  const blueprintRes = await generateStructuredAi<{
    title?: string;
    hook?: string;
    introduction?: string;
    chapters?: Array<{
      title?: string;
      summary?: string;
      estimatedMinutes?: number;
      targetWords?: number;
    }>;
    conclusion?: string;
    researchNotes?: string[];
  }>({
    task: 'scriptGeneration',
    prompt: blueprintPrompt,
    schema: blueprintSchema,
    defaultThinkingLevel: 'LOW',
    workspaceId,
  });

  aiCalls += 1;
  totalTokens += blueprintRes.totalTokens;
  usedProvider = blueprintRes.provider;
  usedModel = blueprintRes.model;

  const blueprint = blueprintRes.data;
  const outlineChapters = Array.isArray(blueprint.chapters) ? blueprint.chapters : [];
  if (outlineChapters.length === 0) {
    throw new Error('The AI provider returned an empty script outline. Please refine your topic and retry.');
  }

  // Step 2: Write rich, natural spoken narration for chapters in batches of 3 for true long-form depth
  const writtenChapters: ScriptChapter[] = [];
  const batchSize = 3;

  const chapterBatchSchema: PortableJsonSchema = {
    type: 'object',
    properties: {
      chapters: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            content: { type: 'string' },
          },
        },
      },
    },
  };

  for (let start = 0; start < outlineChapters.length; start += batchSize) {
    const batch = outlineChapters.slice(start, start + batchSize);
    const previousTitles = writtenChapters.map((c) => `${c.index}. ${c.title}: ${c.summary}`).join('\n');

    const chapterPrompt = [
      `Write the COMPLETE, spoken word-for-word YouTube voiceover narration for chapters ${start + 1} through ${start + batch.length}.`,
      `Language: ${settings.language} (natural spoken rhythm, ready for Fish Audio TTS — NO stage directions like [MUSIC PLAYS] or markdown bullets; only natural spoken prose and optional subtle Fish S2 cues like [pause] or [calm] only if genuinely fitting).`,
      `Video Topic: ${settings.topic}`,
      `Category: ${settings.category} | Narration Style: ${narrationStyle}`,
      `Target Audience: ${settings.targetAudience || 'General audience'}`,
      previousTitles
        ? `Previously covered chapters (do NOT repeat these facts):\n${previousTitles}`
        : `Opening Hook already spoken: ${blueprint.hook || ''}`,
      `Chapters to write now (return EXACTLY ${batch.length} chapter objects in the "chapters" array):`,
      ...batch.map((ch, idx) => {
        const chNum = start + idx + 1;
        const words = Math.max(
          160,
          Math.min(900, Number(ch.targetWords) || Math.round(totalWordsTarget / outlineChapters.length))
        );
        return `Chapter ${chNum}: "${ch.title || `Chapter ${chNum}`}" — Focus: ${ch.summary || ''} — Target spoken length: ~${words} words. End with a smooth narrative transition to the next chapter.`;
      }),
    ].join('\n\n');

    const chRes = await generateStructuredAi<{
      chapters?: Array<{ title?: string; content?: string }>;
    }>({
      task: 'scriptGeneration',
      prompt: chapterPrompt,
      schema: chapterBatchSchema,
      defaultThinkingLevel: 'LOW',
      workspaceId,
    });

    aiCalls += 1;
    totalTokens += chRes.totalTokens;

    const items = Array.isArray(chRes.data.chapters) ? chRes.data.chapters : [];

    batch.forEach((outline, idx) => {
      const generated = items[idx] || {};
      const content = (generated.content || outline.summary || '').trim();
      writtenChapters.push({
        id: `ch_${crypto.randomUUID().slice(0, 8)}`,
        index: start + idx + 1,
        title: (generated.title || outline.title || `Chapter ${start + idx + 1}`).trim(),
        content,
        summary: (outline.summary || '').trim(),
        estimatedMinutes:
          Number(outline.estimatedMinutes) ||
          Number((settings.targetDurationMinutes / outlineChapters.length).toFixed(1)),
        locked: false,
        approved: false,
        wordCount: countWords(content),
      });
    });
  }

  const now = new Date().toISOString();
  const script: ProjectScript = {
    title: (blueprint.title || settings.name).trim(),
    hook: (blueprint.hook || '').trim(),
    introduction: (blueprint.introduction || '').trim(),
    chapters: writtenChapters,
    conclusion: (blueprint.conclusion || '').trim(),
    researchNotes: Array.isArray(blueprint.researchNotes)
      ? blueprint.researchNotes.map((r) => String(r).trim()).filter(Boolean)
      : [],
    approved: false,
    updatedAt: now,
  };

  return {
    script,
    tokensApprox: totalTokens,
    calls: aiCalls,
    provider: usedProvider,
    model: usedModel,
  };
}

export type ScriptEditAction =
  | 'regenerate_paragraph'
  | 'expand'
  | 'shorten'
  | 'improve'
  | 'rewrite'
  | 'regenerate_chapter';

export async function transformScriptText(params: {
  action: ScriptEditAction;
  settings: ProjectSettings;
  narrationStyle: string;
  targetText: string;
  surroundingContext?: string;
  customInstruction?: string;
  workspaceId?: string;
}): Promise<{ text: string; tokensApprox: number; provider: string; model: string }> {
  const actionDirective: Record<ScriptEditAction, string> = {
    regenerate_paragraph:
      'Write a fresh, engaging alternative version of this narration segment keeping the same factual intent and seamless flow.',
    expand:
      'Expand this narration section by roughly 40-60% with vivid storytelling detail, concrete context, and smooth spoken pacing.',
    shorten:
      'Tighten and condense this narration section by roughly 35-45% while preserving all key points and impact.',
    improve:
      'Polish and elevate the spoken cadence, clarity, emotional resonance, and transitions for natural voiceover delivery.',
    rewrite:
      'Rewrite this selected text cleanly according to the user instructions while maintaining continuity.',
    regenerate_chapter:
      'Rewrite this entire chapter as cohesive, engaging long-form YouTube narration matching the project style.',
  };

  const prompt = [
    `You are a senior YouTube script editor.`,
    `Video Language: ${params.settings.language} (respond ONLY in ${params.settings.language})`,
    `Category: ${params.settings.category} | Narration Style: ${params.narrationStyle}`,
    `Task: ${actionDirective[params.action]}`,
    params.customInstruction ? `Additional instruction: ${params.customInstruction}` : '',
    params.surroundingContext
      ? `Surrounding script context (for continuity):\n"""\n${params.surroundingContext.slice(0, 1500)}\n"""`
      : '',
    `Text to transform:\n"""\n${params.targetText}\n"""`,
    `Return ONLY the revised spoken narration text with no quotes, headers, or commentary.`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const response = await generateTextAi({
    task: 'scriptGeneration',
    prompt,
    defaultThinkingLevel: 'LOW',
    workspaceId: params.workspaceId,
  });

  const revised = response.data.trim();
  if (!revised) {
    throw new Error('The AI provider returned empty text for this edit action.');
  }
  return {
    text: revised,
    tokensApprox: response.totalTokens,
    provider: response.provider,
    model: response.model,
  };
}

/**
 * Maps cues to chapter IDs based on sequential word proportion / chapter text overlap.
 */
function assignCuesToChapters(
  cues: TranscriptCue[],
  script: ProjectScript | null
): Array<{ chapterId: string; chapterTitle: string }> {
  if (!script || script.chapters.length === 0) {
    return cues.map(() => ({ chapterId: 'main', chapterTitle: 'Main Narration' }));
  }

  const sections: Array<{ id: string; title: string; weight: number }> = [];
  if (script.hook.trim()) {
    sections.push({ id: 'hook', title: 'Opening Hook', weight: Math.max(10, script.hook.length) });
  }
  if (script.introduction.trim()) {
    sections.push({
      id: 'intro',
      title: 'Introduction',
      weight: Math.max(10, script.introduction.length),
    });
  }
  for (const ch of script.chapters) {
    sections.push({
      id: ch.id,
      title: `Ch. ${ch.index}: ${ch.title}`,
      weight: Math.max(20, ch.content.length),
    });
  }
  if (script.conclusion.trim()) {
    sections.push({
      id: 'conclusion',
      title: 'Conclusion',
      weight: Math.max(10, script.conclusion.length),
    });
  }

  const totalSectionWeight = sections.reduce((sum, s) => sum + s.weight, 0);
  const totalCueWeight = cues.reduce((sum, c) => sum + Math.max(5, c.text.length), 0);

  let cueAccum = 0;
  return cues.map((cue) => {
    const ratio = (cueAccum + cue.text.length * 0.5) / Math.max(1, totalCueWeight);
    cueAccum += Math.max(5, cue.text.length);
    const targetWeight = ratio * totalSectionWeight;

    let running = 0;
    for (const sec of sections) {
      running += sec.weight;
      if (targetWeight <= running) {
        return { chapterId: sec.id, chapterTitle: sec.title };
      }
    }
    const last = sections[sections.length - 1];
    return { chapterId: last.id, chapterTitle: last.title };
  });
}

/**
 * Smart Duration Scene Segmentation over REAL analyzed audio timestamps.
 * Never splits mid-cue or mid-word; guarantees zero timeline gaps and zero overlaps.
 */
export async function planSmartScenesFromAudio(params: {
  settings: ProjectSettings;
  script: ProjectScript | null;
  cues: TranscriptCue[];
  totalDurationMs: number;
  workspaceId?: string;
}): Promise<{ scenes: YouTubeScene[]; calls: number; tokensApprox: number }> {
  const { settings, script, cues, totalDurationMs, workspaceId } = params;
  if (cues.length === 0 || totalDurationMs <= 0) {
    throw new Error('Analyze or generate voiceover audio timestamps before planning scenes.');
  }

  const avgMs = Math.max(3000, Math.round(settings.preferredSceneDurationSec * 1000));
  const minMs = Math.max(2500, Math.round(avgMs * 0.55));
  const maxMs = Math.max(minMs + 2000, Math.round(avgMs * 1.75));
  const cueChapters = assignCuesToChapters(cues, script);

  const windowSize = 40;
  const plannedGroups: Array<{
    startCueIdx: number;
    endCueIdx: number;
    visualDescription: string;
  }> = [];

  let calls = 0;
  let tokensApprox = 0;
  let cursorCue = 0;

  const sceneGroupSchema: PortableJsonSchema = {
    type: 'object',
    properties: {
      groups: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            startCueIdx: { type: 'integer' },
            endCueIdx: { type: 'integer' },
            visualDescription: { type: 'string' },
          },
        },
      },
    },
  };

  while (cursorCue < cues.length) {
    const sliceEnd = Math.min(cues.length, cursorCue + windowSize);
    const windowCues = cues.slice(cursorCue, sliceEnd);
    const windowLines = windowCues.map((c, localIdx) => {
      const globalIdx = cursorCue + localIdx;
      const durSec = ((c.endMs - c.startMs) / 1000).toFixed(2);
      return `[#${globalIdx}] (${(c.startMs / 1000).toFixed(2)}s - ${(c.endMs / 1000).toFixed(2)}s, ${durSec}s) [${cueChapters[globalIdx].chapterTitle}]: ${c.text}`;
    });

    const prompt = [
      `You are a film director planning visual scenes synchronized to an existing voiceover.`,
      `Video topic: ${settings.topic} | Category: ${settings.category} | Visual style: ${settings.visualStyle}`,
      `Target average scene duration: ${(avgMs / 1000).toFixed(1)}s (acceptable natural range: ${(minMs / 1000).toFixed(1)}s to ${(maxMs / 1000).toFixed(1)}s).`,
      `Group the numbered narration cues from #${cursorCue} to #${sliceEnd - 1} into contiguous visual scenes.`,
      `RULES:`,
      `1. Every cue from #${cursorCue} to #${sliceEnd - 1} must belong to exactly one scene in strict sequential order with NO gaps and NO overlaps.`,
      `2. Group by semantic visual meaning: keep one visual idea/explanation together, and start a new scene when location, subject, action, or chapter shifts.`,
      `3. For short adjacent cues (e.g. 2-4 seconds each), combine them into one cohesive scene around ~${settings.preferredSceneDurationSec}s; if a single cue is already long, keep it as its own scene.`,
      `4. Write a concise, vivid visualDescription (in English for clear storyboard & prompt readiness) describing what the viewer should SEE on screen for that scene.`,
      `Cues:\n${windowLines.join('\n')}`,
    ].join('\n\n');

    const res = await generateStructuredAi<{
      groups?: Array<{
        startCueIdx?: number;
        endCueIdx?: number;
        visualDescription?: string;
      }>;
    }>({
      task: 'scenePlanning',
      prompt,
      schema: sceneGroupSchema,
      defaultThinkingLevel: 'LOW',
      workspaceId,
    });
    calls += 1;
    tokensApprox += res.totalTokens;

    const rawGroups = Array.isArray(res.data.groups) ? res.data.groups : [];
    let expectedIdx = cursorCue;

    for (const g of rawGroups) {
      if (expectedIdx >= sliceEnd) break;
      const requestedEnd = Number.isFinite(g.endCueIdx) ? Number(g.endCueIdx) : expectedIdx;
      const clampedEnd = Math.max(expectedIdx, Math.min(sliceEnd - 1, Math.round(requestedEnd)));
      plannedGroups.push({
        startCueIdx: expectedIdx,
        endCueIdx: clampedEnd,
        visualDescription: (g.visualDescription || cues[expectedIdx].text).trim(),
      });
      expectedIdx = clampedEnd + 1;
    }

    while (expectedIdx < sliceEnd) {
      let endIdx = expectedIdx;
      while (
        endIdx + 1 < sliceEnd &&
        cues[endIdx].endMs - cues[expectedIdx].startMs < avgMs * 0.85
      ) {
        endIdx += 1;
      }
      plannedGroups.push({
        startCueIdx: expectedIdx,
        endCueIdx: endIdx,
        visualDescription: cues
          .slice(expectedIdx, endIdx + 1)
          .map((c) => c.text)
          .join(' ')
          .slice(0, 220),
      });
      expectedIdx = endIdx + 1;
    }

    cursorCue = sliceEnd;
  }

  const scenes: YouTubeScene[] = [];
  let prevMotion: MotionEffect | null = null;
  const transitions: TransitionType[] = ['crossfade', 'dissolve', 'smooth-cut', 'cinematic-fade'];

  for (let i = 0; i < plannedGroups.length; i++) {
    const grp = plannedGroups[i];
    const firstCue = cues[grp.startCueIdx];
    const startMs = i === 0 ? 0 : firstCue.startMs;
    const nextGroup = plannedGroups[i + 1];
    const endMs = nextGroup
      ? Math.max(startMs + 500, cues[nextGroup.startCueIdx].startMs)
      : Math.max(startMs + 500, totalDurationMs);
    const durationMs = Math.max(500, endMs - startMs);

    const narrationText = cues
      .slice(grp.startCueIdx, grp.endCueIdx + 1)
      .map((c) => c.text.trim())
      .filter(Boolean)
      .join(' ');

    const chap = cueChapters[grp.startCueIdx];
    const motion = selectInitialMotion(grp.visualDescription, durationMs, prevMotion);
    prevMotion = motion.effect;

    const isChapterSwitch =
      i > 0 && cueChapters[grp.startCueIdx].chapterId !== cueChapters[grp.startCueIdx - 1].chapterId;
    const candidateTransition = transitions[i % transitions.length];
    const transitionType: TransitionType = isChapterSwitch
      ? 'fade-black'
      : candidateTransition === 'smooth-cut' && durationMs > 9000
        ? 'crossfade'
        : candidateTransition;

    scenes.push({
      id: `sc_${crypto.randomUUID().slice(0, 8)}`,
      sceneNumber: i + 1,
      chapterId: chap.chapterId,
      chapterTitle: chap.chapterTitle,
      startMs,
      endMs,
      durationMs,
      narrationText,
      visualDescription: grp.visualDescription,
      imagePrompt: '',
      uploadStatus: 'missing',
      motionEffect: motion.effect,
      motionIntensity: motion.intensity,
      motionDisabled: false,
      transitionType,
      transitionDurationMs: transitionType === 'smooth-cut' ? 0 : isChapterSwitch ? 750 : 500,
      approved: false,
    });
  }

  return { scenes, calls, tokensApprox };
}

/**
 * Generates detailed external-image-generator prompts in batches of 12 scenes with visual & character continuity.
 */
export async function generateImagePromptsBatch(params: {
  settings: ProjectSettings;
  scenes: YouTubeScene[];
  targetSceneIds?: string[];
  workspaceId?: string;
}): Promise<{
  updates: Array<{ sceneId: string; imagePrompt: string; continuityNotes: string; visualDescription?: string }>;
  calls: number;
  tokensApprox: number;
}> {
  const { settings, scenes, targetSceneIds, workspaceId } = params;
  const targetSet = targetSceneIds ? new Set(targetSceneIds) : null;
  const targets = scenes.filter((s) => !targetSet || targetSet.has(s.id));

  if (targets.length === 0) {
    return { updates: [], calls: 0, tokensApprox: 0 };
  }

  const styleDesc = VISUAL_STYLE_DESCRIPTORS[settings.visualStyle] || settings.visualStyle;
  const arDesc = ASPECT_RATIO_LABEL[settings.aspectRatio] || settings.aspectRatio;
  const batchSize = 12;
  const updates: Array<{
    sceneId: string;
    imagePrompt: string;
    continuityNotes: string;
    visualDescription?: string;
  }> = [];

  let calls = 0;
  let tokensApprox = 0;
  let rollingContinuity = '';

  const promptSchema: PortableJsonSchema = {
    type: 'object',
    properties: {
      continuitySummary: {
        type: 'string',
        description: 'Brief note summarizing recurring characters, outfits, and environments for upcoming batches',
      },
      prompts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            sceneId: { type: 'string' },
            visualDescription: { type: 'string' },
            imagePrompt: { type: 'string' },
            continuityNotes: { type: 'string' },
          },
        },
      },
    },
  };

  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize);
    const sceneContexts = batch.map((sc) => {
      const idx = scenes.findIndex((s) => s.id === sc.id);
      const prevScene = idx > 0 ? scenes[idx - 1] : null;
      const nextScene = idx >= 0 && idx < scenes.length - 1 ? scenes[idx + 1] : null;
      return [
        `Scene #${sc.sceneNumber} (ID: ${sc.id}, Chapter: ${sc.chapterTitle}, Duration: ${(sc.durationMs / 1000).toFixed(1)}s)`,
        `Narration: "${sc.narrationText}"`,
        `Visual concept: ${sc.visualDescription}`,
        prevScene ? `Previous scene context: ${prevScene.visualDescription}` : '',
        nextScene ? `Next scene context: ${nextScene.visualDescription}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    });

    const prompt = [
      `You are an award-winning film cinematographer and AI prompt architect.`,
      `Topic: ${settings.topic} | Category: ${settings.category}`,
      `Mandatory Visual Style: ${styleDesc}`,
      `Mandatory Aspect Ratio: ${arDesc}`,
      rollingContinuity ? `Established Character & Environment Continuity:\n${rollingContinuity}` : '',
      `Generate a unique, production-ready external image prompt (for Midjourney, Flux, Ideogram, Imagen, or Nano Banana) for EACH scene below.`,
      `EVERY prompt MUST naturally weave together all 13 elements in rich cohesive English prose:`,
      `- Main subject & consistent character appearance details (clothing, age, facial features if recurring)`,
      `- Environment & architectural/natural setting`,
      `- Specific action or frozen dramatic moment matching the narration`,
      `- Composition & framing`,
      `- Camera angle (e.g. low-angle, eye-level, overhead, Dutch tilt)`,
      `- Camera distance (e.g. wide establishing shot, medium two-shot, tight close-up)`,
      `- Lighting quality & direction`,
      `- Atmosphere & weather/air particles`,
      `- Cohesive color palette`,
      `- Tactile textures & visual details`,
      `- Cinematic quality descriptors (${styleDesc})`,
      `- Aspect ratio (${arDesc})`,
      `- Explicit suffix: "no text, no subtitles, no typography, no watermarks, no logos"`,
      `Vary compositions across consecutive scenes so shots feel cinematic and non-repetitive.`,
      `Scenes:\n\n${sceneContexts.join('\n\n---\n\n')}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const res = await generateStructuredAi<{
      continuitySummary?: string;
      prompts?: Array<{
        sceneId?: string;
        visualDescription?: string;
        imagePrompt?: string;
        continuityNotes?: string;
      }>;
    }>({
      task: 'imagePrompts',
      prompt,
      schema: promptSchema,
      defaultThinkingLevel: 'LOW',
      workspaceId,
    });
    calls += 1;
    tokensApprox += res.totalTokens;

    if (res.data.continuitySummary) {
      rollingContinuity = res.data.continuitySummary.slice(0, 600);
    }

    const items = Array.isArray(res.data.prompts) ? res.data.prompts : [];
    batch.forEach((sc, idx) => {
      const match = items.find((p) => p.sceneId === sc.id) || items[idx];
      if (match?.imagePrompt) {
        updates.push({
          sceneId: sc.id,
          imagePrompt: match.imagePrompt.trim(),
          continuityNotes: (match.continuityNotes || '').trim(),
          visualDescription: match.visualDescription?.trim() || undefined,
        });
      }
    });
  }

  return { updates, calls, tokensApprox };
}

export function autoAssignMotionEffects(scenes: YouTubeScene[]): YouTubeScene[] {
  let prev: MotionEffect | null = null;
  return scenes.map((sc) => {
    if (sc.motionDisabled) {
      prev = 'static';
      return { ...sc, motionEffect: 'static' };
    }
    const chosen = selectInitialMotion(
      `${sc.visualDescription} ${sc.imagePrompt}`,
      sc.durationMs,
      prev
    );
    prev = chosen.effect;
    return {
      ...sc,
      motionEffect: chosen.effect,
      motionIntensity: chosen.intensity,
    };
  });
}
