import { useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useSession } from "@/src/session";
import { colors, spacing, font, radii } from "@/src/theme";
import { SafeScrollView, ResponsiveHeading, Card, Badge, SectionTitle, LoadingState } from "@/src/ui";

/**
 * Professional Dashboard — command center. Focuses on TODAY.
 * Sections (in order):
 *   1. Complete Studio banner (only if setup incomplete) → /pro/studio?focus=<key>
 *   2. Verification banner (only if unverified/pending/rejected)
 *   3. Today at a glance: today's bookings, upcoming count, Business Success Score
 *   4. Today's schedule list
 *   5. Upcoming (next 5)
 *
 * NOTE: Availability/Portfolio/Verification/Growth are reached via the tab bar
 * (Bookings, Growth, My Studio) — no duplicate action grid.
 */
export default function ProDashboard() {
  const { t } = useTranslation("pro_dashboard");
  const { user } = useSession();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [verification, setVerification] = useState<any>(null);
  const [studioStatus, setStudioStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [d, ver, st] = await Promise.all([
        api("/hairdressers/me/dashboard"),
        api("/hairdressers/me/verification").catch(() => null),
        api("/hairdressers/me/studio-status").catch(() => null),
      ]);
      setData(d);
      setVerification(ver);
      setStudioStatus(st);
    } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <LoadingState label={t("dashboard.loading")} />;

  const upcoming = data?.upcoming || [];
  const today = new Date().toDateString();
  const todays = upcoming.filter((b: any) => new Date(b.appointment_datetime).toDateString() === today);
  const future = upcoming.filter((b: any) => new Date(b.appointment_datetime).toDateString() !== today).slice(0, 5);
  const setupIncomplete = studioStatus && studioStatus.progress && studioStatus.progress.done < studioStatus.progress.total;

  return (
    <SafeScrollView>
      <View style={{ paddingTop: spacing.md }}>
        <Text style={s.eyebrow}>{t("dashboard.eyebrow")}</Text>
        <ResponsiveHeading size={30} style={{ marginTop: spacing.xs }}>
          {user?.name?.split(" ")[0] ? t("dashboard.hello_named", { name: user.name.split(" ")[0] }) : t("dashboard.hello_generic")}
        </ResponsiveHeading>
        <Text style={s.sub}>
          {todays.length > 0
            ? t("dashboard.appointments_today", { count: todays.length })
            : t("dashboard.no_appointments")}
        </Text>

        {/* Complete Studio Setup — only until 100% */}
        {setupIncomplete && (
          <Pressable
            testID="setup-banner"
            onPress={() => router.push(`/pro/studio` as any)}
            style={{ marginTop: spacing.lg }}
          >
            <Card variant="tinted" padding={spacing.md} style={styles.setupCard}>
              <View style={styles.setupIcon}>
                <Feather name="zap" size={18} color={colors.brand} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap", rowGap: 4 }}>
                  <Text style={styles.setupTitle} numberOfLines={2}>{t("dashboard.setup_title")}</Text>
                  <Badge label={`${studioStatus.progress.percent}%`} tone="brand" variant="solid" />
                </View>
                <Text style={styles.setupMsg} numberOfLines={2}>
                  {t("dashboard.next_up", { label: studioStatus.sections.find((x: any) => x.key === studioStatus.first_incomplete)?.label || t("dashboard.improve_studio_fallback") })}
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color={colors.brand} />
            </Card>
          </Pressable>
        )}

        {verification && verification.status !== "approved" && verification.status !== "unverified" && (
          <Pressable
            testID="ver-banner"
            onPress={() => router.push("/pro/verification")}
            style={{ marginTop: spacing.md }}
          >
            <Card
              variant="outline"
              padding={spacing.md}
              style={[
                styles.verBanner,
                verification.status === "rejected" && { borderColor: colors.error, backgroundColor: "#FFF3F2" },
                verification.status === "pending" && { borderColor: colors.warning, backgroundColor: "#FFF6E6" },
              ]}
            >
              <Feather
                name={verification.status === "rejected" ? "alert-triangle" : "clock"}
                size={20}
                color={verification.status === "rejected" ? colors.error : colors.warning}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.verBannerTitle, verification.status === "rejected" && { color: colors.error }]} numberOfLines={2}>
                  {verification.status === "rejected" ? t("dashboard.ver_rejected_title") : t("dashboard.ver_pending_title")}
                </Text>
                <Text style={styles.verBannerMsg} numberOfLines={2}>
                  {verification.status === "rejected"
                    ? t("dashboard.ver_rejected_msg")
                    : t("dashboard.ver_pending_msg")}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.muted} />
            </Card>
          </Pressable>
        )}

        {/* Today at a glance */}
        <SectionTitle title={t("dashboard.today_glance")} />
        <View style={styles.statRow}>
          <StatBlock label={t("dashboard.stat_today_label")} value={todays.length} sub={t("dashboard.stat_today_sub")} />
          <StatBlock label={t("dashboard.stat_upcoming_label")} value={upcoming.length} sub={t("dashboard.stat_upcoming_sub")} />
        </View>

        {/* Today's schedule */}
        <SectionTitle title={t("dashboard.todays_schedule", { count: todays.length })} action={t("dashboard.see_all")} onActionPress={() => router.push("/pro/bookings")} />
        {todays.length === 0 ? (
          <Card variant="tinted" padding={spacing.lg} style={{ alignItems: "center" }}>
            <Feather name="coffee" size={22} color={colors.brand} />
            <Text style={styles.emptyTitle}>{t("dashboard.free_day")}</Text>
            <Text style={styles.emptyMsg} numberOfLines={2}>{t("dashboard.free_day_message")}</Text>
          </Card>
        ) : (
          todays.map((b: any) => (
            <ApptRow key={b.id} b={b} onPress={() => router.push(`/booking/${b.id}` as any)} showDate={false} />
          ))
        )}

        {future.length > 0 && (
          <>
            <SectionTitle title={t("dashboard.upcoming_count", { count: future.length })} action={t("dashboard.see_all")} onActionPress={() => router.push("/pro/bookings")} />
            {future.map((b: any) => (
              <ApptRow key={b.id} b={b} onPress={() => router.push(`/booking/${b.id}` as any)} showDate />
            ))}
          </>
        )}
      </View>
    </SafeScrollView>
  );
}

function StatBlock({ label, value, sub, onPress }: { label: string; value: any; sub?: string; onPress?: () => void }) {
  const content = (
    <Card padding={spacing.md} style={{ flex: 1, minHeight: 92 }}>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      {sub ? <Text style={styles.statSub} numberOfLines={1}>{sub}</Text> : null}
    </Card>
  );
  if (onPress) return <Pressable onPress={onPress} style={{ flex: 1 }}>{content}</Pressable>;
  return <View style={{ flex: 1 }}>{content}</View>;
}

function ApptRow({ b, onPress, showDate }: { b: any; onPress: () => void; showDate: boolean }) {
  const d = new Date(b.appointment_datetime);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <Pressable testID={`pro-booking-${b.id}`} onPress={onPress}>
      <Card padding={spacing.md} style={{ marginBottom: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <View style={{ minWidth: 56 }}>
          {showDate && <Text style={styles.apptDate}>{date}</Text>}
          <Text style={styles.apptTime}>{time}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.apptStyle} numberOfLines={1}>{b.hairstyle_name}</Text>
          <Text style={styles.apptCust} numberOfLines={1}>{b.customer_name}</Text>
        </View>
        <Badge label={String(b.status).replace(/_/g, " ").toUpperCase()} tone={b.status === "cancelled" ? "error" : b.status === "completed" ? "success" : "brand"} />
      </Card>
    </Pressable>
  );
}

const s = StyleSheet.create({
  eyebrow: { color: colors.brand, letterSpacing: 3, fontSize: 10, fontFamily: font.bodyMed },
  sub: { color: colors.onSurfaceTertiary, fontFamily: font.body, fontSize: 13, marginTop: spacing.sm, lineHeight: 18 },
});

const styles = StyleSheet.create({
  setupCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  setupIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  setupTitle: { fontFamily: font.bodyBold, color: colors.brand, fontSize: 14, flexShrink: 1 },
  setupMsg: { fontFamily: font.body, color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2, lineHeight: 17 },
  verBanner: { flexDirection: "row", gap: spacing.md, alignItems: "center", borderRadius: radii.md, borderWidth: 1 },
  verBannerTitle: { fontFamily: font.bodyBold, color: colors.onSurface, fontSize: 14 },
  verBannerMsg: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  statRow: { flexDirection: "row", gap: spacing.sm },
  statLabel: { fontFamily: font.bodyMed, fontSize: 10, color: colors.onSurfaceTertiary, letterSpacing: 1 },
  statValue: { fontFamily: font.display, fontSize: 28, color: colors.onSurface, marginTop: 4 },
  statSub: { fontFamily: font.body, fontSize: 11, color: colors.onSurfaceTertiary, marginTop: 2 },
  apptDate: { fontFamily: font.bodyMed, color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1 },
  apptTime: { fontFamily: font.display, fontSize: 18, color: colors.brand, marginTop: 2 },
  apptStyle: { fontFamily: font.bodyBold, color: colors.onSurface, fontSize: 14 },
  apptCust: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  emptyTitle: { fontFamily: font.bodyBold, color: colors.onSurface, fontSize: 15, marginTop: spacing.sm },
  emptyMsg: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 12, textAlign: "center", marginTop: 4, lineHeight: 17, maxWidth: 320 },
});
