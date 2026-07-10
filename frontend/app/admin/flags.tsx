import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useSession } from "@/src/session";
import { colors, spacing, font, radii } from "@/src/theme";

export default function AdminCustomerFlags() {
  const { user, signOut } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setItems(await api("/admin/customer-flags"));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (uid: string, action: "lift" | "keep" | "remove") => {
    await api(`/admin/customer-flags/${uid}/decide`, { method: "POST", body: JSON.stringify({ action, reason: reason[uid] || null }) });
    await load();
  };

  if (!user || user.role !== "admin") return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl, paddingBottom: spacing.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={s.title}>Admin</Text>
          <Pressable testID="admin-signout" onPress={async () => { await signOut(); router.replace("/welcome"); }}>
            <Feather name="log-out" size={22} color={colors.onSurface} />
          </Pressable>
        </View>
        <View style={s.tabs}>
          <Pressable testID="admin-tab-verifications" onPress={() => router.replace("/admin/verifications")} style={s.tab}>
            <Text style={s.tabText}>Pro verifications</Text>
          </Pressable>
          <Pressable testID="admin-tab-flags" style={[s.tab, s.tabActive]}>
            <Text style={[s.tabText, s.tabTextActive]}>Customer flags</Text>
          </Pressable>
        </View>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xxl }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md }}>
          {items.length === 0 && <Text style={{ color: colors.muted, fontFamily: font.body }}>No restricted customers right now.</Text>}
          {items.map(u => (
            <View key={u.id} testID={`flag-item-${u.id}`} style={s.card}>
              <Text style={s.name}>{u.name}</Text>
              <Text style={s.email}>{u.email}</Text>
              <Text style={s.count}>{u.flag_count} flag{u.flag_count === 1 ? "" : "s"} · restricted</Text>
              <Text style={[s.name, { fontSize: 14, marginTop: spacing.sm }]}>Recent flags</Text>
              {u.recent_flags?.length ? u.recent_flags.map((f: any) => (
                <View key={f.id} style={s.flagRow}>
                  <Feather name="alert-triangle" size={12} color={colors.error} />
                  <Text style={s.flagText}>
                    {f.flag_reason || "No reason given"} · rating {f.rating}/5 · {new Date(f.created_at).toLocaleDateString()}
                  </Text>
                </View>
              )) : <Text style={{ color: colors.muted, fontFamily: font.body, fontSize: 12 }}>No detailed flag entries.</Text>}
              <TextInput
                testID={`flag-note-${u.id}`}
                value={reason[u.id] || ""}
                onChangeText={t => setReason(r => ({ ...r, [u.id]: t }))}
                placeholder="Admin note (optional)"
                placeholderTextColor={colors.muted}
                style={s.input}
              />
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Pressable testID={`lift-${u.id}`} onPress={() => decide(u.id, "lift")} style={[s.btn, { backgroundColor: colors.success }]}>
                  <Text style={s.btnText}>Lift restriction</Text>
                </Pressable>
                <Pressable testID={`keep-${u.id}`} onPress={() => decide(u.id, "keep")} style={[s.btn, { backgroundColor: colors.warning }]}>
                  <Text style={s.btnText}>Keep</Text>
                </Pressable>
                <Pressable testID={`remove-${u.id}`} onPress={() => decide(u.id, "remove")} style={[s.btn, { backgroundColor: colors.error }]}>
                  <Text style={s.btnText}>Remove</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 32, color: colors.onSurface },
  tabs: { flexDirection: "row", marginTop: spacing.md, borderBottomWidth: 1, borderColor: colors.divider },
  tab: { paddingVertical: spacing.md, marginRight: spacing.xl },
  tabActive: { borderBottomWidth: 2, borderColor: colors.brand, marginBottom: -1 },
  tabText: { fontFamily: font.bodyMed, color: colors.muted, fontSize: 14 },
  tabTextActive: { color: colors.onSurface },
  card: { padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, gap: spacing.sm },
  name: { fontFamily: font.display, fontSize: 20, color: colors.onSurface },
  email: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 12 },
  count: { fontFamily: font.bodyBold, color: colors.error, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  flagRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingTop: 4 },
  flagText: { fontFamily: font.body, color: colors.onSurfaceSecondary, fontSize: 12, flex: 1 },
  input: { borderBottomWidth: 1, borderColor: colors.borderStrong, paddingVertical: spacing.sm, fontFamily: font.body, color: colors.onSurface, marginTop: spacing.sm },
  btn: { flex: 1, padding: spacing.md, alignItems: "center", borderRadius: radii.md },
  btnText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 12 },
});
