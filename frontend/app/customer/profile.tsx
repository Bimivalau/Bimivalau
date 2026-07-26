import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useSession } from "@/src/session";
import { colors, spacing, font, radii } from "@/src/theme";

export default function CustomerProfileCompletion() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh } = useSession();
  const { t } = useTranslation("profile");
  const { t: tCommon } = useTranslation("common");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null); setBusy(true);
    try {
      await api("/customers/me/profile", { method: "POST", body: JSON.stringify({ country: country.trim(), city: city.trim() }) });
      await refresh();
      router.replace("/(tabs)/home");
    } catch (e: any) { setErr(e.message || t("completion.save_error")); }
    finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: insets.top + spacing.xl }} keyboardShouldPersistTaps="handled">
        <Pressable testID="cp-back" onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={s.title}>{t("completion.title")}</Text>
        <Text style={s.sub}>{t("completion.subtitle")}</Text>

        <Text style={s.label}>{t("completion.country_label")}</Text>
        <TextInput testID="cp-country" value={country} onChangeText={setCountry} placeholder={t("completion.country_placeholder")} placeholderTextColor={colors.muted} style={s.input} />
        <Text style={s.label}>{t("completion.city_label")}</Text>
        <TextInput testID="cp-city" value={city} onChangeText={setCity} placeholder={t("completion.city_placeholder")} placeholderTextColor={colors.muted} style={s.input} />
        <Text style={{ ...s.help, marginTop: spacing.md }}>{t("completion.help")}</Text>

        {err && <Text testID="cp-err" style={{ color: colors.error, marginTop: spacing.md, fontFamily: font.body }}>{err}</Text>}
        <Pressable testID="cp-submit" onPress={submit} disabled={busy || !country.trim() || !city.trim()} style={[s.btn, (busy || !country.trim() || !city.trim()) && { opacity: 0.4 }]}>
          <Text style={s.btnText}>{busy ? tCommon("states.saving") : t("completion.submit_cta")}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 34, color: colors.onSurface, marginTop: spacing.lg },
  sub: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 14, marginTop: spacing.xs, marginBottom: spacing.xl },
  label: { fontFamily: font.bodyMed, color: colors.onSurfaceSecondary, fontSize: 12, letterSpacing: 1, marginTop: spacing.md },
  input: { borderBottomWidth: 1, borderColor: colors.borderStrong, paddingVertical: spacing.md, fontFamily: font.body, color: colors.onSurface, fontSize: 16 },
  help: { fontFamily: font.body, color: colors.muted, fontSize: 12 },
  btn: { backgroundColor: colors.brand, padding: spacing.lg, alignItems: "center", marginTop: spacing.xl, borderRadius: radii.md },
  btnText: { color: "#fff", fontFamily: font.bodyBold },
});
