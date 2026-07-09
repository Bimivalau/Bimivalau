import { useEffect, useState, useCallback } from "react";
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, font, radii } from "@/src/theme";

export default function Search() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [minRating, setMinRating] = useState(0);
  const [cats, setCats] = useState<string[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [gated, setGated] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => { api("/hairstyles/categories").then(r => setCats(r.categories)); }, []);

  const run = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (cat) params.set("category", cat);
    if (minRating) params.set("min_rating", String(minRating));
    const res = await api(`/search?${params.toString()}`);
    setResults(res.results);
    setGated(res.gated);
    setLoading(false);
  }, [q, cat, minRating]);

  useEffect(() => { run(); }, [cat, minRating, run]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl, backgroundColor: colors.surface }}>
        <Text style={s.header}>Search</Text>
        <View style={s.searchBox}>
          <Feather name="search" size={18} color={colors.muted} />
          <TextInput
            testID="search-input"
            value={q}
            onChangeText={setQ}
            onSubmitEditing={run}
            placeholder="Salon, city, or vibe…"
            placeholderTextColor={colors.muted}
            style={s.searchInput}
            returnKeyType="search"
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          <Pressable testID="filter-cat-all" onPress={() => setCat(null)} style={[s.chip, cat === null && s.chipActive]}>
            <Text style={[s.chipText, cat === null && s.chipTextActive]}>All styles</Text>
          </Pressable>
          {cats.map(c => (
            <Pressable key={c} testID={`filter-cat-${c}`} onPress={() => setCat(c === cat ? null : c)} style={[s.chip, cat === c && s.chipActive]}>
              <Text style={[s.chipText, cat === c && s.chipTextActive]}>{c}</Text>
            </Pressable>
          ))}
          <Pressable testID="filter-rating-4" onPress={() => setMinRating(minRating === 4 ? 0 : 4)} style={[s.chip, minRating === 4 && s.chipActive]}>
            <Text style={[s.chipText, minRating === 4 && s.chipTextActive]}>4★+</Text>
          </Pressable>
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl }}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.brand} />
        ) : (
          <>
            {gated && (
              <View testID="gated-banner" style={s.gated}>
                <Text style={s.gatedTitle}>Showing top 3 · Unlock unlimited results</Text>
                <Pressable onPress={() => router.push("/subscription")}>
                  <Text style={s.gatedLink}>Upgrade →</Text>
                </Pressable>
              </View>
            )}
            {results.length === 0 && !loading && (
              <View style={{ alignItems: "center", marginTop: spacing.xxxl }}>
                <Text style={{ fontFamily: font.body, color: colors.muted }}>No hairdressers found.</Text>
              </View>
            )}
            {results.map(h => (
              <Pressable key={h.id} testID={`search-result-${h.id}`} onPress={() => router.push(`/hairdresser/${h.id}`)} style={s.card}>
                <Image source={{ uri: h.cover_photo }} style={s.cardImg} contentFit="cover" />
                <View style={{ padding: spacing.md, gap: 4 }}>
                  <Text style={s.cardName}>{h.name}</Text>
                  <Text style={s.cardSalon}>{h.salon_name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs }}>
                    <Feather name="star" size={13} color={colors.brand} />
                    <Text style={s.cardMeta}>{h.rating_avg?.toFixed(1) || "—"} ({h.reviews_count || 0})</Text>
                    <Text style={s.dot}>·</Text>
                    <Feather name="map-pin" size={12} color={colors.muted} />
                    <Text style={s.cardMeta}>{h.address}</Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: { fontFamily: font.display, fontSize: 32, color: colors.onSurface, marginBottom: spacing.md },
  searchBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.md, height: 48 },
  searchInput: { flex: 1, fontFamily: font.body, color: colors.onSurface, fontSize: 15 },
  chipRow: { paddingVertical: spacing.md, gap: spacing.sm },
  chip: { height: 36, paddingHorizontal: spacing.lg, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.borderStrong, justifyContent: "center", flexShrink: 0 },
  chipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  chipText: { fontFamily: font.bodyMed, color: colors.onSurface, fontSize: 13 },
  chipTextActive: { color: colors.onSurfaceInverse },
  gated: { padding: spacing.md, backgroundColor: colors.brandTertiary, borderRadius: radii.md, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg },
  gatedTitle: { fontFamily: font.bodyMed, color: colors.onBrandTertiary, fontSize: 13, flex: 1 },
  gatedLink: { fontFamily: font.bodyBold, color: colors.brandSecondary },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, marginBottom: spacing.lg, overflow: "hidden" },
  cardImg: { width: "100%", aspectRatio: 1.4, backgroundColor: colors.surfaceSecondary },
  cardName: { fontFamily: font.display, fontSize: 22, color: colors.onSurface },
  cardSalon: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 13 },
  cardMeta: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 12 },
  dot: { color: colors.muted },
});
