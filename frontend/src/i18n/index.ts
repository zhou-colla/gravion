import { en } from './en';
import { zh } from './zh';

export type LanguageKey = keyof typeof en;
export type Translation = typeof en;

export const translations = {
  en,
  zh,
};

export type Language = keyof typeof translations;

export const defaultLanguage: Language = 'en';

export const getTranslation = (language: Language): Translation => {
  return translations[language] || translations[defaultLanguage];
};

export const getSupportedLanguages = (): { code: Language; name: string }[] => {
  return [
    { code: 'en', name: translations.en.english },
    { code: 'zh', name: translations.zh.chinese },
  ];
};
