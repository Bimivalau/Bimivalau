/**
 * Discover — Sprint 2 style-first discovery.
 * Grid view of hairstyles with tag filtering. NOT a pro search.
 * Includes disabled "Coming Soon" placeholders for future features.
 */
import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api, ApiError } from "@/src/api";
import { colors, spacing, font, radii } from "@/src/theme";
import StyleCard, { Hairstyle } from "@/src/components/StyleCard";
import SaveSheet from "@/src/components/SaveSheet";

const TAG_FILTERS = [
  { key: "", label: "All" },
  { key: "trending", label: "Trending" },
  { key: "new", label: "New" },
  { key: "most_loved", label: "Most Saved" },
  { key: "kids", label: "Kids" },
  { key: "bridal", label: "Bridal" },
  { key: "vacation", label: "Vacation" },
  { key: "office", label: "Office" },
  { key: "event", label: "Event" },
  { key: "protective", label: "Protective" },
  { key: "luxury", label: "Luxury" },
  { key: "color", label: "Color" },
  { key: "celebrity", label: "Celebrity" },
  { key: "natural", label: "Natural" },
  { key: "quick", label: "Quick" },
];

const FUTURE = [
  { key: "ai_match", label: "AI Style Match", icon: "zap" },
  { key: "virtual_tryon", label: "Virtual Try-On", icon: "camera" },
  { key: "growth_journey", label: "Hair Growth Journey", icon: "activity" },
  { key: "trending_world", label: "Trending Worldwide", icon: "globe" },
  { key: "braid_map", label: "Global Braid Map", icon: "map" },
  { key: "passport", label: "Style Passport", icon: "bookmark" },
];

export default function Discover() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ tag?: string; label?: string }>();
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string>(params.tag || "");
  const [results, setResults] = useState<Hairstyle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveTarget, setSaveTarget] = useState<Hairstyle | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = tag ? `/hairstyles?section=${encodeURIComponent(tag)}&limit=80` : `/hairstyles?limit=80`;
      const arr: Hairstyle[] = await api(url);
      const filtered = q.trim() ? arr.filter((h) => (h.name + " " + (h.category || "")).toLowerCase().includes(q.toLowerCase())) : arr;
      setResults(filtered);
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.userMessage : "We couldn't load braid styles. Please try again.";
      setError(msg);
      setResults([]);
    } finally { setLoading(false); }
  }, [q, tag]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (params.tag && params.tag !== tag) setTag(params.tag); }, [params.tag]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl }}>
        <Text style={s.header}>Discover</Text>
        <Text style={s.sub}>Find your dream braid style.</Text>

        <View style={s.searchBox}>
          <Feather name="search" size={16} color={colors.muted} />
          <TextInput
            testID="discover-input"
            value={q}
            onChangeText={setQ}
            onSubmitEditing={load}
            placeholder="Search braid styles…"
            placeholderTextColor={colors.muted}
            style={s.searchInput}
            returnKeyType="search"
          />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
        {TAG_FILTERS.map((f) => (
          <Pressable key={f.key || "all"} testID={`discover-tag-${f.key || "all"}`} onPress={() => setTag(f.key)} style={[s.chip, tag === f.key && s.chipActive]}>
            <Text style={[s.chipText, tag === f.key && s.chipTextActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl + insets.bottom }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xxl }} />
        ) : error ? (
          <View style={s.empty}>
            <Feather name="cloud-off" size={40} color={colors.borderStrong} />
            <Text style={s.emptyTitle}>Can't load styles</Text>
            <Text style={s.emptyDesc}>{error}</Text>
            <Pressable testID="discover-retry" onPress={load} style={{ marginTop: spacing.lg, backgroundColor: colors.brand, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radii.md }}>
              <Text style={{ color: "#fff", fontFamily: font.bodyBold, fontSize: 13 }}>Try again</Text>
            </Pressable>
          </View>
        ) : results.length === 0 ? (
          <View style={s.empty}>
            <Feather name="search" size={40} color={colors.borderStrong} />
            <Text style={s.emptyTitle}>No styles yet</Text>
            <Text style={s.emptyDesc}>Try a different filter or category.</Text>
          </View>
        ) : (
          <View style={s.grid}>
            {results.map((h) => (
              <View key={h.id} style={{ width: "48%", marginBottom: spacing.xl }}>
                <StyleCard style={h} variant="compact" onPress={() => router.push({ pathname: "/hairstyle/[id]", params: { id: h.id } })} onSave={() => setSaveTarget(h)} />
              </View>
            ))}
          </View>
        )}

        {/* Future placeholders */}
        <Text style={s.section}>Coming soon to BraidsCommunity</Text>
        <View style={s.futureGrid}>
          {FUTURE.map((f) => (
            <View key={f.key} style={s.futureCard}>
              <View style={s.futureIcon}><Feather name={f.icon as any} size={16} color={colors.muted} /></View>
              <Text style={s.futureLabel}>{f.label}</Text>
              <Text style={s.futureTag}>Soon</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <SaveSheet visible={!!saveTarget} hairstyleId={saveTarget?.id || ""} hairstyleName={saveTarget?.name} onClose={() => setSaveTarget(null)} />
    </View>
  );
}

const s = StyleSheet.create({
  header: { fontFamily: font.display, fontSize: 30, color: colors.onSurface },
  sub: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 13, marginTop: 2, marginBottom: spacing.md },
  searchBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radii.pill, paddingHorizontal: spacing.md, height: 48 },
  searchInput: { flex: 1, fontFamily: font.body, color: colors.onSurface, fontSize: 15 },
  chipRow: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: spacing.sm },
  chip: { height: 34, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, justifyContent: "center", backgroundColor: "#fff" },
  chipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  chipText: { fontFamily: font.bodyMed, color: colors.onSurfaceSecondary, fontSize: 12 },
  chipTextActive: { color: colors.onSurfaceInverse },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  empty: { alignItems: "center", padding: spacing.xxxl },
  emptyTitle: { fontFamily: font.display, fontSize: 20, color: colors.onSurface, marginTop: spacing.md },
  emptyDesc: { fontFamily: font.body, fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 4 },
  section: { fontFamily: font.display, fontSize: 20, color: colors.onSurface, marginTop: spacing.xxl, marginBottom: spacing.md },
  futureGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  futureCard: { width: "31.5%", padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, alignItems: "center", opacity: 0.85 },
  futureIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  futureLabel: { fontFamily: font.bodyMed, fontSize: 11, color: colors.onSurfaceSecondary, textAlign: "center" },
  futureTag: { marginTop: spacing.xs, fontFamily: font.bodyBold, fontSize: 8, color: colors.brand, letterSpacing: 1, backgroundColor: colors.brandTertiary, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
});
