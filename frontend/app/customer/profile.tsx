import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useSession } from "@/src/session";
import { colors, spacing, font, radii } from "@/src/theme";

export default function CustomerProfileCompletion() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh } = useSession();
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
    } catch (e: any) { setErr(e.message || "Save failed"); }
    finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: insets.top + spacing.xl }} keyboardShouldPersistTaps="handled">
        <Pressable testID="cp-back" onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={s.title}>Where are you?</Text>
        <Text style={s.sub}>So we can show you braid artists nearby.</Text>

        <Text style={s.label}>Country</Text>
        <TextInput testID="cp-country" value={country} onChangeText={setCountry} placeholder="United States" placeholderTextColor={colors.muted} style={s.input} />
        <Text style={s.label}>City or postal code</Text>
        <TextInput testID="cp-city" value={city} onChangeText={setCity} placeholder="Brooklyn, NY" placeholderTextColor={colors.muted} style={s.input} />
        <Text style={{ ...s.help, marginTop: spacing.md }}>Profile picture is optional — you can add one from your Profile tab later.</Text>

        {err && <Text testID="cp-err" style={{ color: colors.error, marginTop: spacing.md, fontFamily: font.body }}>{err}</Text>}
        <Pressable testID="cp-submit" onPress={submit} disabled={busy || !country.trim() || !city.trim()} style={[s.btn, (busy || !country.trim() || !city.trim()) && { opacity: 0.4 }]}>
          <Text style={s.btnText}>{busy ? "Saving…" : "Finish — take me to the app"}</Text>
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
