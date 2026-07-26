import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { api } from "@/src/api";
import { colors, font, radii, spacing } from "@/src/theme";
import { SafeScrollView, ResponsiveHeading, Card, Badge, SectionTitle, EmptyState, LoadingState, ErrorState } from "@/src/ui";

type Booking = {
  id: string;
  hairstyle_name: string;
  customer_name: string;
  appointment_datetime: string;
  status: string;
};

export default function ProBookings() {
  const router = useRouter();
  const { t } = useTranslation("booking");
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setErr(null); const d = await api("/hairdressers/me/dashboard"); setData(d); }
    catch (e: any) { setErr(e?.userMessage || t("pro_bookings.load_error")); }
  }, [t]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (err && !data) return <ErrorState message={err} onRetry={load} />;
  if (!data) return <LoadingState label={t("pro_bookings.loading_label")} />;

  const upcoming: Booking[] = data.upcoming || [];
  const today = new Date().toDateString();
  const todays = upcoming.filter(b => new Date(b.appointment_datetime).toDateString() === today);
  const future = upcoming.filter(b => new Date(b.appointment_datetime).toDateString() !== today);

  return (
    <SafeScrollView>
      <View style={{ paddingTop: spacing.md }}>
        <Text style={s.eyebrow}>{t("pro_bookings.eyebrow")}</Text>
        <ResponsiveHeading size={30} style={{ marginTop: spacing.xs }}>{t("pro_bookings.heading")}</ResponsiveHeading>
        <Text style={s.sub}>{t("pro_bookings.subtitle")}</Text>

        <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.lg }}>
          <Pressable testID="bk-avail" onPress={() => router.push("/pro/availability")} style={{ flex: 1 }} accessibilityRole="button">
            <Card padding={spacing.md} variant="tinted">
              <Feather name="clock" size={18} color={colors.brand} />
              <Text style={s.quickTitle}>{t("pro_bookings.availability_title")}</Text>
              <Text style={s.quickSub}>{t("pro_bookings.availability_sub")}</Text>
            </Card>
          </Pressable>
          <Pressable testID="bk-services" onPress={() => router.push("/pro/services")} style={{ flex: 1 }} accessibilityRole="button">
            <Card padding={spacing.md} variant="tinted">
              <Feather name="tag" size={18} color={colors.brand} />
              <Text style={s.quickTitle}>{t("pro_bookings.services_title")}</Text>
              <Text style={s.quickSub}>{t("pro_bookings.services_sub")}</Text>
            </Card>
          </Pressable>
        </View>

        <SectionTitle title={t("pro_bookings.today_section", { count: todays.length })} />
        {todays.length === 0 ? (
          <EmptyState icon="coffee" title={t("pro_bookings.no_today_title")} message={t("pro_bookings.no_today_message")} />
        ) : (
          todays.map(b => <Appt key={b.id} b={b} onPress={() => router.push(`/booking/${b.id}` as any)} showDate={false} />)
        )}

        <SectionTitle title={t("pro_bookings.upcoming_section", { count: future.length })} />
        {future.length === 0 ? (
          <EmptyState icon="calendar" title={t("pro_bookings.no_upcoming_title")} message={t("pro_bookings.no_upcoming_message")} />
        ) : (
          future.slice(0, 10).map(b => <Appt key={b.id} b={b} onPress={() => router.push(`/booking/${b.id}` as any)} showDate />)
        )}
      </View>
    </SafeScrollView>
  );
}

function Appt({ b, onPress, showDate }: { b: Booking; onPress: () => void; showDate: boolean }) {
  const d = new Date(b.appointment_datetime);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const tone: any = b.status === "cancelled" ? "error" : b.status === "completed" ? "success" : "brand";
  return (
    <Pressable testID={`appt-${b.id}`} onPress={onPress}>
      <Card padding={spacing.md} style={{ marginBottom: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <View style={{ minWidth: 56 }}>
          {showDate && <Text style={s.apptDate}>{date}</Text>}
          <Text style={s.apptTime}>{time}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.apptStyle} numberOfLines={1}>{b.hairstyle_name}</Text>
          <Text style={s.apptCust} numberOfLines={1}>{b.customer_name}</Text>
        </View>
        <Badge label={b.status.replace(/_/g, " ").toUpperCase()} tone={tone} />
      </Card>
    </Pressable>
  );
}

const s = StyleSheet.create({
  eyebrow: { color: colors.brand, letterSpacing: 3, fontSize: 10, fontFamily: font.bodyMed },
  sub: { color: colors.onSurfaceTertiary, fontFamily: font.body, fontSize: 13, marginTop: spacing.sm, lineHeight: 18 },
  quickTitle: { fontFamily: font.bodyBold, color: colors.onSurface, fontSize: 13, marginTop: spacing.sm },
  quickSub: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
  apptDate: { fontFamily: font.bodyMed, color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1 },
  apptTime: { fontFamily: font.display, fontSize: 18, color: colors.brand, marginTop: 2 },
  apptStyle: { fontFamily: font.bodyBold, color: colors.onSurface, fontSize: 14 },
  apptCust: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  _radii: { borderRadius: radii.md },
});
