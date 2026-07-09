import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, font, radii } from "@/src/theme";

export default function ProVerification() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [v, setV] = useState<any>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api("/hairdressers/me/verification").then(setV);
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!url) return;
    setBusy(true);
    try {
      await api("/hairdressers/me/submit-verification", { method: "POST", body: JSON.stringify({ license_url: url }) });
      setUrl("");
      await load();
    } finally { setBusy(false); }
  };

  if (!v) return <ActivityIndicator style={{ flex: 1 }} color={colors.brand} />;

  const statusText: Record<string, string> = {
    pending: "Under review — typically completed within 3 business days.",
    approved: "You're verified. Your profile is live in customer search.",
    rejected: v.reason ? `Rejected: ${v.reason}` : "Your submission was rejected. Please try again with a clearer document.",
  };
  const statusColor: Record<string, string> = { pending: colors.warning, approved: colors.success, rejected: colors.error };

  return (
    <ScrollView style={{ backgroundColor: colors.surface }} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl }}>
        <Pressable testID="ver-back" onPress={() => router.back()}><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.title}>License verification</Text>
        <View style={[s.status, { borderColor: statusColor[v.status] }]}>
          <Text style={[s.statusLabel, { color: statusColor[v.status] }]}>{v.status.toUpperCase()}</Text>
          <Text style={s.statusMsg}>{statusText[v.status]}</Text>
          {v.status === "pending" && v.submitted_at && (
            <Text style={s.statusMeta}>Submitted {new Date(v.submitted_at).toLocaleDateString()} · {v.overdue ? "Overdue — admin flagged" : `${v.days_left_sla} day(s) remaining in SLA`}</Text>
          )}
        </View>

        {v.status !== "approved" && (
          <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
            <Text style={s.section}>Submit ID / business license</Text>
            <Text style={s.help}>Paste a URL to a photo of your government-issued ID or braiding license. Your profile will be locked until an admin approves.</Text>
            <TextInput testID="ver-url" value={url} onChangeText={setUrl} placeholder="https://…" placeholderTextColor={colors.muted} style={s.input} autoCapitalize="none" />
            <Pressable testID="ver-submit" onPress={submit} disabled={!url || busy} style={[s.btn, (!url || busy) && { opacity: 0.4 }]}>
              <Text style={s.btnText}>{busy ? "Submitting…" : "Submit for review"}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 32, color: colors.onSurface, marginTop: spacing.lg, marginBottom: spacing.lg },
  status: { padding: spacing.lg, borderLeftWidth: 4, borderRadius: radii.md, backgroundColor: colors.surfaceSecondary },
  statusLabel: { fontFamily: font.bodyBold, letterSpacing: 2, fontSize: 12, marginBottom: 4 },
  statusMsg: { fontFamily: font.body, color: colors.onSurfaceSecondary, fontSize: 14 },
  statusMeta: { fontFamily: font.body, color: colors.muted, fontSize: 12, marginTop: spacing.sm },
  section: { fontFamily: font.display, fontSize: 22, color: colors.onSurface },
  help: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 13, lineHeight: 18 },
  input: { borderBottomWidth: 1, borderColor: colors.borderStrong, paddingVertical: spacing.md, fontFamily: font.body, color: colors.onSurface },
  btn: { backgroundColor: colors.brand, padding: spacing.md, borderRadius: radii.md, alignItems: "center" },
  btnText: { color: "#fff", fontFamily: font.bodyBold },
});
