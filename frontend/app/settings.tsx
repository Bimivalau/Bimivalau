import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors, spacing, font, radii } from "@/src/theme";
import { SafeScrollView, ResponsiveHeading, SectionTitle } from "@/src/ui";
import { setLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/src/i18n";

const LANGUAGE_LABEL_KEY: Record<SupportedLanguage, string> = {
  en: "language.english",
  fr: "language.french",
};

export default function Settings() {
  const router = useRouter();
  const { t, i18n } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");

  return (
    <SafeScrollView testID="settings-screen">
      <View style={{ paddingTop: spacing.md }}>
        <Pressable testID="settings-back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} hitSlop={12} style={{ minHeight: 44, width: 44, justifyContent: "center" }} accessibilityRole="button" accessibilityLabel={tCommon("buttons.back")}>
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <ResponsiveHeading size={30}>{t("title")}</ResponsiveHeading>

        <SectionTitle title={t("language_section")} style={{ marginTop: spacing.xl }} />
        <Text style={s.hint}>{t("language_hint")}</Text>

        <View style={{ marginTop: spacing.sm }}>
          {SUPPORTED_LANGUAGES.map((lang, idx) => {
            const active = i18n.language === lang;
            return (
              <Pressable
                key={lang}
                testID={`settings-lang-${lang}`}
                onPress={() => setLanguage(lang)}
                style={[s.row, idx === SUPPORTED_LANGUAGES.length - 1 && { borderBottomWidth: 0 }]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={s.rowText}>{tCommon(LANGUAGE_LABEL_KEY[lang])}</Text>
                {active && <Feather name="check" size={18} color={colors.brand} />}
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeScrollView>
  );
}

const s = StyleSheet.create({
  hint: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 13, marginTop: 4 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 52, borderBottomWidth: 1, borderColor: colors.divider, paddingVertical: spacing.sm },
  rowText: { fontFamily: font.bodyMed, color: colors.onSurface, fontSize: 15 },
});
