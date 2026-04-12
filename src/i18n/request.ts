import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { LOCALES, DEFAULT_LOCALE, LOCALE_COOKIE } from "./config";
import type { Locale } from "./config";

const messageLoaders: Record<Locale, () => Promise<{ default: Record<string, unknown> }>> = {
  ar: () => import("./messages/ar.json"),
  bg: () => import("./messages/bg.json"),
  cs: () => import("./messages/cs.json"),
  da: () => import("./messages/da.json"),
  de: () => import("./messages/de.json"),
  en: () => import("./messages/en.json"),
  es: () => import("./messages/es.json"),
  fi: () => import("./messages/fi.json"),
  fr: () => import("./messages/fr.json"),
  he: () => import("./messages/he.json"),
  hu: () => import("./messages/hu.json"),
  id: () => import("./messages/id.json"),
  hi: () => import("./messages/hi.json"),
  it: () => import("./messages/it.json"),
  ja: () => import("./messages/ja.json"),
  ko: () => import("./messages/ko.json"),
  ms: () => import("./messages/ms.json"),
  nl: () => import("./messages/nl.json"),
  no: () => import("./messages/no.json"),
  phi: () => import("./messages/phi.json"),
  pl: () => import("./messages/pl.json"),
  pt: () => import("./messages/pt.json"),
  "pt-BR": () => import("./messages/pt-BR.json"),
  ro: () => import("./messages/ro.json"),
  ru: () => import("./messages/ru.json"),
  sk: () => import("./messages/sk.json"),
  sv: () => import("./messages/sv.json"),
  th: () => import("./messages/th.json"),
  tr: () => import("./messages/tr.json"),
  "uk-UA": () => import("./messages/uk-UA.json"),
  vi: () => import("./messages/vi.json"),
  "zh-CN": () => import("./messages/zh-CN.json"),
};

export default getRequestConfig(async () => {
  // 1. Try cookie
  const cookieStore = await cookies();
  let locale: string = cookieStore.get(LOCALE_COOKIE)?.value || "";

  // 2. Try custom header (set by middleware)
  if (!locale) {
    const headerStore = await headers();
    locale = headerStore.get("x-locale") || "";
  }

  // 3. Validate & fallback
  if (!LOCALES.includes(locale as Locale)) {
    locale = DEFAULT_LOCALE;
  }

  const messages = (await messageLoaders[locale as Locale]()).default;

  return {
    locale,
    messages,
  };
});
