import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, TextInput } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, font, radii } from "@/src/theme";

export default function HairdresserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [h, setH] = useState<any>(null);
  const [tab, setTab] = useState<"portfolio" | "reviews" | "about">("portfolio");
  const [fav, setFav] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportMsg, setReportMsg] = useState<string | null>(null);

  useEffect(() => { api(`/hairdressers/${id}`).then(setH); }, [id]);
  const toggleFav = async () => {
    if (!fav) { await api("/favorites", { method: "POST", body: JSON.stringify({ hairdresser_id: id }) }); setFav(true); }
    else { await api(`/favorites/${id}`, { method: "DELETE" }); setFav(false); }
  };
  const submitReport = async () => {
    if (!reportReason.trim()) return;
    try {
      await api("/reports", { method: "POST", body: JSON.stringify({ reported_user_id: id, reason: reportReason.trim() }) });
      setReportMsg("Reported. An admin will review.");
      setTimeout(() => { setReportOpen(false); setReportMsg(null); setReportReason(""); }, 2500);
    } catch (e: any) { setReportMsg(e.message); }
  };

  if (!h) return <ActivityIndicator style={{ flex: 1 }} color={colors.brand} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={{ height: 380 }}>
          <Image source={{ uri: h.cover_photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient colors={["rgba(0,0,0,0.4)", "transparent", "rgba(0,0,0,0.6)"]} style={StyleSheet.absoluteFill} />
          <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl, flexDirection: "row", justifyContent: "space-between" }}>
            <Pressable testID="hd-back" onPress={() => router.back()} style={s.iconBtn}><Feather name="arrow-left" size={22} color="#fff" /></Pressable>
            <Pressable testID="hd-fav" onPress={toggleFav} style={s.iconBtn}><Feather name={fav ? "heart" : "heart"} size={22} color={fav ? colors.brand : "#fff"} /></Pressable>
          </View>
          <View style={{ position: "absolute", left: spacing.xl, right: spacing.xl, bottom: spacing.xl }}>
            <Text style={s.salon}>{h.salon_name.toUpperCase()}</Text>
            <Text testID="hd-name" style={s.name}>{h.name}</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, flexWrap: "wrap" }}>
              {h.badges?.map((b: string) => (
                <View key={b} style={s.badge}><Text style={s.badgeText}>{b}</Text></View>
              ))}
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.lg, flexDirection: "row", gap: spacing.xl }}>
          <View><Text style={s.stat}>{h.rating_avg?.toFixed(1) || "—"}</Text><Text style={s.statLbl}>Rating</Text></View>
          <View><Text style={s.stat}>{h.reviews_count || 0}</Text><Text style={s.statLbl}>Reviews</Text></View>
          <View style={{ flex: 1 }}><Text style={s.stat}>{h.portfolio?.length || 0}</Text><Text style={s.statLbl}>Works</Text></View>
        </View>

        <View style={s.tabs}>
          {(["portfolio", "reviews", "about"] as const).map(t => (
            <Pressable key={t} testID={`tab-${t}`} onPress={() => setTab(t)} style={[s.tab, tab === t && s.tabActive]}>
              <Text style={[s.tabText, tab === t && s.tabTextActive]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
            </Pressable>
          ))}
        </View>

        {tab === "portfolio" && (
          <View style={s.grid}>
            {(() => {
              // Standard tier gets a capped preview; Unlimited sees all.
              const cap = h.location_blurred ? 6 : h.portfolio.length;
              const shown = h.portfolio.slice(0, cap);
              const encodedUrls = shown.map((p: any) => encodeURIComponent(p.photo_url)).join(",");
              return (
                <>
                  {shown.map((p: any, i: number) => (
                    <Pressable
                      key={p.id}
                      testID={`portfolio-photo-${p.id}`}
                      onPress={() => router.push(`/viewer?photos=${encodedUrls}&index=${i}`)}
                      style={s.gridItem}
                    >
                      <Image source={{ uri: p.photo_url }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                    </Pressable>
                  ))}
                  {cap < h.portfolio.length && (
                    <View style={s.moreLocked}>
                      <Feather name="lock" size={20} color={colors.brand} />
                      <Text style={s.moreLockedText}>+{h.portfolio.length - cap} more with Unlimited</Text>
                    </View>
                  )}
                </>
              );
            })()}
            {h.portfolio.length === 0 && <Text style={{ paddingHorizontal: spacing.xl, color: colors.muted, fontFamily: font.body }}>No portfolio yet.</Text>}
          </View>
        )}
        {tab === "reviews" && (
          <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md, marginTop: spacing.md }}>
            {h.reviews.length === 0 ? <Text style={{ color: colors.muted, fontFamily: font.body }}>No reviews yet.</Text> : h.reviews.map((r: any) => (
              <View key={r.id} style={s.review}>
                <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
                  <Text style={s.revName}>{r.customer_name}</Text>
                  <View style={{ flexDirection: "row" }}>{Array.from({ length: r.rating }).map((_, i) => <Feather key={i} name="star" size={12} color={colors.brand} />)}</View>
                </View>
                <Text style={s.revText}>{r.comment}</Text>
              </View>
            ))}
          </View>
        )}
        {tab === "about" && (
          <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.md, gap: spacing.md }}>
            <Text style={s.aboutBio}>{h.bio}</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
              <Feather name="map-pin" size={14} color={colors.brand} />
              <Text style={s.aboutText}>{h.address}</Text>
            </View>
            {h.location_blurred && <Text style={{ color: colors.warning, fontFamily: font.bodyMed, fontSize: 12 }}>Exact address unlocked with Unlimited plan or confirmed booking.</Text>}
            <Text style={[s.aboutText, { marginTop: spacing.md, fontFamily: font.bodyBold }]}>Specialties</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {h.specialties.map((sp: any) => (
                <View key={sp.id} style={s.chip}><Text style={s.chipText}>{sp.name}</Text></View>
              ))}
            </View>

            <Pressable testID="report-toggle" onPress={() => setReportOpen(o => !o)} style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center", marginTop: spacing.lg }}>
              <Feather name="flag" size={14} color={colors.error} />
              <Text style={{ color: colors.error, fontFamily: font.bodyMed, fontSize: 13 }}>Report this stylist</Text>
            </Pressable>
            {reportOpen && (
              <View style={{ gap: spacing.sm }}>
                <TextInput
                  testID="report-reason"
                  value={reportReason}
                  onChangeText={setReportReason}
                  placeholder="What happened? (visible only to admins)"
                  placeholderTextColor={colors.muted}
                  multiline
                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, minHeight: 80, fontFamily: font.body, textAlignVertical: "top" }}
                />
                <Pressable testID="report-submit" onPress={submitReport} disabled={!reportReason.trim()} style={[s.btn, !reportReason.trim() && { opacity: 0.4 }]}>
                  <Text style={s.btnText}>Submit report</Text>
                </Pressable>
                {reportMsg && <Text style={{ color: colors.success, fontFamily: font.bodyMed }}>{reportMsg}</Text>}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <View style={[s.bookBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.bookPrice}>From ${h.specialties[0]?.avg_price || "—"}</Text>
          <Text style={s.bookMeta}>Pay at counter</Text>
        </View>
        <Pressable testID="book-now" onPress={() => router.push(`/book/${h.id}`)} style={s.bookBtn}>
          <Text style={s.bookBtnText}>Book now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  salon: { color: "#E8CBBF", letterSpacing: 3, fontSize: 10, fontFamily: font.bodyMed },
  name: { color: "#F9F6F0", fontFamily: font.display, fontSize: 40, lineHeight: 44, marginTop: spacing.sm },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: radii.pill },
  badgeText: { color: "#fff", fontSize: 10, fontFamily: font.bodyBold, letterSpacing: 1 },
  stat: { fontFamily: font.display, fontSize: 24, color: colors.onSurface },
  statLbl: { fontFamily: font.bodyMed, color: colors.muted, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" },
  tabs: { flexDirection: "row", marginTop: spacing.lg, paddingHorizontal: spacing.xl, borderBottomWidth: 1, borderColor: colors.divider },
  tab: { paddingVertical: spacing.md, marginRight: spacing.xl },
  tabActive: { borderBottomWidth: 2, borderColor: colors.brand, marginBottom: -1 },
  tabText: { fontFamily: font.bodyMed, color: colors.muted, fontSize: 14 },
  tabTextActive: { color: colors.onSurface },
  grid: { flexDirection: "row", flexWrap: "wrap", padding: 2, marginTop: spacing.sm },
  gridItem: { width: "33.33%", aspectRatio: 1, padding: 2 },
  moreLocked: { width: "33.33%", aspectRatio: 1, padding: 2, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTertiary },
  moreLockedText: { fontFamily: font.bodyMed, color: colors.onBrandTertiary, fontSize: 10, textAlign: "center", marginTop: 4, paddingHorizontal: 6 },
  review: { borderBottomWidth: 1, borderColor: colors.divider, paddingBottom: spacing.md, gap: spacing.xs },
  revName: { fontFamily: font.bodyBold, color: colors.onSurface },
  revText: { fontFamily: font.body, color: colors.onSurfaceSecondary, fontSize: 14 },
  aboutBio: { fontFamily: font.body, color: colors.onSurfaceSecondary, fontSize: 15, lineHeight: 22 },
  aboutText: { fontFamily: font.body, color: colors.onSurfaceSecondary, fontSize: 14 },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radii.pill },
  chipText: { fontFamily: font.bodyMed, color: colors.onSurface, fontSize: 12 },
  bookBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", padding: spacing.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.divider, gap: spacing.md },
  bookPrice: { fontFamily: font.display, fontSize: 20, color: colors.onSurface },
  bookMeta: { fontFamily: font.body, color: colors.muted, fontSize: 11 },
  bookBtn: { backgroundColor: colors.brand, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radii.md },
  bookBtnText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 15 },
  btn: { backgroundColor: colors.brand, padding: spacing.md, borderRadius: radii.md, alignItems: "center" },
  btnText: { color: "#fff", fontFamily: font.bodyBold },
});
