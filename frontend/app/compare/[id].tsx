import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "@/src/api";
import { colors, spacing, font, radii } from "@/src/theme";
import { LoadingState, EmptyState, ErrorState } from "@/src/ui";

type Sort = "earliest" | "lowest_price" | "shortest" | "highest_rated" | "most_reviewed";
const SORT_KEYS: Sort[] = ["earliest", "lowest_price", "shortest", "highest_rated", "most_reviewed"];
type NotifyState = "idle" | "saving" | "done" | "error";

export default function Compare() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("hairstyle");
  const [data, setData] = useState<any>(null);
  const [sort, setSort] = useState<Sort>("earliest");
  const [availToday, setAvailToday] = useState(false);
  const [hairIncluded, setHairIncluded] = useState<boolean | null>(null);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notifyState, setNotifyState] = useState<NotifyState>("idle");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ sort });
      if (availToday) params.set("available_today", "true");
      if (verifiedOnly) params.set("verified_only", "true");
      if (hairIncluded !== null) params.set("hair_included", String(hairIncluded));
      const r = await api(`/hairstyles/${id}/compare?${params.toString()}`);
      setData(r);
    } catch (e: any) {
      setError(e instanceof ApiError ? e.userMessage : t("compare.load_error"));
    } finally {
      setLoading(false);
    }
  }, [id, sort, availToday, hairIncluded, verifiedOnly, t]);
  useEffect(() => { load(); }, [load]);

  const notifyMe = async () => {
    setNotifyState("saving");
    try {
      await api("/interest-signups", { method: "POST", body: JSON.stringify({ hairstyle_id: id }) });
      setNotifyState("done");
    } catch {
      setNotifyState("error");
    }
  };

  if (loading && !data) return <LoadingState label={t("compare.loading")} />;
  if (error && !data) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl, paddingBottom: spacing.sm, backgroundColor: colors.surface }}>
        <Pressable testID="compare-back" onPress={() => router.back()}><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.title}>{data.hairstyle.name}</Text>
        <Text style={s.sub}>
          {t("compare.subtitle", { count: data.total_matches })}
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          {SORT_KEYS.map(k => (
            <Pressable key={k} testID={`sort-${k}`} onPress={() => setSort(k)} style={[s.chip, sort === k && s.chipActive]}>
              <Text style={[s.chipText, sort === k && s.chipTextActive]}>{t(`compare.sort_labels.${k}`)}</Text>
            </Pressable>
          ))}
          <Pressable testID="filter-today" onPress={() => setAvailToday(v => !v)} style={[s.chip, availToday && s.chipActive]}>
            <Text style={[s.chipText, availToday && s.chipTextActive]}>{t("compare.available_today")}</Text>
          </Pressable>
          <Pressable testID="filter-verified" onPress={() => setVerifiedOnly(v => !v)} style={[s.chip, verifiedOnly && s.chipActive]}>
            <Text style={[s.chipText, verifiedOnly && s.chipTextActive]}>{t("compare.verified_pro")}</Text>
          </Pressable>
          <Pressable testID="filter-hair" onPress={() => setHairIncluded(v => v === true ? null : true)} style={[s.chip, hairIncluded === true && s.chipActive]}>
            <Text style={[s.chipText, hairIncluded === true && s.chipTextActive]}>{t("compare.hair_included")}</Text>
          </Pressable>
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl, flexGrow: 1 }}>
        {loading && <ActivityIndicator color={colors.brand} />}

        {!loading && data.total_matches === 0 ? (
          <View>
            <EmptyState
              testID="compare-empty-no-braiders"
              icon="users"
              title={t("compare.empty_no_braiders_title", { name: data.hairstyle.name })}
              message={t("compare.empty_no_braiders_message")}
              ctaLabel={t("compare.browse_other_styles")}
              onCta={() => router.push("/(tabs)/search")}
            />
            <Pressable
              testID="compare-notify-me"
              onPress={notifyMe}
              disabled={notifyState === "saving" || notifyState === "done"}
              style={[s.notifyBtn, (notifyState === "saving" || notifyState === "done") && { opacity: 0.6 }]}
            >
              <Feather name={notifyState === "done" ? "check" : "bell"} size={14} color={colors.brand} />
              <Text style={s.notifyText}>
                {notifyState === "done" ? t("compare.notify_me_done") : notifyState === "saving" ? t("compare.notify_me_saving") : t("compare.notify_me")}
              </Text>
            </Pressable>
            {notifyState === "error" && <Text style={s.notifyError}>{t("compare.notify_me_error")}</Text>}
          </View>
        ) : !loading && data.results.length === 0 ? (
          <EmptyState
            testID="compare-empty-filtered"
            icon="filter"
            title={t("compare.empty_filtered_title")}
            message={t("compare.empty_filtered_message")}
          />
        ) : (
          /* Discovery is universal — every match is visible to every customer, always. */
          data.results.map((c: any) => (
          <Pressable key={c.hairdresser_id} testID={`compare-card-${c.hairdresser_id}`} onPress={() => router.push(`/hairdresser/${c.hairdresser_id}`)} style={s.card}>
            <Image source={{ uri: c.portfolio_photo }} style={s.cardImg} contentFit="cover" />
            <View style={{ padding: spacing.md, gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={s.cardName}>{c.name}</Text>
                {c.verified && <View style={s.verifiedBadge}><Feather name="check" size={10} color="#fff" /><Text style={s.verifiedText}>{t("compare.verified_badge")}</Text></View>}
              </View>
              <Text style={s.cardSalon}>{c.salon_name || c.service_area}</Text>
              <View style={s.metricsRow}>
                <View style={s.metric}><Text style={s.metricValue}>{c.currency === "USD" ? "$" : ""}{c.price}</Text><Text style={s.metricLabel}>{t("compare.metric_price")}</Text></View>
                <View style={s.metric}><Text style={s.metricValue}>{Math.round(c.duration_minutes / 60)}h</Text><Text style={s.metricLabel}>{t("compare.metric_time")}</Text></View>
                <View style={s.metric}><Text style={s.metricValue}>{c.rating_avg ? c.rating_avg.toFixed(1) : "—"}</Text><Text style={s.metricLabel}>{c.reviews_count} {t("compare.metric_reviews")}</Text></View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm }}>
                <Feather name={c.hair_included ? "check-circle" : "circle"} size={13} color={c.hair_included ? colors.success : colors.muted} />
                <Text style={s.tag}>{c.hair_included ? t("compare.hair_included") : t("compare.hair_not_included")}</Text>
                <Text style={{ color: colors.muted }}>·</Text>
                <Feather name="clock" size={12} color={colors.muted} />
                <Text style={s.tag}>{c.earliest_available || t("compare.no_slots")}</Text>
              </View>
            </View>
          </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  notifyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.lg, alignSelf: "center", paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.brand },
  notifyText: { fontFamily: font.bodyMed, color: colors.brand, fontSize: 14 },
  notifyError: { fontFamily: font.body, color: colors.error, fontSize: 12, textAlign: "center", marginTop: spacing.sm },
  title: { fontFamily: font.display, fontSize: 30, color: colors.onSurface, marginTop: spacing.sm },
  sub: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 13, marginBottom: spacing.md },
  chipRow: { gap: spacing.sm, paddingRight: spacing.xl },
  chip: { height: 36, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.borderStrong, justifyContent: "center", flexShrink: 0 },
  chipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  chipText: { fontFamily: font.bodyMed, color: colors.onSurface, fontSize: 12 },
  chipTextActive: { color: colors.onSurfaceInverse },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, marginBottom: spacing.md, overflow: "hidden" },
  cardImg: { width: "100%", height: 160, backgroundColor: colors.surfaceSecondary },
  cardName: { fontFamily: font.display, fontSize: 20, color: colors.onSurface },
  cardSalon: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 12 },
  verifiedBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.success, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radii.pill },
  verifiedText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 9, letterSpacing: 1 },
  metricsRow: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderColor: colors.divider },
  metric: { alignItems: "flex-start" },
  metricValue: { fontFamily: font.display, fontSize: 18, color: colors.onSurface },
  metricLabel: { fontFamily: font.bodyMed, color: colors.muted, fontSize: 9, letterSpacing: 1 },
  tag: { fontFamily: font.body, color: colors.onSurfaceSecondary, fontSize: 12 },
});
