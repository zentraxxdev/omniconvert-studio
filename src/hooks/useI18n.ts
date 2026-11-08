import { create } from 'zustand';
import enMessages from '../locales/en.json';

export type SupportedLocale = 'en' | 'tr' | 'bg' | 'de' | 'es';
export type TranslationKey = keyof typeof enMessages;
export type TranslationDictionary = Record<TranslationKey, string>;

export interface LocaleMetadata {
  code: SupportedLocale;
  label: string;
  nativeName: string;
  flag: string;
}

export const SUPPORTED_LOCALES: LocaleMetadata[] = [
  { code: 'en', label: 'English', nativeName: 'English', flag: 'EN' },
  { code: 'tr', label: 'Turkish', nativeName: 'Türkçe', flag: 'TR' },
  { code: 'bg', label: 'Bulgarian', nativeName: 'Български', flag: 'BG' },
  { code: 'de', label: 'German', nativeName: 'Deutsch', flag: 'DE' },
  { code: 'es', label: 'Spanish', nativeName: 'Español', flag: 'ES' },
];

const LOCALE_STORAGE_KEY = 'omnitool_locale';

// Lazy-loaded locale importers so non-English dictionaries are split into separate async chunks
const localeLoaders: Record<SupportedLocale, () => Promise<{ default: TranslationDictionary }>> = {
  en: async () => ({ default: enMessages }),
  tr: () => import('../locales/tr.json'),
  bg: () => import('../locales/bg.json'),
  de: () => import('../locales/de.json'),
  es: () => import('../locales/es.json'),
};

function detectInitialLocale(): SupportedLocale {
  try {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY) as SupportedLocale | null;
    if (saved && SUPPORTED_LOCALES.some((l) => l.code === saved)) {
      return saved;
    }
    const browserLang = (navigator.language || 'en').slice(0, 2).toLowerCase() as SupportedLocale;
    if (SUPPORTED_LOCALES.some((l) => l.code === browserLang)) {
      return browserLang;
    }
  } catch {
    // Fallback to English
  }
  return 'en';
}

interface I18nState {
  locale: SupportedLocale;
  dictionary: TranslationDictionary;
  isLoadingLocale: boolean;
  setLocale: (locale: SupportedLocale) => Promise<void>;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export const useI18n = create<I18nState>((set, get) => ({
  locale: 'en',
  dictionary: enMessages,
  isLoadingLocale: false,
  setLocale: async (targetLocale: SupportedLocale) => {
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, targetLocale);
    } catch {
      // Ignore storage errors
    }

    if (targetLocale === 'en') {
      document.documentElement.lang = 'en';
      set({ locale: 'en', dictionary: enMessages, isLoadingLocale: false });
      return;
    }

    set({ isLoadingLocale: true });
    try {
      const loader = localeLoaders[targetLocale];
      const mod = await loader();
      document.documentElement.lang = targetLocale;
      set({
        locale: targetLocale,
        dictionary: { ...enMessages, ...mod.default },
        isLoadingLocale: false,
      });
    } catch {
      document.documentElement.lang = 'en';
      set({ locale: 'en', dictionary: enMessages, isLoadingLocale: false });
    }
  },
  t: (key: TranslationKey, params?: Record<string, string | number>): string => {
    const dict = get().dictionary;
    let template = dict[key] ?? enMessages[key] ?? String(key);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        template = template.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return template;
  },
}));

// Initialize browser-detected or saved locale on startup
const initialLocale = detectInitialLocale();
if (initialLocale !== 'en') {
  void useI18n.getState().setLocale(initialLocale);
}
