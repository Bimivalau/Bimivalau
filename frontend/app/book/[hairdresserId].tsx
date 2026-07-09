import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, font, radii } from "@/src/theme";

export default function BookFlow() {
  const { hairdresserId } = useLocalSearchParams<{ hairdresserId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [hd, setHd] = useState<any>(null);
  const [styleId, setStyleId] = useState<string | null>(null);
  const [date, setDate] = useState(new Date());
  const [slots, setSlots] = useState<string[]>([]);
  const [slot, setSlot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { api(`/hairdressers/${hairdresserId}`).then(d => { setHd(d); setStyleId(d.specialties[0]?.id); }); }, [hairdresserId]);

  const dateStr = date.toISOString().slice(0, 10);
  useEffect(() => {
    if (!hairdresserId) return;
    api(`/hairdressers/${hairdresserId}/slots?date=${dateStr}`).then(r => { setSlots(r.slots); setSlot(null); });
  }, [dateStr, hairdresserId]);

  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; });

  const confirm = async () => {
    if (!slot || !styleId) return;
    setBusy(true); setErr(null);
    try {
      const b = await api("/bookings", { method: "POST", body: JSON.stringify({
        hairdresser_id: hairdresserId, hairstyle_id: styleId, appointment_datetime: slot,
      })});
      router.replace(`/booking/${b.id}?confirmed=1`);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (!hd) return <ActivityIndicator style={{ flex: 1 }} color={colors.brand} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1, borderColor: colors.divider }}>
        <Pressable testID="book-back" onPress={() => router.back()}><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.header}>Book with {hd.name}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 }}>
        <Text style={s.section}>1. Choose a style</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md }}>
          {hd.specialties.map((sp: any) => (
            <Pressable key={sp.id} testID={`style-${sp.id}`} onPress={() => setStyleId(sp.id)} style={[s.chip, styleId === sp.id && s.chipActive]}>
              <Text style={[s.chipText, styleId === sp.id && s.chipTextActive]}>{sp.name} · ${sp.avg_price}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={s.section}>2. Pick a date</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginTop: spacing.md }}>
          {days.map(d => {
            const active = d.toDateString() === date.toDateString();
            return (
              <Pressable key={d.toISOString()} testID={`date-${d.toISOString().slice(0,10)}`} onPress={() => setDate(d)} style={[s.day, active && s.dayActive]}>
                <Text style={[s.dayLbl, active && s.dayLblActive]}>{d.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase()}</Text>
                <Text style={[s.dayNum, active && s.dayNumActive]}>{d.getDate()}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={s.section}>3. Available slots</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md }}>
          {slots.length === 0 && <Text style={{ color: colors.muted, fontFamily: font.body }}>No slots for this day.</Text>}
          {slots.map(sl => (
            <Pressable key={sl} testID={`slot-${sl}`} onPress={() => setSlot(sl)} style={[s.slot, slot === sl && s.slotActive]}>
              <Text style={[s.slotText, slot === sl && s.slotTextActive]}>{new Date(sl).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</Text>
            </Pressable>
          ))}
        </View>

        <View style={s.policy}>
          <Feather name="info" size={16} color={colors.brand} />
          <Text style={s.policyText}>You'll pay <Text style={{ fontFamily: font.bodyBold }}>at the counter</Text> at the appointment. If you don't check in within 15 min of the scheduled time, the booking is auto-cancelled.</Text>
        </View>
        {err && <Text testID="book-err" style={{ color: colors.error, marginTop: spacing.md, fontFamily: font.body }}>{err}</Text>}
      </ScrollView>

      <View style={[s.bar, { paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable testID="confirm-book" disabled={!slot || !styleId || busy} onPress={confirm} style={[s.confirm, (!slot || !styleId) && { opacity: 0.4 }]}>
          <Text style={s.confirmText}>{busy ? "Booking…" : "Confirm booking"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: { fontFamily: font.display, fontSize: 22, color: colors.onSurface, flex: 1 },
  section: { fontFamily: font.display, fontSize: 20, color: colors.onSurface, marginTop: spacing.lg },
  chip: { paddingHorizontal: spacing.md, height: 40, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.pill, justifyContent: "center" },
  chipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  chipText: { fontFamily: font.bodyMed, color: colors.onSurface, fontSize: 13 },
  chipTextActive: { color: colors.onSurfaceInverse },
  day: { width: 60, paddingVertical: spacing.md, alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
  dayActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  dayLbl: { fontFamily: font.bodyMed, fontSize: 10, color: colors.muted, letterSpacing: 1 },
  dayLblActive: { color: "#fff" },
  dayNum: { fontFamily: font.display, fontSize: 22, color: colors.onSurface, marginTop: 2 },
  dayNumActive: { color: "#fff" },
  slot: { paddingHorizontal: spacing.md, height: 40, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.md, justifyContent: "center", minWidth: 80, alignItems: "center" },
  slotActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  slotText: { fontFamily: font.bodyMed, color: colors.onSurface, fontSize: 13 },
  slotTextActive: { color: "#fff" },
  policy: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xl, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radii.md },
  policyText: { flex: 1, fontFamily: font.body, color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 18 },
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.divider },
  confirm: { backgroundColor: colors.brand, padding: spacing.lg, borderRadius: radii.md, alignItems: "center" },
  confirmText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 15 },
});
