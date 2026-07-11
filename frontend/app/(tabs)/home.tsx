/**
 * BraidsCommunity Home — Sprint 2 signature experience.
 * Pinterest + Netflix + Apple. Style-first. No booking on this page.
 */
import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useSession } from "@/src/session";
import { colors, spacing, font, radii } from "@/src/theme";
import StyleCard, { Hairstyle } from "@/src/components/StyleCard";
import SaveSheet from "@/src/components/SaveSheet";
import { pickImage } from "@/src/utils/cloudinary";

const QUICK_FILTERS: { key: string; label: string; icon: any }[] = [
  { key: "trending", label: "Trending", icon: "trending-up" },
  { key: "near_me", label: "Near Me", icon: "map-pin" },
  { key: "new", label: "New", icon: "star" },
  { key: "most_loved", label: "Most Saved", icon: "heart" },
  { key: "kids", label: "Kids", icon: "smile" },
  { key: "bridal", label: "Bridal", icon: "gift" },
  { key: "vacation", label: "Vacation", icon: "sun" },
  { key: "office", label: "Office", icon: "briefcase" },
  { key: "luxury", label: "Luxury", icon: "award" },
  { key: "quick", label: "Quick Styles", icon: "zap" },
];

const SECTIONS: { key: string; title: string; emoji: string; variant?: "feature" | "wide" }[] = [
  { key: "trending", title: "Trending This Week", emoji: "🔥", variant: "feature" },
  { key: "new", title: "New Styles", emoji: "✨" },
  { key: "bridal", title: "Bridal Collection", emoji: "👑" },
  { key: "vacation", title: "Vacation Looks", emoji: "🏖" },
  { key: "kids", title: "Kids Braids", emoji: "👧" },
  { key: "office", title: "Office Friendly", emoji: "💼" },
  { key: "event", title: "Event Hairstyles", emoji: "🎉" },
  { key: "most_loved", title: "Most Loved", emoji: "⭐" },
  { key: "protective", title: "Protective Styles", emoji: "🛡" },
  { key: "luxury", title: "Luxury Braids", emoji: "💎" },
];

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
};

export default function Home() {
  const { user } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [byKey, setByKey] = useState<Record<string, Hairstyle[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saveTarget, setSaveTarget] = useState<Hairstyle | null>(null);

  const firstName = user?.name?.split(" ")[0] || "there";

  const load = useCallback(async () => {
    // Parallel fetch every section (each request is a light Mongo query — 200 doc limit)
    const results = await Promise.all(
      SECTIONS.map(async (s) => {
        try {
          const arr: Hairstyle[] = await api(`/hairstyles?section=${s.key}&limit=12`);
          return [s.key, arr] as const;
        } catch { return [s.key, [] as Hairstyle[]] as const; }
      })
    );
    const map: Record<string, Hairstyle[]> = {};
    for (const [k, v] of results) map[k] = v;
    setByKey(map);
  }, []);

  useEffect(() => { (async () => { setLoading(true); await load(); setLoading(false); })(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const onUploadInspiration = async () => {
    try {
      const picked = await pickImage("style_catalog");
      if (!picked) return;
      // For now, save the local URI directly to "My Inspiration Photos". The
      // AI Style Match feature is coming soon — we simply store the reference.
      await api("/inspiration", {
        method: "POST",
        body: JSON.stringify({ photo_url: picked.uri, note: "" }),
      });
      Alert.alert("Saved!", "AI Style Match is coming soon.\nYour inspiration has been added to \"My Inspiration Photos.\"");
    } catch (e: any) {
      Alert.alert("Couldn't add inspiration", e.message || "Please try again.");
    }
  };

  const openStyle = (id: string) => router.push({ pathname: "/hairstyle/[id]", params: { id } });

  if (loading) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}><ActivityIndicator color={colors.brand} /></View>;
  }

  const heroList = byKey["trending"] || [];

  return (
    <ScrollView
      style={{ backgroundColor: colors.surface }}
      contentContainerStyle={{ paddingBottom: spacing.xxxl + insets.bottom }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      {/* ---------- Header ---------- */}
      <View style={[s.header, { paddingTop: insets.top + spacing.lg }]}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={s.greeting}>{greeting()}, {firstName}</Text>
            <Text style={s.tagline}>What braid are you dreaming of today?</Text>
          </View>
          <Pressable testID="home-inspiration" onPress={() => router.push("/inspiration")} style={s.avatarBtn}>
            <Feather name="image" size={18} color={colors.onSurface} />
          </Pressable>
        </View>

        {/* ---------- Search bar ---------- */}
        <Pressable
          testID="home-search"
          onPress={() => router.push("/(tabs)/search")}
          style={s.searchBar}
        >
          <Feather name="search" size={18} color={colors.muted} />
          <Text style={s.searchPlaceholder}>Search braid styles…</Text>
          <Pressable
            testID="home-camera"
            onPress={onUploadInspiration}
            hitSlop={8}
            style={s.cameraBtn}
          >
            <Feather name="camera" size={16} color="#fff" />
          </Pressable>
        </Pressable>
        <Text style={s.cameraHint}>Tap the camera → Upload Inspiration Photo · AI Style Match coming soon</Text>
      </View>

      {/* ---------- Quick filter chips ---------- */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.sm, paddingTop: spacing.lg }}
      >
        {QUICK_FILTERS.map((f) => (
          <Pressable
            key={f.key}
            testID={`filter-${f.key}`}
            onPress={() => router.push({ pathname: "/(tabs)/search", params: { tag: f.key, label: f.label } })}
            style={s.chip}
          >
            <Feather name={f.icon} size={13} color={colors.onSurfaceSecondary} />
            <Text style={s.chipText}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* ---------- Sections ---------- */}
      {SECTIONS.map((sect, idx) => {
        const items = byKey[sect.key] || [];
        if (!items.length) return null;
        const variant = sect.variant || (idx % 3 === 0 ? "feature" : "compact");
        return (
          <View key={sect.key} style={{ marginTop: spacing.xxl }}>
            <View style={s.sectionHead}>
              <Text style={s.sectionEmoji}>{sect.emoji}</Text>
              <Text style={s.sectionTitle}>{sect.title}</Text>
              <Pressable onPress={() => router.push({ pathname: "/(tabs)/search", params: { tag: sect.key, label: sect.title } })} style={s.seeAll}>
                <Text style={s.seeAllText}>See all</Text>
                <Feather name="chevron-right" size={14} color={colors.brand} />
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingLeft: spacing.xl, paddingRight: spacing.md, paddingTop: spacing.md }}
            >
              {items.map((it) => (
                <StyleCard
                  key={it.id}
                  style={it}
                  variant={variant}
                  onPress={() => openStyle(it.id)}
                  onSave={() => setSaveTarget(it)}
                />
              ))}
            </ScrollView>
          </View>
        );
      })}

      {/* ---------- Footer whitespace ---------- */}
      <View style={{ height: spacing.xxxl }} />

      <SaveSheet
        visible={!!saveTarget}
        hairstyleId={saveTarget?.id || ""}
        hairstyleName={saveTarget?.name}
        onClose={() => setSaveTarget(null)}
      />
    </ScrollView>
  );
}


const s = StyleSheet.create({
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  greeting: { fontFamily: font.display, fontSize: 26, lineHeight: 30, color: colors.onSurface },
  tagline: { fontFamily: font.body, fontSize: 14, color: colors.onSurfaceTertiary, marginTop: 4 },
  avatarBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", marginLeft: spacing.md },
  searchBar: { marginTop: spacing.lg, flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, paddingLeft: spacing.md, paddingRight: 4, height: 52, borderRadius: 26, gap: spacing.sm },
  searchPlaceholder: { flex: 1, fontFamily: font.body, color: colors.muted, fontSize: 14 },
  cameraBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  cameraHint: { fontFamily: font.body, fontSize: 10, color: colors.onSurfaceTertiary, marginTop: spacing.sm, marginLeft: spacing.md, letterSpacing: 0.2 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, height: 36, borderRadius: radii.pill, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border },
  chipText: { fontFamily: font.bodyMed, fontSize: 12, color: colors.onSurfaceSecondary },
  sectionHead: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.xl },
  sectionEmoji: { fontSize: 22 },
  sectionTitle: { fontFamily: font.display, fontSize: 22, color: colors.onSurface, marginLeft: spacing.sm, flex: 1 },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2 },
  seeAllText: { fontFamily: font.bodyMed, fontSize: 12, color: colors.brand },
});
