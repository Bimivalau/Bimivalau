/**
 * Discover — Sprint 2 style-first discovery.
 * Grid view of hairstyles with tag filtering. NOT a pro search.
 * Includes disabled "Coming Soon" placeholders for future features.
 */
import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, ActivityIndicator, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import { api, ApiError } from "@/src/api";
import { colors, spacing, font, radii } from "@/src/theme";
import StyleCard, { Hairstyle } from "@/src/components/StyleCard";

const TAG_FILTERS = [
  { key: "", i18nKey: "all" },
  { key: "trending", i18nKey: "trending" },
  { key: "new", i18nKey: "new" },
  { key: "most_loved", i18nKey: "most_loved" },
  { key: "kids", i18nKey: "kids" },
  { key: "bridal", i18nKey: "bridal" },
  { key: "vacation", i18nKey: "vacation" },
  { key: "office", i18nKey: "office" },
  { key: "event", i18nKey: "event" },
  { key: "protective", i18nKey: "protective" },
  { key: "luxury", i18nKey: "luxury" },
  { key: "color", i18nKey: "color" },
  { key: "celebrity", i18nKey: "celebrity" },
  { key: "natural", i18nKey: "natural" },
  { key: "quick", i18nKey: "quick" },
];

const GRID_COLUMN_GAP = spacing.md;

export default function Discover() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation("search");
  const { t: tCommon } = useTranslation("common");
  const params = useLocalSearchParams<{ tag?: string; label?: string }>();
  const { width: windowWidth } = useWindowDimensions();
  // Two even columns inside the ScrollView's horizontal padding, minus one column gap between them.
  const cardWidth = Math.floor((windowWidth - spacing.xl * 2 - GRID_COLUMN_GAP) / 2);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string>(params.tag || "");
  const [results, setResults] = useState<Hairstyle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = tag ? `/hairstyles?section=${encodeURIComponent(tag)}&limit=80` : `/hairstyles?limit=80`;
      const arr: Hairstyle[] = await api(url);
      const filtered = q.trim() ? arr.filter((h) => (h.name + " " + (h.category || "")).toLowerCase().includes(q.toLowerCase())) : arr;
      setResults(filtered);
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.userMessage : t("error_load");
      setError(msg);
      setResults([]);
    } finally { setLoading(false); }
  }, [q, tag, t]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (params.tag && params.tag !== tag) setTag(params.tag); }, [params.tag]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl }}>
        <Text style={s.header}>{t("header")}</Text>
        <Text style={s.sub}>{t("subtitle")}</Text>

        <View style={s.searchBox}>
          <Feather name="search" size={16} color={colors.muted} />
          <TextInput
            testID="discover-input"
            value={q}
            onChangeText={setQ}
            onSubmitEditing={load}
            placeholder={t("search_placeholder")}
            placeholderTextColor={colors.muted}
            style={s.searchInput}
            returnKeyType="search"
          />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
        {TAG_FILTERS.map((f) => (
          <Pressable key={f.key || "all"} testID={`discover-tag-${f.key || "all"}`} onPress={() => setTag(f.key)} style={[s.chip, tag === f.key && s.chipActive]}>
            <Text style={[s.chipText, tag === f.key && s.chipTextActive]}>{t(`tag_filters.${f.i18nKey}`)}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl + insets.bottom }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xxl }} />
        ) : error ? (
          <View style={s.empty}>
            <Feather name="cloud-off" size={40} color={colors.borderStrong} />
            <Text style={s.emptyTitle}>{t("error_title")}</Text>
            <Text style={s.emptyDesc}>{error}</Text>
            <Pressable testID="discover-retry" onPress={load} style={{ marginTop: spacing.lg, backgroundColor: colors.brand, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radii.md }}>
              <Text style={{ color: "#fff", fontFamily: font.bodyBold, fontSize: 13 }}>{tCommon("buttons.retry")}</Text>
            </Pressable>
          </View>
        ) : results.length === 0 ? (
          <View style={s.empty}>
            <Feather name="search" size={40} color={colors.borderStrong} />
            <Text style={s.emptyTitle}>{t("empty_title")}</Text>
            <Text style={s.emptyDesc}>{t("empty_desc")}</Text>
          </View>
        ) : (
          <View style={s.grid}>
            {results.map((h) => (
              <StyleCard
                key={h.id}
                style={h}
                variant="compact"
                width={cardWidth}
                onPress={() => router.push({ pathname: "/hairstyle/[id]", params: { id: h.id } })}
              />
            ))}
          </View>
        )}
      </ScrollView>
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
  grid: { flexDirection: "row", flexWrap: "wrap", columnGap: GRID_COLUMN_GAP, rowGap: spacing.xl },
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
