import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { api } from "@/src/api";
import { useSession } from "@/src/session";
import { colors, spacing, font, radii } from "@/src/theme";
import { openDirections, hasDirectionsTarget } from "@/src/utils/directions";

export default function BookingDetail() {
  const { id, confirmed } = useLocalSearchParams<{ id: string; confirmed?: string }>();
  const { user } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("booking");
  const { t: tCommon } = useTranslation("common");
  const [b, setB] = useState<any>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const [proRating, setProRating] = useState(5);
  const [flagged, setFlagged] = useState(false);
  const [flagReason, setFlagReason] = useState("");
  const [proRated, setProRated] = useState(false);
  const [proRateErr, setProRateErr] = useState<string | null>(null);

  const load = useCallback(() => api(`/bookings/${id}`).then(setB), [id]);
  useEffect(() => { load(); }, [load]);

  if (!b) return <ActivityIndicator style={{ flex: 1 }} color={colors.brand} />;
  const dt = new Date(b.appointment_datetime);
  const isPro = user?.role === "hairdresser";

  const act = async (path: string) => { await api(`/bookings/${id}/${path}`, { method: "POST" }); await load(); };

  const checkInWithMyCode = async () => {
    setCodeErr(null);
    try { await api("/bookings/check-in-by-code", { method: "POST", body: JSON.stringify({ code: b.code }) }); await load(); }
    catch (e: any) { setCodeErr(e.message); }
  };
  const checkInWithEntered = async () => {
    setCodeErr(null);
    try {
      await api("/bookings/check-in-by-code", { method: "POST", body: JSON.stringify({ code: codeInput.toUpperCase() }) });
      setCodeInput(""); await load();
    } catch (e: any) { setCodeErr(e.message); }
  };
  const submitReview = async () => {
    await api("/reviews", { method: "POST", body: JSON.stringify({ booking_id: id, rating, comment }) });
    setReviewed(true);
  };
  const submitProRating = async () => {
    setProRateErr(null);
    try {
      await api("/customer-ratings", { method: "POST", body: JSON.stringify({
        booking_id: id, rating: proRating,
        flagged_for_removal: flagged, flag_reason: flagged ? (flagReason || "No reason given") : null,
      }) });
      setProRated(true);
    } catch (e: any) { setProRateErr(e.message); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView style={{ backgroundColor: colors.surface }} contentContainerStyle={{ paddingBottom: spacing.xxxl + insets.bottom }} keyboardShouldPersistTaps="handled">
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingBottom: spacing.md }}>
        <Pressable testID="bd-back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} hitSlop={12} accessibilityRole="button" accessibilityLabel={tCommon("buttons.back")}>
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={s.header}>{t("detail.header")}</Text>
      </View>
      {confirmed && (
        <View style={s.success}>
          <Feather name="check-circle" size={28} color={colors.success} />
          <Text style={s.successTitle}>{t("detail.success_title")}</Text>
          <Text style={s.successMsg}>{t("detail.success_message")}</Text>
        </View>
      )}
      <View style={{ padding: spacing.xl }}>
        <Image source={{ uri: b.hairstyle_photo }} style={s.image} contentFit="cover" />
        <Text style={s.style}>{b.hairstyle_name}</Text>
        <Text style={s.who}>{t("detail.with_prefix")} {isPro ? b.customer_name : b.hairdresser_name}</Text>
        <View style={s.divider} />
        <Row label={t("detail.row_date")} value={dt.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} />
        <Row label={t("detail.row_time")} value={dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} />
        <Row label={t("detail.row_salon")} value={b.salon_name} />
        <Row label={t("detail.row_price")} value={`$${b.price}`} />
        <Row label={t("detail.row_status")} value={b.status.replace("_", " ").toUpperCase()} />

        {b.status === "confirmed" && hasDirectionsTarget({ latitude: b.latitude, longitude: b.longitude, address: b.address }) && (
          <Pressable
            testID="bd-directions"
            onPress={() => openDirections({ latitude: b.latitude, longitude: b.longitude, address: b.address, label: b.salon_name })}
            style={s.directionsBtn}
            accessibilityRole="button"
          >
            <Feather name="navigation" size={14} color={colors.brand} />
            <Text style={s.directionsText}>{t("detail.get_directions")}</Text>
          </Pressable>
        )}

        {b.status === "confirmed" && (
          <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
            <Text style={s.section}>{t("detail.checkin_code_title")}</Text>
            <View style={s.codeBox}>
              <Text testID="booking-code" style={s.codeText}>{b.code}</Text>
              <Text style={s.codeHint}>{isPro ? t("detail.code_hint_customer") : t("detail.code_hint_stylist")}</Text>
            </View>
            <Pressable testID="checkin-my-code" onPress={checkInWithMyCode} style={s.btn}>
              <Text style={s.btnText}>{t("detail.checkin_my_code")}</Text>
            </Pressable>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.divider }} />
              <Text style={{ color: colors.muted, fontFamily: font.body, fontSize: 11 }}>{t("detail.or_enter_code")}</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.divider }} />
            </View>
            <TextInput
              testID="checkin-code-input"
              value={codeInput}
              onChangeText={(t) => setCodeInput(t.toUpperCase())}
              placeholder={t("detail.code_placeholder")}
              maxLength={6}
              autoCapitalize="characters"
              style={s.codeInput}
            />
            {codeErr && <Text testID="checkin-err" style={{ color: colors.error, fontFamily: font.body }}>{codeErr}</Text>}
            <Pressable testID="checkin-enter" disabled={codeInput.length !== 6} onPress={checkInWithEntered} style={[s.btn, codeInput.length !== 6 && { opacity: 0.4 }]}>
              <Text style={s.btnText}>{t("detail.checkin_entered_code")}</Text>
            </Pressable>
            <Pressable testID="bd-cancel" onPress={() => act("cancel")} style={[s.btn, s.btnGhost]}>
              <Text style={[s.btnText, { color: colors.onSurface }]}>{t("detail.cancel_booking")}</Text>
            </Pressable>
          </View>
        )}
        {isPro && b.status === "checked_in" && (
          <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
            <Pressable testID="bd-complete" onPress={() => act("complete")} style={s.btn}><Text style={s.btnText}>{t("detail.mark_completed")}</Text></Pressable>
            <Pressable testID="bd-noshow" onPress={() => act("no-show")} style={[s.btn, s.btnGhost]}><Text style={[s.btnText, { color: colors.onSurface }]}>{t("detail.no_show")}</Text></Pressable>
          </View>
        )}

        {!isPro && b.status === "completed" && !reviewed && (
          <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
            <Text style={s.section}>{t("detail.leave_review_title")}</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {[1, 2, 3, 4, 5].map(n => (
                <Pressable key={n} testID={`star-${n}`} onPress={() => setRating(n)}><Feather name="star" size={30} color={n <= rating ? colors.brand : colors.border} /></Pressable>
              ))}
            </View>
            <TextInput testID="review-text" value={comment} onChangeText={setComment} placeholder={t("detail.review_placeholder")} multiline style={s.textarea} />
            <Pressable testID="submit-review" onPress={submitReview} style={s.btn}><Text style={s.btnText}>{t("detail.post_review")}</Text></Pressable>
          </View>
        )}
        {reviewed && <Text style={{ color: colors.success, marginTop: spacing.md, fontFamily: font.bodyBold }}>{t("detail.review_thanks")}</Text>}

        {/* Pro rates the customer after completion / no-show */}
        {isPro && (b.status === "completed" || b.status === "no_show") && !proRated && (
          <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
            <Text style={s.section}>{t("detail.rate_customer_title")}</Text>
            <Text style={{ fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 13 }}>
              {t("detail.rate_customer_desc")}
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {[1, 2, 3, 4, 5].map(n => (
                <Pressable key={n} testID={`prostar-${n}`} onPress={() => setProRating(n)}>
                  <Feather name="star" size={28} color={n <= proRating ? colors.brand : colors.border} />
                </Pressable>
              ))}
            </View>
            <Pressable testID="flag-toggle" onPress={() => setFlagged(f => !f)} style={s.flagRow}>
              <Feather name={flagged ? "check-square" : "square"} size={18} color={flagged ? colors.error : colors.muted} />
              <Text style={[s.flagText, flagged && { color: colors.error }]}>{t("detail.flag_customer")}</Text>
            </Pressable>
            {flagged && (
              <TextInput
                testID="flag-reason"
                value={flagReason}
                onChangeText={setFlagReason}
                placeholder={t("detail.flag_reason_placeholder")}
                placeholderTextColor={colors.muted}
                multiline
                style={s.textarea}
              />
            )}
            {proRateErr && <Text style={{ color: colors.error, fontFamily: font.body }}>{proRateErr}</Text>}
            <Pressable testID="submit-pro-rating" onPress={submitProRating} style={s.btn}>
              <Text style={s.btnText}>{flagged ? t("detail.submit_rating_flag") : t("detail.submit_rating")}</Text>
            </Pressable>
          </View>
        )}
        {proRated && <Text style={{ color: colors.success, marginTop: spacing.md, fontFamily: font.bodyBold }}>{flagged ? t("detail.rating_recorded_flagged") : t("detail.rating_recorded")}</Text>}
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.md, borderBottomWidth: 1, borderColor: colors.divider }}>
      <Text style={{ fontFamily: font.bodyMed, color: colors.muted, fontSize: 12, letterSpacing: 1 }}>{label.toUpperCase()}</Text>
      <Text style={{ fontFamily: font.bodyMed, color: colors.onSurface, fontSize: 14 }}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  header: { fontFamily: font.display, fontSize: 22, color: colors.onSurface },
  success: { alignItems: "center", padding: spacing.xl, backgroundColor: colors.surfaceSecondary, marginHorizontal: spacing.xl, borderRadius: radii.md, gap: spacing.sm },
  successTitle: { fontFamily: font.display, fontSize: 24, color: colors.onSurface },
  successMsg: { fontFamily: font.body, color: colors.onSurfaceTertiary, textAlign: "center" },
  image: { width: "100%", height: 220, borderRadius: radii.md, marginBottom: spacing.md, backgroundColor: colors.surfaceSecondary },
  style: { fontFamily: font.display, fontSize: 28, color: colors.onSurface },
  who: { fontFamily: font.body, color: colors.onSurfaceTertiary, marginBottom: spacing.md },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },
  btn: { backgroundColor: colors.brand, padding: spacing.md, borderRadius: radii.md, alignItems: "center" },
  btnGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.borderStrong },
  btnText: { color: "#fff", fontFamily: font.bodyBold },
  section: { fontFamily: font.display, fontSize: 22, color: colors.onSurface },
  textarea: { minHeight: 100, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, fontFamily: font.body, textAlignVertical: "top" },
  codeBox: { padding: spacing.lg, backgroundColor: colors.brandTertiary, borderRadius: radii.md, alignItems: "center" },
  codeText: { fontFamily: font.display, fontSize: 44, letterSpacing: 8, color: colors.onBrandTertiary },
  codeHint: { fontFamily: font.body, color: colors.onBrandTertiary, fontSize: 12, marginTop: spacing.sm, textAlign: "center", lineHeight: 17 },
  codeInput: { borderBottomWidth: 1, borderColor: colors.borderStrong, paddingVertical: spacing.md, fontFamily: font.display, fontSize: 24, letterSpacing: 6, textAlign: "center", color: colors.onSurface },
  flagRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  flagText: { fontFamily: font.bodyMed, color: colors.onSurface, fontSize: 14 },
  directionsBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.md, paddingVertical: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.brand },
  directionsText: { fontFamily: font.bodyMed, color: colors.brand, fontSize: 14 },
});
