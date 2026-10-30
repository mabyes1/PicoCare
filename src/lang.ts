// Global product language. The server renders fresh local templates, prompts,
// and deterministic alert text in the active language; per-language stored rows
// (notes, weekly) keep history intact across switches.
export type Lang = 'en' | 'zh';
export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'zh';
export const normalizeLang = (v: unknown, fallback: Lang = 'zh'): Lang => (isLang(v) ? v : fallback);
export const envLang = (fallback: Lang = 'zh'): Lang => normalizeLang(process.env.PICOCARE_LANG, fallback);
