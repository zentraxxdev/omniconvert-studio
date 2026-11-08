import React from 'react';
import { Globe } from 'lucide-react';
import { SUPPORTED_LOCALES, useI18n, type SupportedLocale } from '../hooks/useI18n';

export const I18nSelector: React.FC = () => {
  const { locale, setLocale } = useI18n();

  return (
    <div className="relative flex items-center">
      <Globe className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 pointer-events-none" />
      <select
        aria-label="Select Language"
        value={locale}
        onChange={(e) => void setLocale(e.target.value as SupportedLocale)}
        className="min-h-[36px] pl-7 pr-6 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-200 focus:outline-none focus:border-zinc-600 cursor-pointer"
      >
        {SUPPORTED_LOCALES.map((item) => (
          <option key={item.code} value={item.code} className="bg-zinc-950 text-zinc-100">
            {item.flag} · {item.nativeName}
          </option>
        ))}
      </select>
    </div>
  );
};
