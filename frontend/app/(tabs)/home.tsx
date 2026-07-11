/**
 * BraidsCommunity Home — luxury discovery, Pinterest × Airbnb × Apple.
 *
 * Section order:
 *   1. Header — personalized greeting + dreamy tagline
 *   2. Large search bar + camera (AI Style Match soon)
 *   3. Horizontal quick categories
 *   4. Continue Dreaming (returning) / Start Your Journey (new)
 *   5. Trending Worldwide — with a country chip selector
 *   6. Themed sections (Bridal / Vacation / Kids / Office / Event / Protective / Luxury / New)
 */
import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api, ApiError } from "@/src/api";
import { useSession } from "@/src/session";
import { colors, spacing, font, radii } from "@/src/theme";
import StyleCard, { Hairstyle } from "@/src/components/StyleCard";
import SaveSheet from "@/src/components/SaveSheet";
import { pickImage } from "@/src/utils/cloudinary";

const QUICK_CATEGORIES: { key: string; label: string; icon: any }[] = [
  { key: "trending", label: "Trending", icon: "trending-up" },
  { key: "new", label: "New", icon: "star" },
  { key: "most_loved", label: "Most Saved", icon: "heart" },
  { key: "protective", label: "Protective", icon: "shield" },
  { key: "kids", label: "Kids", icon: "smile" },
  { key: "bridal", label: "Bridal", icon: "gift" },
  { key: "vacation", label: "Vacation", icon: "sun" },
  { key: "office", label: "Office", icon: "briefcase" },
  { key: "event", label: "Event", icon: "award" },
  { key: "luxury", label: "Luxury", icon: "star" },
  { key: "quick", label: "Quick", icon: "zap" },
];

const THEMED_SECTIONS: { key: string; title: string; emoji: string }[] = [
  { key: "bridal", title: "Bridal Collection", emoji: "👑" },
  { key: "vacation", title: "Vacation Looks", emoji: "🏖" },
  { key: "kids", title: "Kids Braids", emoji: "👧" },
  { key: "office", title: "Office Friendly", emoji: "💼" },
  { key: "event", title: "Event Hairstyles", emoji: "🎉" },
  { key: "protective", title: "Protective Styles", emoji: "🛡" },
  { key: "luxury", title: "Luxury Braids", emoji: "💎" },
  { key: "new", title: "Fresh Drops", emoji: "✨" },
];

interface Country { code: string; flag: string; name: string; }

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
  const [continueData, setContinueData] = useState<{ mode: "new_user" | "returning_user"; items: Hairstyle[] }>({ mode: "new_user", items: [] });
  const [countries, setCountries] = useState<Country[]>([]);
  const [country, setCountry] = useState<string>("WW");
  const [trending, setTrending] = useState<Hairstyle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveTarget, setSaveTarget] = useState<Hairstyle | null>(null);

  const firstName = user?.name?.split(" ")[0] || "";

  const load = useCallback(async () => {
    setError(null);
    try {
      const [themedRes, continueRes, cRes, trendRes] = await Promise.all([
        Promise.all(
          THEMED_SECTIONS.map(async (s) => {
            try { const arr: Hairstyle[] = await api(`/hairstyles?section=${s.key}&limit=10`); return [s.key, arr] as const; }
            catch { return [s.key, [] as Hairstyle[]] as const; }
          })
        ),
        api(`/continue-dreaming/me`).catch(() => ({ mode: "new_user", items: [] })),
        api(`/trending/countries`).catch(() => []),
        api(`/trending/WW?limit=10`).catch(() => []),
      ]);
      const map: Record<string, Hairstyle[]> = {};
      for (const [k, v] of themedRes) map[k] = v;
      setByKey(map);
      setContinueData(continueRes as any);
      setCountries(cRes as any);
      setTrending(trendRes as any);
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.userMessage : "We couldn't load braid styles. Please try again.";
      setError(msg);
    }
  }, []);

  useEffect(() => { (async () => { setLoading(true); await load(); setLoading(false); })(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  // When the country chip changes, refetch just the Trending Worldwide row.
  useEffect(() => {
    (async () => {
      try {
        const arr: Hairstyle[] = await api(`/trending/${country}?limit=10`);
        setTrending(arr);
      } catch { /* keep previous */ }
    })();
  }, [country]);

  const onUploadInspiration = async () => {
    try {
      const picked = await pickImage("style_catalog");
      if (!picked) return;
      await api("/inspiration", { method: "POST", body: JSON.stringify({ photo_url: picked.uri, note: "" }) });
      Alert.alert("Saved!", "AI Style Match is coming soon.\nYour inspiration has been added to \"My Inspiration Photos.\"");
    } catch (e: any) {
      Alert.alert("Couldn't add inspiration", e.message || "Please try again.");
    }
  };

  const openStyle = (id: string) => router.push({ pathname: "/hairstyle/[id]", params: { id } });

  const continueTitle = continueData.mode === "returning_user" ? "Continue Dreaming" : "Start Your Journey";
  const continueEmoji = "✨";
  const continueItems = continueData.mode === "returning_user"
    ? continueData.items
    : trending.slice(0, 10); // fallback to WW trending for brand-new users

  if (loading) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}><ActivityIndicator color={colors.brand} /></View>;
  }
  if (error) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, padding: spacing.xl }}>
        <Feather name="cloud-off" size={48} color={colors.borderStrong} />
        <Text style={{ fontFamily: font.display, fontSize: 24, color: colors.onSurface, marginTop: spacing.md, textAlign: "center" }}>Can&apos;t reach BraidsCommunity</Text>
        <Text style={{ fontFamily: font.body, fontSize: 13, color: colors.onSurfaceTertiary, marginTop: spacing.xs, textAlign: "center", maxWidth: 320 }}>{error}</Text>
        <Pressable testID="home-retry" onPress={async () => { setLoading(true); await load(); setLoading(false); }} style={{ marginTop: spacing.xl, backgroundColor: colors.brand, paddingHorizontal: spacing.xxl, paddingVertical: spacing.md, borderRadius: radii.md }}>          <Text style={{ color: "#fff", fontFamily: font.bodyBold, fontSize: 14 }}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.surface }}
      contentContainerStyle={{ paddingBottom: 88 + insets.bottom }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      showsVerticalScrollIndicator={false}
    >
      {/* ---------------- Header ---------------- */}
      <View style={[s.header, { paddingTop: insets.top + spacing.lg }]}>
        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>
            <Text style={s.greeting}>{greeting()}{firstName ? "," : ""}</Text>
            {firstName ? <Text style={s.greetingName}>{firstName}</Text> : null}
            <Text style={s.tagline}>What braid are you dreaming about today?</Text>
          </View>
          <Pressable testID="home-inspiration" onPress={() => router.push("/inspiration")} hitSlop={8} style={s.avatarBtn}>
            <Feather name="image" size={18} color={colors.onSurface} />
          </Pressable>
        </View>

        {/* Search + camera */}
        <Pressable testID="home-search" onPress={() => router.push("/(tabs)/search")} style={s.searchBar}>
          <Feather name="search" size={18} color={colors.muted} />
          <Text style={s.searchPlaceholder}>Search braid styles…</Text>
          <Pressable testID="home-camera" onPress={onUploadInspiration} hitSlop={8} style={s.cameraBtn}>
            <Feather name="camera" size={17} color="#fff" />
          </Pressable>
        </Pressable>
        <Text style={s.cameraHint}>Tap the camera to add an inspiration photo · AI Style Match coming soon</Text>
      </View>

      {/* ---------------- Quick categories ---------------- */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.sm, paddingTop: spacing.lg }}
      >
        {QUICK_CATEGORIES.map((c) => (
          <Pressable
            key={c.key}
            testID={`filter-${c.key}`}
            onPress={() => router.push({ pathname: "/(tabs)/search", params: { tag: c.key, label: c.label } })}
            style={s.chip}
          >
            <Feather name={c.icon} size={13} color={colors.onSurfaceSecondary} />
            <Text style={s.chipText}>{c.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* ---------------- Continue Dreaming / Start Your Journey ---------------- */}
      {continueItems.length > 0 && (
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionEmoji}>{continueEmoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.sectionTitle}>{continueTitle}</Text>
              <Text style={s.sectionSub}>
                {continueData.mode === "returning_user"
                  ? "Picking up where you left off"
                  : "Curated to help you find your first favorite"}
              </Text>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
            {continueItems.map((it, idx) => (
              <StyleCard
                key={it.id}
                style={it}
                variant={idx === 0 ? "editorial" : "standard"}
                onPress={() => openStyle(it.id)}
                onSave={() => setSaveTarget(it)}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* ---------------- Trending Worldwide ---------------- */}
      <View style={s.section}>
        <View style={s.sectionHead}>
          <Text style={s.sectionEmoji}>🌍</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.sectionTitle}>Trending Worldwide</Text>
            <Text style={s.sectionSub}>Braid trends from every corner of the world</Text>
          </View>
        </View>

        {/* Country selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.sm, marginBottom: spacing.md }}>
          {countries.map((c) => {
            const on = country === c.code;
            return (
              <Pressable
                key={c.code}
                testID={`country-${c.code}`}
                onPress={() => setCountry(c.code)}
                style={[s.countryChip, on && s.countryChipActive]}
              >
                <Text style={s.countryFlag}>{c.flag}</Text>
                <Text style={[s.countryText, on && { color: "#fff" }]}>{c.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
          {trending.length === 0 ? (
            <Text style={s.emptyRow}>No trending styles for this country yet.</Text>
          ) : (
            trending.map((it, idx) => (
              <StyleCard
                key={it.id}
                style={it}
                variant={idx === 0 ? "editorial" : "standard"}
                onPress={() => openStyle(it.id)}
                onSave={() => setSaveTarget(it)}
              />
            ))
          )}
        </ScrollView>
      </View>

      {/* ---------------- Themed sections ---------------- */}
      {THEMED_SECTIONS.map((sect) => {
        const items = byKey[sect.key] || [];
        if (!items.length) return null;
        return (
          <View key={sect.key} style={s.section}>
            <View style={s.sectionHead}>
              <Text style={s.sectionEmoji}>{sect.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.sectionTitle}>{sect.title}</Text>
              </View>
              <Pressable onPress={() => router.push({ pathname: "/(tabs)/search", params: { tag: sect.key, label: sect.title } })} style={s.seeAll}>
                <Text style={s.seeAllText}>See all</Text>
                <Feather name="chevron-right" size={14} color={colors.brand} />
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
              {items.map((it, idx) => (
                <StyleCard
                  key={it.id}
                  style={it}
                  variant={idx === 0 ? "editorial" : "standard"}
                  onPress={() => openStyle(it.id)}
                  onSave={() => setSaveTarget(it)}
                />
              ))}
            </ScrollView>
          </View>
        );
      })}

      <View style={{ height: 40 }} />

      <SaveSheet
        visible={!!saveTarget}
        hairstyleId={saveTarget?.id || ""}
        hairstyleName={saveTarget?.name}
        onClose={() => setSaveTarget(null)}
        onSaved={() => load()}
      />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  greeting: { fontFamily: font.body, fontSize: 15, color: colors.onSurfaceTertiary, letterSpacing: 0.2 },
  greetingName: { fontFamily: font.display, fontSize: 34, lineHeight: 38, color: colors.onSurface, marginTop: 2 },
  tagline: { fontFamily: font.displayIt, fontSize: 16, color: colors.onSurfaceSecondary, marginTop: spacing.sm, lineHeight: 22 },
  avatarBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", marginLeft: spacing.md, marginTop: 4 },
  searchBar: { marginTop: spacing.xl, flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, paddingLeft: spacing.lg, paddingRight: 4, height: 58, borderRadius: 30, gap: spacing.md, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  searchPlaceholder: { flex: 1, fontFamily: font.body, color: colors.muted, fontSize: 15 },
  cameraBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  cameraHint: { fontFamily: font.body, fontSize: 11, color: colors.onSurfaceTertiary, marginTop: spacing.sm, marginLeft: spacing.md, letterSpacing: 0.2 },

  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, height: 38, borderRadius: radii.pill, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border },
  chipText: { fontFamily: font.bodyMed, fontSize: 12, color: colors.onSurfaceSecondary },

  section: { marginTop: 52 },
  sectionHead: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  sectionEmoji: { fontSize: 22, marginRight: spacing.sm, marginTop: 2 },
  sectionTitle: { fontFamily: font.display, fontSize: 24, color: colors.onSurface, lineHeight: 28 },
  sectionSub: { fontFamily: font.body, fontSize: 12, color: colors.onSurfaceTertiary, marginTop: 2 },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "center" },
  seeAllText: { fontFamily: font.bodyMed, fontSize: 12, color: colors.brand },
  hScroll: { paddingLeft: spacing.xl, paddingRight: spacing.xl, paddingTop: spacing.xs },

  countryChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, height: 34, borderRadius: radii.pill, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border },
  countryChipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  countryFlag: { fontSize: 15 },
  countryText: { fontFamily: font.bodyMed, fontSize: 12, color: colors.onSurfaceSecondary },

  emptyRow: { fontFamily: font.body, fontSize: 12, color: colors.muted, padding: spacing.xl },
});
