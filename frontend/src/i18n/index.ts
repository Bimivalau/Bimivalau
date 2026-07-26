/**
 * i18next setup.
 *
 * Language resolution order, checked once at startup (see `initI18n`, called
 * from the root layout before anything renders):
 *   1. A previously persisted user choice (Settings screen) — AsyncStorage.
 *   2. The phone's system locale (expo-localization) — French if the device
 *      is set to French, English otherwise.
 *
 * Namespaces map 1:1 to a screen or feature area (see locales/en/*.json).
 * User-generated content (hairstyle names/descriptions, braider bios,
 * portfolio captions, reviews, addresses) is NEVER translated — only static
 * UI chrome (buttons, labels, headers, error copy) goes through `t()`.
 */
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import { storage } from "@/src/utils/storage";

import commonEn from "./locales/en/common.json";
import welcomeEn from "./locales/en/welcome.json";
import authEn from "./locales/en/auth.json";
import onboardingEn from "./locales/en/onboarding.json";
import safetyEn from "./locales/en/safety.json";
import homeEn from "./locales/en/home.json";
import searchEn from "./locales/en/search.json";
import hairstyleEn from "./locales/en/hairstyle.json";
import hairdresserEn from "./locales/en/hairdresser.json";
import viewerEn from "./locales/en/viewer.json";
import bookingEn from "./locales/en/booking.json";
import profileEn from "./locales/en/profile.json";
import notificationsEn from "./locales/en/notifications.json";
import proStudioEn from "./locales/en/pro_studio.json";
import proDashboardEn from "./locales/en/pro_dashboard.json";
import settingsEn from "./locales/en/settings.json";
import navigationEn from "./locales/en/navigation.json";

import commonFr from "./locales/fr/common.json";
import welcomeFr from "./locales/fr/welcome.json";
import authFr from "./locales/fr/auth.json";
import onboardingFr from "./locales/fr/onboarding.json";
import safetyFr from "./locales/fr/safety.json";
import homeFr from "./locales/fr/home.json";
import searchFr from "./locales/fr/search.json";
import hairstyleFr from "./locales/fr/hairstyle.json";
import hairdresserFr from "./locales/fr/hairdresser.json";
import viewerFr from "./locales/fr/viewer.json";
import bookingFr from "./locales/fr/booking.json";
import profileFr from "./locales/fr/profile.json";
import notificationsFr from "./locales/fr/notifications.json";
import proStudioFr from "./locales/fr/pro_studio.json";
import proDashboardFr from "./locales/fr/pro_dashboard.json";
import settingsFr from "./locales/fr/settings.json";
import navigationFr from "./locales/fr/navigation.json";

export const SUPPORTED_LANGUAGES = ["en", "fr"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const LANGUAGE_STORAGE_KEY = "braids_language";

const resources = {
  en: {
    common: commonEn,
    welcome: welcomeEn,
    auth: authEn,
    onboarding: onboardingEn,
    safety: safetyEn,
    home: homeEn,
    search: searchEn,
    hairstyle: hairstyleEn,
    hairdresser: hairdresserEn,
    viewer: viewerEn,
    booking: bookingEn,
    profile: profileEn,
    notifications: notificationsEn,
    pro_studio: proStudioEn,
    pro_dashboard: proDashboardEn,
    settings: settingsEn,
    navigation: navigationEn,
  },
  fr: {
    common: commonFr,
    welcome: welcomeFr,
    auth: authFr,
    onboarding: onboardingFr,
    safety: safetyFr,
    home: homeFr,
    search: searchFr,
    hairstyle: hairstyleFr,
    hairdresser: hairdresserFr,
    viewer: viewerFr,
    booking: bookingFr,
    profile: profileFr,
    notifications: notificationsFr,
    pro_studio: proStudioFr,
    pro_dashboard: proDashboardFr,
    settings: settingsFr,
    navigation: navigationFr,
  },
};

function isSupported(lang: string | null | undefined): lang is SupportedLanguage {
  return !!lang && (SUPPORTED_LANGUAGES as readonly string[]).includes(lang);
}

function deviceLanguage(): SupportedLanguage {
  const code = Localization.getLocales()[0]?.languageCode;
  return code === "fr" ? "fr" : "en";
}

let initialized = false;

/** Call once, before the app renders anything (see app/_layout.tsx). */
export async function initI18n(): Promise<void> {
  if (initialized) return;
  const saved = await storage.getItem<string>(LANGUAGE_STORAGE_KEY, "");
  const lng = isSupported(saved) ? saved : deviceLanguage();

  await i18next.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: "en",
    defaultNS: "common",
    ns: Object.keys(resources.en),
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  initialized = true;
}

/** Switch language and persist the choice so it survives app restarts. */
export async function setLanguage(lang: SupportedLanguage): Promise<void> {
  await storage.setItem(LANGUAGE_STORAGE_KEY, lang);
  await i18next.changeLanguage(lang);
}

export function getLanguage(): SupportedLanguage {
  return isSupported(i18next.language) ? (i18next.language as SupportedLanguage) : "en";
}

export default i18next;
