import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, RefreshControl } from "react-native";
import { Image } from "expo-image";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, font, radii } from "@/src/theme";

export default function Bookings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const d = await api("/bookings/me");
    setItems(d);
  }, []);
  useFocusEffect(useCallback(() => { load().finally(() => setLoading(false)); }, [load]));

  const now = new Date();
  const filt = items.filter(b => {
    const dt = new Date(b.appointment_datetime);
    const upcoming = ["confirmed", "checked_in"].includes(b.status) && dt >= new Date(now.getTime() - 60 * 60 * 1000);
    return tab === "upcoming" ? upcoming : !upcoming;
  });

  const checkIn = async (id: string) => { await api(`/bookings/${id}/check-in`, { method: "POST" }); await load(); };
  const cancel = async (id: string) => { await api(`/bookings/${id}/cancel`, { method: "POST" }); await load(); };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl, paddingBottom: spacing.md }}>
        <Text style={s.header}>My bookings</Text>
        <View style={s.tabs}>
          {(["upcoming", "past"] as const).map(t => (
            <Pressable key={t} testID={`bookings-tab-${t}`} onPress={() => setTab(t)} style={[s.tab, tab === t && s.tabActive]}>
              <Text style={[s.tabText, tab === t && s.tabTextActive]}>{t === "upcoming" ? "Upcoming" : "Past"}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xxl }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brand} />}
        >
          {filt.length === 0 ? (
            <View style={{ alignItems: "center", marginTop: spacing.xxxl }}>
              <Feather name="calendar" size={40} color={colors.borderStrong} />
              <Text style={{ marginTop: spacing.md, fontFamily: font.body, color: colors.muted }}>No {tab} bookings.</Text>
            </View>
          ) : filt.map(b => {
            const dt = new Date(b.appointment_datetime);
            return (
              <Pressable testID={`booking-${b.id}`} key={b.id} onPress={() => router.push(`/booking/${b.id}`)} style={s.card}>
                <Image source={{ uri: b.hairstyle_photo }} style={s.thumb} contentFit="cover" />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.style}>{b.hairstyle_name}</Text>
                  <Text style={s.sub}>with {b.hairdresser_name}</Text>
                  <Text style={s.date}>{dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · {dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</Text>
                  <Text style={[s.badge, s[`badge_${b.status}`]]}>{b.status.replace("_", " ").toUpperCase()}</Text>
                  {tab === "upcoming" && b.status === "confirmed" && (
                    <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                      <Pressable testID={`checkin-${b.id}`} onPress={() => checkIn(b.id)} style={s.mini}><Text style={s.miniText}>Check-in</Text></Pressable>
                      <Pressable testID={`cancel-${b.id}`} onPress={() => cancel(b.id)} style={[s.mini, s.miniGhost]}><Text style={[s.miniText, { color: colors.onSurface }]}>Cancel</Text></Pressable>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  header: { fontFamily: font.display, fontSize: 32, color: colors.onSurface },
  tabs: { flexDirection: "row", marginTop: spacing.md, borderBottomWidth: 1, borderColor: colors.divider },
  tab: { paddingVertical: spacing.md, marginRight: spacing.xl },
  tabActive: { borderBottomWidth: 2, borderColor: colors.brand, marginBottom: -1 },
  tabText: { fontFamily: font.bodyMed, color: colors.muted, fontSize: 14 },
  tabTextActive: { color: colors.onSurface },
  card: { flexDirection: "row", gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, marginTop: spacing.md, backgroundColor: colors.surface },
  thumb: { width: 90, height: 110, borderRadius: radii.md, backgroundColor: colors.surfaceSecondary },
  style: { fontFamily: font.display, fontSize: 18, color: colors.onSurface },
  sub: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 13 },
  date: { fontFamily: font.bodyMed, color: colors.onSurface, fontSize: 13, marginTop: spacing.xs },
  badge: { alignSelf: "flex-start", marginTop: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: 3, fontSize: 10, fontFamily: font.bodyBold, letterSpacing: 1 },
  badge_confirmed: { backgroundColor: colors.brandTertiary, color: colors.onBrandTertiary },
  badge_checked_in: { backgroundColor: colors.success, color: "#fff" },
  badge_completed: { backgroundColor: colors.surfaceInverse, color: "#fff" },
  badge_cancelled: { backgroundColor: colors.surfaceSecondary, color: colors.muted },
  badge_no_show: { backgroundColor: colors.error, color: "#fff" },
  mini: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.brand, borderRadius: radii.md },
  miniGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.borderStrong },
  miniText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 12 },
});
