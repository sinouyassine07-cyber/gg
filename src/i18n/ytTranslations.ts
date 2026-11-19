import type { UILanguage, YouTubeNavSection } from '../types';
import type {
  MotionEffect,
  ProductionStageKey,
  TransitionType,
  VideoCategory,
  VisualStyle,
} from '../types/youtube';

export interface YouTubeTranslations {
  moduleTitle: string;
  voiceStudioGroup: string;
  nav: Record<YouTubeNavSection, string>;
  categories: Record<VideoCategory, string>;
  visualStyles: Record<VisualStyle, string>;
  motions: Record<MotionEffect, string>;
  transitions: Record<TransitionType, string>;
  stages: Record<ProductionStageKey, string>;
  noProjectTitle: string;
  noProjectDesc: string;
  createProjectBtn: string;
  openDashboardBtn: string;
  saving: string;
  saved: string;
  common: {
    scenes: string;
    chapters: string;
    duration: string;
    approved: string;
    pending: string;
    missing: string;
    uploaded: string;
    copy: string;
    copied: string;
    download: string;
    delete: string;
    duplicate: string;
    rename: string;
    open: string;
    continueProduction: string;
    cancel: string;
    save: string;
    retry: string;
    refresh: string;
  };
}

export const YT_TRANSLATIONS: Record<UILanguage, YouTubeTranslations> = {
  en: {
    moduleTitle: 'AI YouTube Studio',
    voiceStudioGroup: 'Voice Studio',
    nav: {
      'yt-dashboard': 'Project Dashboard',
      'yt-create': 'Create New Video',
      'yt-script': 'AI Script Studio',
      'yt-voiceover': 'Voiceover Studio',
      'yt-scenes': 'Smart Scene Director',
      'yt-prompts': 'Image Prompt Manager',
      'yt-uploads': 'Image Upload Manager',
      'yt-subtitles': 'Subtitle Studio',
      'yt-editor': 'Automatic Video Editor',
      'yt-production': 'Production Manager',
      'yt-export': 'Export Center',
    },
    categories: {
      documentary: 'Documentary',
      'historical-documentary': 'Historical Documentary',
      'true-crime': 'True Crime',
      educational: 'Educational',
      'science-tech': 'Science & Technology',
      mysteries: 'Mysteries',
      storytelling: 'Storytelling',
      biography: 'Biography',
      'business-finance': 'Business & Finance',
      'news-analysis': 'News & Analysis',
      entertainment: 'Entertainment',
    },
    visualStyles: {
      'cinematic-photorealism': 'Cinematic Photorealism',
      'documentary-photography': 'Documentary Photography',
      'historical-realism': 'Historical Realism',
      'dark-cinematic': 'Dark Cinematic',
      '3d-animation': '3D Animation',
      illustration: 'Narrative Illustration',
      'realistic-photography': 'Realistic Photography',
    },
    motions: {
      'slow-zoom-in': 'Slow Zoom In',
      'slow-zoom-out': 'Slow Zoom Out',
      'pan-left': 'Pan Left',
      'pan-right': 'Pan Right',
      'pan-up': 'Pan Up',
      'pan-down': 'Pan Down',
      'ken-burns': 'Ken Burns Effect',
      'diagonal-drift': 'Diagonal Camera Movement',
      'cinematic-drift': 'Cinematic Camera Drift',
      static: 'Static Shot',
    },
    transitions: {
      crossfade: 'Crossfade',
      dissolve: 'Dissolve',
      'fade-black': 'Fade to Black',
      'smooth-cut': 'Smooth Cut',
      'cinematic-fade': 'Cinematic Fade',
    },
    stages: {
      project_creation: '1. Project Creation',
      script_generation: '2. Script Generation',
      script_approval: '3. Script Approval',
      voice_generation: '4. Voice Generation',
      audio_analysis: '5. Audio Analysis',
      scene_planning: '6. Scene Planning',
      prompt_generation: '7. Prompt Generation',
      image_upload: '8. Image Upload',
      scene_approval: '9. Scene Approval',
      video_assembly: '10. Video Assembly',
      subtitle_processing: '11. Subtitle Processing',
      audio_mixing: '12. Audio Mixing',
      final_rendering: '13. Final Rendering',
      export: '14. Export',
    },
    noProjectTitle: 'Select or Create a YouTube Project',
    noProjectDesc:
      'Open an existing project from the Project Dashboard or start a new long-form video production.',
    createProjectBtn: 'Create New Video',
    openDashboardBtn: 'Project Dashboard',
    saving: 'Auto-saving...',
    saved: 'All changes saved',
    common: {
      scenes: 'scenes',
      chapters: 'chapters',
      duration: 'Duration',
      approved: 'Approved',
      pending: 'Pending',
      missing: 'Missing',
      uploaded: 'Uploaded',
      copy: 'Copy',
      copied: 'Copied',
      download: 'Download',
      delete: 'Delete',
      duplicate: 'Duplicate',
      rename: 'Rename',
      open: 'Open',
      continueProduction: 'Continue Production',
      cancel: 'Cancel',
      save: 'Save',
      retry: 'Retry',
      refresh: 'Refresh',
    },
  },
  ar: {
    moduleTitle: 'استوديو يوتيوب الذكي',
    voiceStudioGroup: 'استوديو الصوت',
    nav: {
      'yt-dashboard': 'لوحة المشاريع',
      'yt-create': 'إنشاء فيديو جديد',
      'yt-script': 'استوديو السكربت الذكي',
      'yt-voiceover': 'استوديو التعليق الصوتي',
      'yt-scenes': 'مخرج المشاهد الذكي',
      'yt-prompts': 'إدارة برومبتات الصور',
      'yt-uploads': 'إدارة رفع الصور',
      'yt-subtitles': 'استوديو الترجمة',
      'yt-editor': 'محرر الفيديو التلقائي',
      'yt-production': 'إدارة الإنتاج',
      'yt-export': 'مركز التصدير',
    },
    categories: {
      documentary: 'وثائقي',
      'historical-documentary': 'وثائقي تاريخي',
      'true-crime': 'جرائم حقيقية',
      educational: 'تعليمي',
      'science-tech': 'العلوم والتقنية',
      mysteries: 'ألغاز وغموض',
      storytelling: 'سرد قصصي',
      biography: 'سير ذاتية',
      'business-finance': 'أعمال ومال',
      'news-analysis': 'أخبار وتحليل',
      entertainment: 'ترفيه',
    },
    visualStyles: {
      'cinematic-photorealism': 'واقعية سينمائية فائقة',
      'documentary-photography': 'تصوير وثائقي',
      'historical-realism': 'واقعية تاريخية',
      'dark-cinematic': 'سينمائي داكن',
      '3d-animation': 'رسوم ثلاثية الأبعاد',
      illustration: 'رسم توضيحي سردي',
      'realistic-photography': 'تصوير فوتوغرافي واقعي',
    },
    motions: {
      'slow-zoom-in': 'تقريب بطيء',
      'slow-zoom-out': 'تبعيد بطيء',
      'pan-left': 'تحريك لليسار',
      'pan-right': 'تحريك لليمين',
      'pan-up': 'تحريك للأعلى',
      'pan-down': 'تحريك للأسفل',
      'ken-burns': 'تأثير كين بيرنز',
      'diagonal-drift': 'حركة كاميرا قطرية',
      'cinematic-drift': 'انسياب سينمائي',
      static: 'لقطة ثابتة',
    },
    transitions: {
      crossfade: 'تلاشي متقاطع',
      dissolve: 'ذوبان ناعم',
      'fade-black': 'تلاشي للأسود',
      'smooth-cut': 'قطع سلس',
      'cinematic-fade': 'انتقال سينمائي',
    },
    stages: {
      project_creation: '1. إنشاء المشروع',
      script_generation: '2. توليد السكربت',
      script_approval: '3. اعتماد السكربت',
      voice_generation: '4. توليد الصوت',
      audio_analysis: '5. تحليل الصوت',
      scene_planning: '6. تخطيط المشاهد',
      prompt_generation: '7. توليد البرومبتات',
      image_upload: '8. رفع الصور',
      scene_approval: '9. اعتماد المشاهد',
      video_assembly: '10. تجميع الفيديو',
      subtitle_processing: '11. معالجة الترجمة',
      audio_mixing: '12. هندسة الصوت والموسيقى',
      final_rendering: '13. المعالجة النهائية',
      export: '14. التصدير',
    },
    noProjectTitle: 'اختر مشروعاً أو أنشئ فيديو جديداً',
    noProjectDesc:
      'افتح مشروعاً محفوظاً من لوحة المشاريع أو ابدأ إنتاج فيديو يوتيوب طويل جديد.',
    createProjectBtn: 'إنشاء فيديو جديد',
    openDashboardBtn: 'لوحة المشاريع',
    saving: 'جارٍ الحفظ التلقائي...',
    saved: 'تم حفظ جميع التغييرات',
    common: {
      scenes: 'مشهد',
      chapters: 'فصول',
      duration: 'المدة',
      approved: 'معتمد',
      pending: 'قيد الانتظار',
      missing: 'ناقص',
      uploaded: 'مرفوع',
      copy: 'نسخ',
      copied: 'تم النسخ',
      download: 'تحميل',
      delete: 'حذف',
      duplicate: 'نسخ المشروع',
      rename: 'إعادة تسمية',
      open: 'فتح',
      continueProduction: 'متابعة الإنتاج',
      cancel: 'إلغاء',
      save: 'حفظ',
      retry: 'إعادة المحاولة',
      refresh: 'تحديث',
    },
  },
};
