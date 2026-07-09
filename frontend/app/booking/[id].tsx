import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, TextInput } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useSession } from "@/src/session";
import { colors, spacing, font, radii } from "@/src/theme";

export default function BookingDetail() {
  const { id, confirmed } = useLocalSearchParams<{ id: string; confirmed?: string }>();
  const { user } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [b, setB] = useState<any>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reviewed, setReviewed] = useState(false);

  const load = useCallback(() => api(`/bookings/${id}`).then(setB), [id]);
  useEffect(() => { load(); }, [load]);

  if (!b) return <ActivityIndicator style={{ flex: 1 }} color={colors.brand} />;
  const dt = new Date(b.appointment_datetime);
  const isPro = user?.role === "hairdresser";

  const act = async (path: string) => { await api(`/bookings/${id}/${path}`, { method: "POST" }); await load(); };
  const submitReview = async () => {
    await api("/reviews", { method: "POST", body: JSON.stringify({ booking_id: id, rating, comment }) });
    setReviewed(true);
  };

  return (
    <ScrollView style={{ backgroundColor: colors.surface }} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingBottom: spacing.md }}>
        <Pressable testID="bd-back" onPress={() => router.back()}><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.header}>Booking</Text>
      </View>
      {confirmed && (
        <View style={s.success}>
          <Feather name="check-circle" size={28} color={colors.success} />
          <Text style={s.successTitle}>Confirmed</Text>
          <Text style={s.successMsg}>Your appointment is on the books. Pay at the counter.</Text>
        </View>
      )}
      <View style={{ padding: spacing.xl }}>
        <Image source={{ uri: b.hairstyle_photo }} style={s.image} contentFit="cover" />
        <Text style={s.style}>{b.hairstyle_name}</Text>
        <Text style={s.who}>with {isPro ? b.customer_name : b.hairdresser_name}</Text>
        <View style={s.divider} />
        <Row label="Date" value={dt.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} />
        <Row label="Time" value={dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} />
        <Row label="Salon" value={b.salon_name} />
        <Row label="Price" value={`$${b.price}`} />
        <Row label="Status" value={b.status.replace("_", " ").toUpperCase()} />

        {b.status === "confirmed" && (
          <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
            <Pressable testID="bd-checkin" onPress={() => act("check-in")} style={s.btn}><Text style={s.btnText}>Check-in now</Text></Pressable>
            <Pressable testID="bd-cancel" onPress={() => act("cancel")} style={[s.btn, s.btnGhost]}><Text style={[s.btnText, { color: colors.onSurface }]}>Cancel</Text></Pressable>
          </View>
        )}
        {isPro && b.status === "checked_in" && (
          <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
            <Pressable testID="bd-complete" onPress={() => act("complete")} style={s.btn}><Text style={s.btnText}>Mark completed</Text></Pressable>
            <Pressable testID="bd-noshow" onPress={() => act("no-show")} style={[s.btn, s.btnGhost]}><Text style={[s.btnText, { color: colors.onSurface }]}>No-show</Text></Pressable>
          </View>
        )}

        {!isPro && b.status === "completed" && !reviewed && (
          <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
            <Text style={s.section}>Leave a review</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {[1, 2, 3, 4, 5].map(n => (
                <Pressable key={n} testID={`star-${n}`} onPress={() => setRating(n)}><Feather name="star" size={30} color={n <= rating ? colors.brand : colors.border} /></Pressable>
              ))}
            </View>
            <TextInput testID="review-text" value={comment} onChangeText={setComment} placeholder="Share your experience…" multiline style={s.textarea} />
            <Pressable testID="submit-review" onPress={submitReview} style={s.btn}><Text style={s.btnText}>Post review</Text></Pressable>
          </View>
        )}
        {reviewed && <Text style={{ color: colors.success, marginTop: spacing.md, fontFamily: font.bodyBold }}>Thanks — review posted!</Text>}
      </View>
    </ScrollView>
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
});
