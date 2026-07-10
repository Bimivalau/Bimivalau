import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, TextInput } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useSession } from "@/src/session";
import { colors, spacing, font, radii } from "@/src/theme";

type Filter = "pending" | "approved" | "rejected";

export default function AdminVerifications() {
  const { user, signOut } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>("pending");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState<Record<string, string>>({});

  const load = useCallback(async (f: Filter) => {
    setLoading(true);
    const r = await api(`/admin/verifications?status=${f}`);
    setItems(r);
    setLoading(false);
  }, []);
  useEffect(() => { load(filter); }, [filter, load]);

  const decide = async (hid: string, status: "approved" | "rejected") => {
    await api(`/admin/verifications/${hid}/decide`, { method: "POST", body: JSON.stringify({ status, reason: reason[hid] || null }) });
    await load(filter);
  };

  if (!user || user.role !== "admin") return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl, paddingBottom: spacing.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={s.title}>Admin</Text>
          <Pressable testID="admin-signout" onPress={async () => { await signOut(); router.replace("/login"); }}><Feather name="log-out" size={22} color={colors.onSurface} /></Pressable>
        </View>
        <Text style={s.sub}>Verify professional accounts. SLA: 3 business days.</Text>
        <View style={s.tabs}>
          {(["pending", "approved", "rejected"] as Filter[]).map(f => (
            <Pressable key={f} testID={`admin-tab-${f}`} onPress={() => setFilter(f)} style={[s.tab, filter === f && s.tabActive]}>
              <Text style={[s.tabText, filter === f && s.tabTextActive]}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xxl }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md }}>
          {items.length === 0 && <Text style={{ color: colors.muted, fontFamily: font.body }}>No {filter} verifications.</Text>}
          {items.map(h => (
            <View key={h.id} testID={`admin-item-${h.id}`} style={[s.card, h.overdue && s.cardOverdue]}>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <Image source={{ uri: h.cover_photo || "https://images.unsplash.com/photo-1580618672591-eb180b1a973f?w=200&q=60" }} style={s.img} contentFit="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{h.name}</Text>
                  <Text style={s.email}>{h.email}</Text>
                  <Text style={s.salon}>{h.salon_name} · {h.city}</Text>
                  <Text style={s.submitted}>Submitted {h.verification_submitted_at ? new Date(h.verification_submitted_at).toLocaleDateString() : "—"}</Text>
                  {h.overdue && <Text style={s.overdue}>⚠︎ SLA OVERDUE</Text>}
                </View>
              </View>
              <Text style={s.bio}>{h.bio || "No bio."}</Text>
              {h.verification_license_url && (
                <Pressable testID={`view-lic-${h.id}`} onPress={() => router.push(`/viewer?photos=${encodeURIComponent(h.verification_license_url)}&index=0`)}>
                  <Text style={s.licLink}>View license →</Text>
                </Pressable>
              )}
              {filter === "pending" && (
                <>
                  <TextInput
                    testID={`reason-${h.id}`}
                    value={reason[h.id] || ""}
                    onChangeText={t => setReason(r => ({ ...r, [h.id]: t }))}
                    placeholder="Rejection reason (optional)"
                    placeholderTextColor={colors.muted}
                    style={s.reason}
                  />
                  <View style={{ flexDirection: "row", gap: spacing.sm }}>
                    <Pressable testID={`approve-${h.id}`} onPress={() => decide(h.id, "approved")} style={[s.btn, { backgroundColor: colors.success }]}>
                      <Text style={s.btnText}>Approve</Text>
                    </Pressable>
                    <Pressable testID={`reject-${h.id}`} onPress={() => decide(h.id, "rejected")} style={[s.btn, { backgroundColor: colors.error }]}>
                      <Text style={s.btnText}>Reject</Text>
                    </Pressable>
                  </View>
                </>
              )}
              {filter !== "pending" && (
                <Text style={s.decided}>{h.verification_status.toUpperCase()} · {h.verification_decided_at ? new Date(h.verification_decided_at).toLocaleDateString() : ""}{h.verification_reason ? ` — ${h.verification_reason}` : ""}</Text>
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 32, color: colors.onSurface },
  sub: { fontFamily: font.body, color: colors.muted, marginTop: 2 },
  tabs: { flexDirection: "row", marginTop: spacing.md, borderBottomWidth: 1, borderColor: colors.divider },
  tab: { paddingVertical: spacing.md, marginRight: spacing.xl },
  tabActive: { borderBottomWidth: 2, borderColor: colors.brand, marginBottom: -1 },
  tabText: { fontFamily: font.bodyMed, color: colors.muted, fontSize: 14 },
  tabTextActive: { color: colors.onSurface },
  card: { padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, gap: spacing.sm, backgroundColor: colors.surface },
  cardOverdue: { borderColor: colors.error, backgroundColor: "#FFF3F2" },
  img: { width: 68, height: 68, borderRadius: radii.md, backgroundColor: colors.surfaceSecondary },
  name: { fontFamily: font.display, fontSize: 18, color: colors.onSurface },
  email: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 12 },
  salon: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  submitted: { fontFamily: font.body, color: colors.muted, fontSize: 11, marginTop: 2 },
  overdue: { fontFamily: font.bodyBold, color: colors.error, fontSize: 12, marginTop: 2, letterSpacing: 1 },
  bio: { fontFamily: font.body, color: colors.onSurfaceSecondary, fontSize: 13 },
  licLink: { fontFamily: font.bodyBold, color: colors.brand, fontSize: 13 },
  reason: { borderBottomWidth: 1, borderColor: colors.borderStrong, paddingVertical: spacing.sm, fontFamily: font.body, color: colors.onSurface },
  btn: { flex: 1, padding: spacing.md, alignItems: "center", borderRadius: radii.md },
  btnText: { color: "#fff", fontFamily: font.bodyBold },
  decided: { fontFamily: font.bodyMed, color: colors.muted, fontSize: 12, letterSpacing: 1 },
});
