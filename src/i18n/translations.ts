import type { UILanguage } from '../types';

export interface TranslationDictionary {
  brandName: string;
  nav: {
    studio: string;
    library: string;
    history: string;
    favorites: string;
    settings: string;
    apiConfig: string;
  };
  header: {
    configureApiKey: string;
    apiReady: string;
    apiRequired: string;
    languageToggle: string;
    openMenu: string;
  };
  studio: {
    title: string;
    subtitle: string;
    scriptLabel: string;
    scriptPlaceholder: string;
    pasteText: string;
    clearText: string;
    characters: string;
    words: string;
    estimatedDuration: string;
    selectedVoice: string;
    defaultVoiceTitle: string;
    defaultVoiceDesc: string;
    changeVoice: string;
    clearVoice: string;
    generateButton: string;
    generatingButton: string;
    generationProgress: string;
    generationSuccess: string;
    emotionTip: string;
    insertTag: string;
    paramsTitle: string;
    resetParams: string;
    modelLabel: string;
    formatLabel: string;
    bitrateLabel: string;
    sampleRateLabel: string;
    speedLabel: string;
    volumeLabel: string;
    temperatureLabel: string;
    topPLabel: string;
    repetitionPenaltyLabel: string;
    chunkLengthLabel: string;
    latencyLabel: string;
    normalizeLabel: string;
    normalizeDesc: string;
    continuousLabel: string;
    continuousDesc: string;
    segmentPauseLabel: string;
    pauseNone: string;
    pauseShort: string;
    pauseMedium: string;
    concurrencyLabel: string;
    concurrency1: string;
    concurrency2: string;
    concurrency3: string;
    segmentsEstimate: string;
    segmentProgress: string;
    stitchingAudio: string;
    cancelGeneration: string;
    autoSampleRate: string;
    latencyNormal: string;
    latencyBalanced: string;
    apiMissingBanner: string;
    apiMissingAction: string;
    emptyTextError: string;
    clipboardError: string;
    customTagPlaceholder: string;
    addCustomTag: string;
    s1LegacyNotice: string;
    editorTab: string;
    directorTab: string;
    directorDesc: string;
    resplitFromScript: string;
    addSegment: string;
    resetOverrides: string;
    segmentEmotion: string;
    noEmotion: string;
    customEmotionOption: string;
    customEmotionPlaceholder: string;
    segmentSpeed: string;
    globalSpeed: string;
    segmentVoice: string;
    globalVoice: string;
    defaultNarrator: string;
    auditionSegment: string;
    auditioning: string;
    stopAudition: string;
    moveUp: string;
    moveDown: string;
    deleteSegment: string;
    directorEmpty: string;
  };
  player: {
    nowPlaying: string;
    play: string;
    pause: string;
    mute: string;
    unmute: string;
    volume: string;
    download: string;
    downloading: string;
    playbackRate: string;
    pcmNotice: string;
    transcriptTitle: string;
    extractTranscript: string;
    reExtractTranscript: string;
    extractingTranscript: string;
    transcriptEmpty: string;
    exportSrt: string;
    exportVtt: string;
    exportTxt: string;
    exportJson: string;
    copyTranscript: string;
    copiedNotice: string;
    txtTimestampsToggle: string;
    modeAuto: string;
    modeAcoustic: string;
    modeFishAsr: string;
    modeGemini: string;
    sourceSegmentExact: string;
    sourceFishAsr: string;
    sourceGemini: string;
    sourceAcoustic: string;
    viewTimeline: string;
    viewInlineTxt: string;
  };
  library: {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    allCategories: string;
    myVoicesOnly: string;
    sortByPopular: string;
    sortByNewest: string;
    allLanguages: string;
    previewPlay: string;
    previewStop: string;
    previewLoading: string;
    noPreview: string;
    selectVoice: string;
    selectedBadge: string;
    favoriteAdd: string;
    favoriteRemove: string;
    usesCount: string;
    loadMore: string;
    loading: string;
    emptyTitle: string;
    emptyDesc: string;
    authRequiredTitle: string;
    authRequiredDesc: string;
    goToApiConfig: string;
    categories: {
      all: string;
      narration: string;
      conversational: string;
      news: string;
      audiobook: string;
      gaming: string;
      podcast: string;
      commercial: string;
    };
  };
  history: {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    clearAll: string;
    clearConfirm: string;
    cancel: string;
    confirmDelete: string;
    playItem: string;
    pauseItem: string;
    downloadItem: string;
    loadInStudio: string;
    deleteItem: string;
    emptyTitle: string;
    emptyDesc: string;
    goToStudio: string;
    voiceLabel: string;
    modelLabel: string;
    sizeLabel: string;
  };
  favorites: {
    title: string;
    subtitle: string;
    emptyTitle: string;
    emptyDesc: string;
    browseLibrary: string;
    useInStudio: string;
    removeFavorite: string;
  };
  settings: {
    title: string;
    subtitle: string;
    interfaceSection: string;
    languageLabel: string;
    languageDesc: string;
    englishOption: string;
    arabicOption: string;
    defaultsSection: string;
    defaultsDesc: string;
    saveDefaults: string;
    savedNotice: string;
    resetDefaults: string;
  };
  apiConfig: {
    title: string;
    subtitle: string;
    statusLabel: string;
    connected: string;
    notConfigured: string;
    sourceEnv: string;
    sourceUser: string;
    sourceNone: string;
    creditsLabel: string;
    maskedKeyLabel: string;
    keyInputLabel: string;
    keyInputPlaceholder: string;
    saveAndVerify: string;
    verifying: string;
    testConnection: string;
    testing: string;
    removeKey: string;
    docsLinkLabel: string;
    securityNote: string;
    testSuccess: string;
    saveSuccess: string;
    removeSuccess: string;
  };
  common: {
    dismiss: string;
    retry: string;
    defaultVoice: string;
  };
}

export const TRANSLATIONS: Record<UILanguage, TranslationDictionary> = {
  en: {
    brandName: 'Voice Studio AI',
    nav: {
      studio: 'Voice Studio',
      library: 'Voice Library',
      history: 'Generation History',
      favorites: 'Favorites',
      settings: 'Settings',
      apiConfig: 'API Configuration',
    },
    header: {
      configureApiKey: 'Configure API Key',
      apiReady: 'Fish Audio Connected',
      apiRequired: 'API Key Required',
      languageToggle: 'العربية',
      openMenu: 'Toggle navigation menu',
    },
    studio: {
      title: 'Voice Studio',
      subtitle: 'Write or paste your script, select a voice model, and synthesize natural speech via Fish Audio.',
      scriptLabel: 'Script Editor',
      scriptPlaceholder: 'Enter or paste your script here... Place Fish Audio S2 tags like [calm], [excited], or [whispering] at the start of a sentence.',
      pasteText: 'Paste Text',
      clearText: 'Clear',
      characters: 'chars',
      words: 'words',
      estimatedDuration: 'est. duration',
      selectedVoice: 'Active Voice',
      defaultVoiceTitle: 'Fish Audio Default Voice',
      defaultVoiceDesc: 'Balanced neutral studio narrator when no custom reference_id is selected.',
      changeVoice: 'Browse Voices',
      clearVoice: 'Use Default',
      generateButton: 'Generate Voice',
      generatingButton: 'Synthesizing Audio...',
      generationProgress: 'Streaming synthesis from Fish Audio...',
      generationSuccess: 'Audio generated and saved to history.',
      emotionTip: 'S2 [bracket] cues (insert at cursor):',
      insertTag: 'Insert',
      paramsTitle: 'Audio Generation Settings',
      resetParams: 'Reset',
      modelLabel: 'Speech Model',
      formatLabel: 'Audio Format',
      bitrateLabel: 'Bitrate',
      sampleRateLabel: 'Sample Rate',
      speedLabel: 'Speech Speed',
      volumeLabel: 'Gain / Volume (dB)',
      temperatureLabel: 'Temperature',
      topPLabel: 'Top P',
      repetitionPenaltyLabel: 'Repetition Penalty',
      chunkLengthLabel: 'Chunk Length',
      latencyLabel: 'Latency Mode',
      normalizeLabel: 'Text Normalization',
      normalizeDesc: 'Automatically normalize numbers, dates, and abbreviations for clearer speech.',
      continuousLabel: 'Continuous Narration',
      continuousDesc: 'Automatically split long scripts into sentence segments and stitch them into one seamless file.',
      segmentPauseLabel: 'Segment Pause',
      pauseNone: 'Seamless (0 ms)',
      pauseShort: 'Natural (150 ms)',
      pauseMedium: 'Paced (350 ms)',
      concurrencyLabel: 'Generation Speed',
      concurrency1: 'Sequential (1x)',
      concurrency2: 'Fast (2x Parallel)',
      concurrency3: 'Turbo (3x Parallel)',
      segmentsEstimate: 'segments',
      segmentProgress: 'Synthesizing segments ({current} / {total} completed)',
      stitchingAudio: 'Stitching {total} audio segments into a single file...',
      cancelGeneration: 'Cancel',
      autoSampleRate: 'Format Default',
      latencyNormal: 'Normal (Highest Fidelity)',
      latencyBalanced: 'Balanced (Low Latency)',
      apiMissingBanner: 'No Fish Audio API key is configured on the server yet. Add your key to generate speech and browse private voices.',
      apiMissingAction: 'Configure API Key',
      emptyTextError: 'Please enter a script before generating speech.',
      clipboardError: 'Clipboard access was blocked by the browser. Please paste using Ctrl+V / Cmd+V.',
      customTagPlaceholder: 'Custom S2 cue, e.g. soft voice',
      addCustomTag: 'Insert Cue',
      s1LegacyNotice: 'Legacy S1 uses (parenthesis) tags:',
      editorTab: 'Script Editor',
      directorTab: 'Segment Director',
      directorDesc: 'Fine-tune S2 [emotion], speed, and speaker voice per segment, then audition before stitching.',
      resplitFromScript: 'Re-split Script',
      addSegment: 'Add Segment',
      resetOverrides: 'Reset Overrides',
      segmentEmotion: 'Emotion / Style',
      noEmotion: 'Neutral (Auto)',
      customEmotionOption: 'Custom [cue]...',
      customEmotionPlaceholder: 'e.g. [warm storytelling]',
      segmentSpeed: 'Speed',
      globalSpeed: 'Global',
      segmentVoice: 'Speaker',
      globalVoice: 'Active Studio Voice',
      defaultNarrator: 'Default Narrator',
      auditionSegment: 'Preview',
      auditioning: 'Loading...',
      stopAudition: 'Stop',
      moveUp: 'Move up',
      moveDown: 'Move down',
      deleteSegment: 'Remove segment',
      directorEmpty: 'Enter script text first or click Add Segment to begin directing.',
    },
    player: {
      nowPlaying: 'Generated Output',
      play: 'Play',
      pause: 'Pause',
      mute: 'Mute',
      unmute: 'Unmute',
      volume: 'Volume',
      download: 'Download',
      downloading: 'Saving...',
      playbackRate: 'Playback Speed',
      pcmNotice: 'Preview wrapped in WAV header for browser playback; download exports raw PCM.',
      transcriptTitle: 'Transcription & Timestamps',
      extractTranscript: 'Extract Timestamps',
      reExtractTranscript: 'Re-extract',
      extractingTranscript: 'Aligning timestamps...',
      transcriptEmpty: 'Generate or extract timestamped captions to seek audio and export SRT, VTT, TXT, or JSON.',
      exportSrt: 'SRT',
      exportVtt: 'VTT',
      exportTxt: 'TXT',
      exportJson: 'JSON',
      copyTranscript: 'Copy',
      copiedNotice: 'Copied',
      txtTimestampsToggle: 'Include timestamps in TXT',
      modeAuto: 'Auto (Best Available)',
      modeAcoustic: 'Acoustic Alignment (Local)',
      modeFishAsr: 'Fish Audio ASR',
      modeGemini: 'Gemini AI Audio',
      sourceSegmentExact: 'Exact Segment Timing',
      sourceFishAsr: 'Fish Audio ASR',
      sourceGemini: 'Gemini Audio AI',
      sourceAcoustic: 'Acoustic Pause Alignment',
      viewTimeline: 'Timeline',
      viewInlineTxt: 'TXT Preview',
    },
    library: {
      title: 'Voice Library',
      subtitle: 'Discover public community voices and your own Fish Audio reference models.',
      searchPlaceholder: 'Search voices by title or keyword...',
      allCategories: 'All Categories',
      myVoicesOnly: 'My Voices Only',
      sortByPopular: 'Most Used',
      sortByNewest: 'Newest',
      allLanguages: 'All Languages',
      previewPlay: 'Preview',
      previewStop: 'Stop',
      previewLoading: 'Loading...',
      noPreview: 'No sample audio',
      selectVoice: 'Select Voice',
      selectedBadge: 'Selected',
      favoriteAdd: 'Add to favorites',
      favoriteRemove: 'Remove from favorites',
      usesCount: 'generations',
      loadMore: 'Load More Voices',
      loading: 'Loading voices from Fish Audio...',
      emptyTitle: 'No matching voices found',
      emptyDesc: 'Try adjusting your search query, language filter, or category tag.',
      authRequiredTitle: 'Connect Fish Audio API Key',
      authRequiredDesc: 'Configure your Fish Audio API key on the server to browse and preview live voice models.',
      goToApiConfig: 'Open API Configuration',
      categories: {
        all: 'All',
        narration: 'Narration',
        conversational: 'Conversational',
        news: 'News & Broadcast',
        audiobook: 'Audiobook',
        gaming: 'Gaming & Character',
        podcast: 'Podcast',
        commercial: 'Commercial',
      },
    },
    history: {
      title: 'Generation History',
      subtitle: 'Replay, inspect parameters, reload scripts, or download previously generated audio files.',
      searchPlaceholder: 'Search history by script or voice name...',
      clearAll: 'Clear History',
      clearConfirm: 'Delete all generated history?',
      cancel: 'Cancel',
      confirmDelete: 'Confirm Delete',
      playItem: 'Play',
      pauseItem: 'Pause',
      downloadItem: 'Download',
      loadInStudio: 'Load in Studio',
      deleteItem: 'Delete',
      emptyTitle: 'No generations yet',
      emptyDesc: 'Synthesize your first script in Voice Studio and it will be saved here automatically.',
      goToStudio: 'Go to Voice Studio',
      voiceLabel: 'Voice',
      modelLabel: 'Model',
      sizeLabel: 'Size',
    },
    favorites: {
      title: 'Favorite Voices',
      subtitle: 'Your saved Fish Audio voice models for rapid production access.',
      emptyTitle: 'No favorite voices saved',
      emptyDesc: 'Star any voice in the Voice Library to pin it here for quick studio selection.',
      browseLibrary: 'Browse Voice Library',
      useInStudio: 'Use in Studio',
      removeFavorite: 'Remove',
    },
    settings: {
      title: 'Settings',
      subtitle: 'Customize interface language and default Fish Audio generation parameters.',
      interfaceSection: 'Interface & Localization',
      languageLabel: 'Display Language',
      languageDesc: 'Switch between English (LTR) and Arabic (RTL) across the entire workspace.',
      englishOption: 'English (LTR)',
      arabicOption: 'العربية (RTL)',
      defaultsSection: 'Default Generation Parameters',
      defaultsDesc: 'These values initialize the Voice Studio parameter console on startup.',
      saveDefaults: 'Save Default Settings',
      savedNotice: 'Preferences saved.',
      resetDefaults: 'Restore Factory Defaults',
    },
    apiConfig: {
      title: 'API Configuration',
      subtitle: 'Manage your Fish Audio API credentials securely on the backend server.',
      statusLabel: 'Connection Status',
      connected: 'Connected',
      notConfigured: 'Not Configured',
      sourceEnv: 'Server Environment Variable',
      sourceUser: 'Encrypted Server Keystore',
      sourceNone: 'No Key Configured',
      creditsLabel: 'API Credit Balance',
      maskedKeyLabel: 'Active Key Identifier',
      keyInputLabel: 'Fish Audio API Key',
      keyInputPlaceholder: 'Paste your Fish Audio API key...',
      saveAndVerify: 'Verify & Save Key',
      verifying: 'Verifying with Fish Audio...',
      testConnection: 'Test Connection',
      testing: 'Testing...',
      removeKey: 'Remove Saved Key',
      docsLinkLabel: 'Official Fish Audio Documentation',
      securityNote: 'Your API key is encrypted with AES-256-GCM on the backend server and is never exposed to browser JavaScript or stored in localStorage.',
      testSuccess: 'Authentication verified with Fish Audio API.',
      saveSuccess: 'API key verified and securely stored on the server.',
      removeSuccess: 'Saved API key removed from server keystore.',
    },
    common: {
      dismiss: 'Dismiss',
      retry: 'Retry',
      defaultVoice: 'Default Voice',
    },
  },
  ar: {
    brandName: 'Voice Studio AI',
    nav: {
      studio: 'استوديو الصوت',
      library: 'مكتبة الأصوات',
      history: 'سجل التوليد',
      favorites: 'المفضلة',
      settings: 'الإعدادات',
      apiConfig: 'إعدادات API',
    },
    header: {
      configureApiKey: 'إعداد مفتاح API',
      apiReady: 'متصل بـ Fish Audio',
      apiRequired: 'مطلوب مفتاح API',
      languageToggle: 'English',
      openMenu: 'فتح قائمة التنقل',
    },
    studio: {
      title: 'استوديو الصوت',
      subtitle: 'اكتب النص أو الصقه، اختر نموذج الصوت، وقم بتوليد صوت طبيعي عبر واجهة Fish Audio.',
      scriptLabel: 'محرر النص',
      scriptPlaceholder: 'أدخل النص أو الصقه هنا... ضع وسوم S2 مثل [calm] أو [excited] أو [whispering] في بداية الجملة.',
      pasteText: 'لصق النص',
      clearText: 'مسح',
      characters: 'حرف',
      words: 'كلمة',
      estimatedDuration: 'المدة التقريبية',
      selectedVoice: 'الصوت النشط',
      defaultVoiceTitle: 'صوت Fish Audio الافتراضي',
      defaultVoiceDesc: 'صوت استوديو متوازن يُستخدم عند عدم تحديد معرف صوت مخصص.',
      changeVoice: 'تصفح الأصوات',
      clearVoice: 'استخدام الافتراضي',
      generateButton: 'توليد الصوت',
      generatingButton: 'جارٍ توليد الصوت...',
      generationProgress: 'جارٍ معالجة الصوت عبر خوادم Fish Audio...',
      generationSuccess: 'تم توليد الصوت وحفظه في السجل.',
      emotionTip: 'وسوم التعبير S2 [قوسين] (تُدرج عند المؤشر):',
      insertTag: 'إدراج',
      paramsTitle: 'إعدادات توليد الصوت',
      resetParams: 'إعادة ضبط',
      modelLabel: 'نموذج التوليد',
      formatLabel: 'صيغة الملف',
      bitrateLabel: 'معدل البت',
      sampleRateLabel: 'معدل العينة',
      speedLabel: 'سرعة الكلام',
      volumeLabel: 'مستوى الصوت (dB)',
      temperatureLabel: 'درجة التنوع (Temperature)',
      topPLabel: 'معامل Top P',
      repetitionPenaltyLabel: 'منع التكرار (Repetition Penalty)',
      chunkLengthLabel: 'طول المقطع (Chunk Length)',
      latencyLabel: 'وضع الاستجابة',
      normalizeLabel: 'تطبيع النص',
      normalizeDesc: 'تحويل الأرقام والتواريخ والاختصارات تلقائياً لنطق أوضح.',
      continuousLabel: 'السرد المتصل (Continuous Narration)',
      continuousDesc: 'تقسيم النصوص الطويلة تلقائياً إلى مقاطع جُملية ثم دمجها في ملف صوتي واحد متواصل.',
      segmentPauseLabel: 'الوقفة بين المقاطع',
      pauseNone: 'متصل مباشرة (0 ms)',
      pauseShort: 'طبيعي (150 ms)',
      pauseMedium: 'متأنٍ (350 ms)',
      concurrencyLabel: 'سرعة التوليد',
      concurrency1: 'تسلسلي (1x)',
      concurrency2: 'سريع (مقطعان بالتوازي 2x)',
      concurrency3: 'توربو (3 مقاطع بالتوازي 3x)',
      segmentsEstimate: 'مقاطع',
      segmentProgress: 'جارٍ التوليد بالتوازي (اكتمل {current} من {total})',
      stitchingAudio: 'جارٍ دمج {total} مقاطع صوتية في ملف واحد...',
      cancelGeneration: 'إلغاء',
      autoSampleRate: 'افتراضي الصيغة',
      latencyNormal: 'عادي (أعلى جودة)',
      latencyBalanced: 'متوازن (استجابة أسرع)',
      apiMissingBanner: 'لم يتم إعداد مفتاح Fish Audio API على الخادم بعد. أضف مفتاحك لتوليد الصوت وتصفح الأصوات.',
      apiMissingAction: 'إعداد مفتاح API',
      emptyTextError: 'يرجى إدخال نص قبل توليد الصوت.',
      clipboardError: 'تعذر الوصول إلى الحافظة. يرجى اللصق باستخدام Ctrl+V أو Cmd+V.',
      customTagPlaceholder: 'تعبير مخصص مثل: بصوت دافئ أو soft voice',
      addCustomTag: 'إدراج',
      s1LegacyNotice: 'نموذج S1 القديم يستخدم الأقواس الدائرية:',
      editorTab: 'محرر النص',
      directorTab: 'مخرج المقاطع',
      directorDesc: 'تحكم بمشاعر [S2] وسرعة النطق والصوت لكل مقطع على حدة، وعايِن كل مقطع قبل الدمج النهائي.',
      resplitFromScript: 'إعادة التقسيم من النص',
      addSegment: 'إضافة مقطع',
      resetOverrides: 'إعادة ضبط المقاطع',
      segmentEmotion: 'الشعور / الأسلوب',
      noEmotion: 'محايد (تلقائي)',
      customEmotionOption: 'وصف مخصص [..]',
      customEmotionPlaceholder: 'مثال: [بصوت هادئ]',
      segmentSpeed: 'السرعة',
      globalSpeed: 'عام',
      segmentVoice: 'المتحدث',
      globalVoice: 'الصوت النشط',
      defaultNarrator: 'الراوي الافتراضي',
      auditionSegment: 'معاينة',
      auditioning: 'جارٍ...',
      stopAudition: 'إيقاف',
      moveUp: 'تحريك للأعلى',
      moveDown: 'تحريك للأسفل',
      deleteSegment: 'حذف المقطع',
      directorEmpty: 'أدخل نصاً أولاً أو اضغط على إضافة مقطع لبدء الإخراج الصوتي.',
    },
    player: {
      nowPlaying: 'الملف الصوتي المُولّد',
      play: 'تشغيل',
      pause: 'إيقاف مؤقت',
      mute: 'كتم الصوت',
      unmute: 'إلغاء الكتم',
      volume: 'مستوى الصوت',
      download: 'تحميل',
      downloading: 'جارٍ الحفظ...',
      playbackRate: 'سرعة التشغيل',
      pcmNotice: 'تم تغليف المعاينة برأس WAV للتشغيل في المتصفح؛ التنزيل يحفظ ملف PCM خام.',
      transcriptTitle: 'النص والتوقيتات (Timestamps)',
      extractTranscript: 'استخراج التوقيتات',
      reExtractTranscript: 'إعادة الاستخراج',
      extractingTranscript: 'جارٍ تحليل التوقيتات...',
      transcriptEmpty: 'استخرج النص الموقّت للانتقال السريع عبر الصوت وتصدير ملفات SRT و VTT و TXT و JSON.',
      exportSrt: 'SRT',
      exportVtt: 'VTT',
      exportTxt: 'TXT',
      exportJson: 'JSON',
      copyTranscript: 'نسخ',
      copiedNotice: 'تم النسخ',
      txtTimestampsToggle: 'تضمين التوقيت في TXT',
      modeAuto: 'تلقائي (الأفضل المتاح)',
      modeAcoustic: 'محاذاة صوتية محلية (FFmpeg)',
      modeFishAsr: 'Fish Audio ASR',
      modeGemini: 'Gemini Audio AI',
      sourceSegmentExact: 'توقيت دقيق حسب المقاطع',
      sourceFishAsr: 'Fish Audio ASR',
      sourceGemini: 'Gemini Audio AI',
      sourceAcoustic: 'محاذاة صوتية مع الوقفات',
      viewTimeline: 'الخط الزمني',
      viewInlineTxt: 'معاينة TXT',
    },
    library: {
      title: 'مكتبة الأصوات',
      subtitle: 'استكشف الأصوات العامة المتاحة ونماذجك الصوتية الخاصة على Fish Audio.',
      searchPlaceholder: 'ابحث عن صوت بالاسم أو الكلمة المفتاحية...',
      allCategories: 'كل التصنيفات',
      myVoicesOnly: 'أصواتي فقط',
      sortByPopular: 'الأكثر استخداماً',
      sortByNewest: 'الأحدث',
      allLanguages: 'جميع اللغات',
      previewPlay: 'معاينة',
      previewStop: 'إيقاف',
      previewLoading: 'جارٍ التحميل...',
      noPreview: 'لا توجد عينة صوتية',
      selectVoice: 'اختيار الصوت',
      selectedBadge: 'مُختار',
      favoriteAdd: 'إضافة للمفضلة',
      favoriteRemove: 'إزالة من المفضلة',
      usesCount: 'توليد',
      loadMore: 'تحميل المزيد',
      loading: 'جارٍ تحميل الأصوات من Fish Audio...',
      emptyTitle: 'لم يتم العثور على أصوات مطابقة',
      emptyDesc: 'جرّب تغيير نص البحث أو اللغة أو التصنيف.',
      authRequiredTitle: 'اربط مفتاح Fish Audio API',
      authRequiredDesc: 'قم بإعداد مفتاح Fish Audio API على الخادم لعرض وتصفح نماذج الأصوات المباشرة.',
      goToApiConfig: 'الانتقال إلى إعدادات API',
      categories: {
        all: 'الكل',
        narration: 'السرد والوثائقيات',
        conversational: 'المحادثة',
        news: 'الأخبار والبث',
        audiobook: 'الكتب الصوتية',
        gaming: 'الألعاب والشخصيات',
        podcast: 'البودكاست',
        commercial: 'الإعلانات',
      },
    },
    history: {
      title: 'سجل التوليد',
      subtitle: 'أعد تشغيل التسجيلات السابقة، راجع الإعدادات، أو قم بتنزيل الملفات الصوتية.',
      searchPlaceholder: 'ابحث في السجل بالنص أو اسم الصوت...',
      clearAll: 'مسح السجل',
      clearConfirm: 'حذف جميع التسجيلات؟',
      cancel: 'إلغاء',
      confirmDelete: 'تأكيد الحذف',
      playItem: 'تشغيل',
      pauseItem: 'إيقاف',
      downloadItem: 'تحميل',
      loadInStudio: 'فتح في الاستوديو',
      deleteItem: 'حذف',
      emptyTitle: 'لا توجد تسجيلات بعد',
      emptyDesc: 'قم بتوليد أول مقطع صوتي في الاستوديو وسيتم حفظه هنا تلقائياً.',
      goToStudio: 'الانتقال إلى الاستوديو',
      voiceLabel: 'الصوت',
      modelLabel: 'النموذج',
      sizeLabel: 'الحجم',
    },
    favorites: {
      title: 'الأصوات المفضلة',
      subtitle: 'نماذج Fish Audio المحفوظة للوصول السريع أثناء الإنتاج.',
      emptyTitle: 'لا توجد أصوات مفضلة',
      emptyDesc: 'اضغط على أيقونة النجمة في مكتبة الأصوات لحفظ الأصوات المفضلة هنا.',
      browseLibrary: 'تصفح مكتبة الأصوات',
      useInStudio: 'استخدام في الاستوديو',
      removeFavorite: 'إزالة',
    },
    settings: {
      title: 'الإعدادات',
      subtitle: 'تخصيص لغة الواجهة والمعاملات الافتراضية لتوليد الصوت.',
      interfaceSection: 'الواجهة واللغة',
      languageLabel: 'لغة العرض',
      languageDesc: 'التبديل بين الإنجليزية (من اليسار لليمين) والعربية (من اليمين لليسار).',
      englishOption: 'English (LTR)',
      arabicOption: 'العربية (RTL)',
      defaultsSection: 'الإعدادات الافتراضية للتوليد',
      defaultsDesc: 'تُستخدم هذه القيم لتهيئة لوحة التحكم عند فتح استوديو الصوت.',
      saveDefaults: 'حفظ الإعدادات الافتراضية',
      savedNotice: 'تم حفظ التفضيلات.',
      resetDefaults: 'استعادة الإعدادات الأصلية',
    },
    apiConfig: {
      title: 'إعدادات API',
      subtitle: 'إدارة بيانات اعتماد Fish Audio API بأمان تام على الخادم.',
      statusLabel: 'حالة الاتصال',
      connected: 'متصل',
      notConfigured: 'غير مُعد',
      sourceEnv: 'متغير بيئة الخادم',
      sourceUser: 'مخزن المفاتيح المشفر على الخادم',
      sourceNone: 'لا يوجد مفتاح مُعد',
      creditsLabel: 'رصيد API المتاح',
      maskedKeyLabel: 'معرف المفتاح النشط',
      keyInputLabel: 'مفتاح Fish Audio API',
      keyInputPlaceholder: 'ألصق مفتاح Fish Audio API هنا...',
      saveAndVerify: 'التحقق والحفظ',
      verifying: 'جارٍ التحقق عبر Fish Audio...',
      testConnection: 'اختبار الاتصال',
      testing: 'جارٍ الاختبار...',
      removeKey: 'إزالة المفتاح المحفوظ',
      docsLinkLabel: 'توثيق Fish Audio الرسمي',
      securityNote: 'يتم تشفير مفتاح API باستخدام AES-256-GCM على الخادم الخلفي ولا يتم إرساله مطلقاً إلى المتصفح أو تخزينه في localStorage.',
      testSuccess: 'تم التحقق من المصادقة بنجاح مع واجهة Fish Audio.',
      saveSuccess: 'تم التحقق من المفتاح وحفظه مشفراً على الخادم.',
      removeSuccess: 'تمت إزالة المفتاح المحفوظ من الخادم.',
    },
    common: {
      dismiss: 'إغلاق',
      retry: 'إعادة المحاولة',
      defaultVoice: 'الصوت الافتراضي',
    },
  },
};
