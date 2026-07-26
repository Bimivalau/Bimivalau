import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import { useSession } from "@/src/session";
import { colors, spacing, font, radii } from "@/src/theme";
import { setLanguage } from "@/src/i18n";

// The Welcome/Splash. Role choice, not a login form.
export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signInWithGoogle } = useSession();
  const { t, i18n } = useTranslation("welcome");
  const { t: tCommon } = useTranslation("common");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const google = async () => {
    setErr(null); setBusy(true);
    try {
      const res = await signInWithGoogle();
      if (!res) { setBusy(false); return; }
      router.replace(res.needs_pro_completion ? "/pro/onboarding" : "/");
    } catch (e: any) { setErr(e.message || t("google_error")); }
    finally { setBusy(false); }
  };
  const toggleLanguage = () => setLanguage(i18n.language === "fr" ? "en" : "fr");
  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceInverse }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ height: 520 }}>
          <Image source={{ uri: "https://images.unsplash.com/photo-1592520113018-180c8bc831c9?w=1000&q=85" }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.9)"]} style={StyleSheet.absoluteFill} />
          <View style={{ flex: 1, padding: spacing.xl, paddingTop: insets.top + spacing.lg, justifyContent: "flex-end" }}>
            <Text style={s.eyebrow}>{t("eyebrow")}</Text>
            <Text style={s.hero}>{t("hero_line1")}{"\n"}{t("hero_line2")}</Text>
            <Text style={s.sub}>{t("subtitle")}</Text>
          </View>
        </View>

        <View style={{ padding: spacing.xl, gap: spacing.md, backgroundColor: colors.surfaceInverse }}>
          <Pressable testID="welcome-lang-toggle" onPress={toggleLanguage} style={s.langRow} accessibilityRole="button" accessibilityLabel={tCommon("language.english") + " / " + tCommon("language.french")}>
            <Feather name="globe" size={14} color="#F9F6F0" />
            <Text style={s.langText}>{i18n.language === "fr" ? tCommon("language.french") : tCommon("language.english")}</Text>
          </Pressable>
          <Text style={s.chooseTitle}>{t("choose_title")}</Text>
          <Text style={s.explain}>{t("explain")}</Text>

          <Pressable testID="welcome-customer" onPress={() => router.push("/register?role=customer")} style={s.roleCard} accessibilityRole="button" accessibilityLabel={t("customer_a11y")}>
            <View style={{ flex: 1 }}>
              <Text style={s.roleTitle}>{t("customer_title")}</Text>
              <Text style={s.roleDesc}>{t("customer_desc")}</Text>
            </View>
            <Text style={s.roleArrow}>→</Text>
          </Pressable>

          <Pressable testID="welcome-braider" onPress={() => router.push("/register?role=hairdresser")} style={[s.roleCard, s.roleCardBraider]} accessibilityRole="button" accessibilityLabel={t("braider_a11y")}>
            <View style={{ flex: 1 }}>
              <Text style={[s.roleTitle, { color: "#fff" }]}>{t("braider_title")}</Text>
              <Text style={[s.roleDesc, { color: "#F9F6F0" }]}>{t("braider_desc")}</Text>
            </View>
            <Text style={[s.roleArrow, { color: "#fff" }]}>→</Text>
          </Pressable>

          <Pressable testID="welcome-existing" onPress={() => router.push("/login")} style={{ padding: spacing.md, alignItems: "center", marginTop: spacing.md }} accessibilityRole="button">
            <Text style={s.existingLink}>{t("existing_account")} <Text style={{ fontFamily: font.bodyBold, color: "#fff" }}>{t("sign_in")}</Text></Text>
          </Pressable>

          <View style={s.googleDivider}>
            <View style={s.gLine} />
            <Text style={s.gDivText}>{t("or_continue")}</Text>
            <View style={s.gLine} />
          </View>
          <Pressable testID="welcome-google" onPress={google} disabled={busy} style={s.googleBtn}>
            <View style={s.googleG}><Text style={s.googleGText}>G</Text></View>
            <Text style={s.googleBtnText}>{busy ? t("google_opening") : t("google_continue")}</Text>
          </Pressable>
          {err && <Text testID="welcome-err" style={{ color: "#FFB3B0", fontFamily: font.body, textAlign: "center", marginTop: spacing.sm }}>{err}</Text>}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  eyebrow: { color: "#E8CBBF", letterSpacing: 3, fontSize: 11, fontFamily: font.bodyMed, marginBottom: spacing.sm },
  hero: { color: "#F9F6F0", fontFamily: font.display, fontSize: 48, lineHeight: 52 },
  sub: { color: "#F9F6F0", opacity: 0.85, fontFamily: font.body, fontSize: 15, marginTop: spacing.md, maxWidth: 320 },
  chooseTitle: { color: "#F9F6F0", fontFamily: font.displayIt, fontSize: 20, marginTop: spacing.lg, marginBottom: spacing.md },
  explain: { color: "#F9F6F0", opacity: 0.7, fontFamily: font.body, fontSize: 13, lineHeight: 19, marginBottom: spacing.md },
  langRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center", alignSelf: "flex-start", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", borderRadius: radii.pill },
  langText: { color: "#F9F6F0", fontFamily: font.bodyMed, fontSize: 12, letterSpacing: 1 },
  langHint: { color: "#F9F6F0", opacity: 0.5, fontFamily: font.body, fontSize: 11 },
  roleCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, backgroundColor: "#F9F6F0", borderRadius: radii.md },
  roleCardBraider: { backgroundColor: colors.brand },
  roleTitle: { fontFamily: font.display, fontSize: 22, color: colors.onSurface },
  roleDesc: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 13, marginTop: 2 },
  roleArrow: { fontFamily: font.display, fontSize: 28, color: colors.brand },
  existingLink: { color: "#F9F6F0", opacity: 0.75, fontFamily: font.body, fontSize: 14 },
  googleDivider: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md, marginBottom: spacing.sm },
  gLine: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.2)" },
  gDivText: { color: "#F9F6F0", opacity: 0.55, fontFamily: font.bodyMed, fontSize: 10, letterSpacing: 2 },
  googleBtn: { flexDirection: "row", gap: spacing.md, alignItems: "center", justifyContent: "center", paddingVertical: spacing.lg, borderRadius: radii.md, backgroundColor: "#fff" },
  googleG: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#4285F4" },
  googleGText: { fontFamily: font.bodyBold, color: "#4285F4", fontSize: 13 },
  googleBtnText: { fontFamily: font.bodyBold, color: colors.onSurface, fontSize: 15 },
});
