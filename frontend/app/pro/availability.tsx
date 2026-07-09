import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, font, radii } from "@/src/theme";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function ProAvailability() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<{ day_of_week: number; start_time: string; end_time: string }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { api("/availability/me").then(setItems); }, []);

  const toggle = (d: number) => {
    setItems(prev => prev.find(i => i.day_of_week === d)
      ? prev.filter(i => i.day_of_week !== d)
      : [...prev, { day_of_week: d, start_time: "09:00", end_time: "18:00" }]);
  };
  const upd = (d: number, k: "start_time" | "end_time", v: string) =>
    setItems(prev => prev.map(i => i.day_of_week === d ? { ...i, [k]: v } : i));

  const save = async () => {
    await api("/availability/me", { method: "PUT", body: JSON.stringify(items) });
    setMsg("Saved");
    setTimeout(() => setMsg(null), 2000);
  };

  return (
    <ScrollView style={{ backgroundColor: colors.surface }} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl }}>
        <Pressable testID="avail-back" onPress={() => router.back()}><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.title}>Availability</Text>
        <Text style={s.sub}>Set working hours per weekday.</Text>

        {DAYS.map((day, i) => {
          const item = items.find(it => it.day_of_week === i);
          return (
            <View key={day} style={s.row}>
              <Pressable testID={`day-${day}`} onPress={() => toggle(i)} style={[s.dayBtn, item && s.dayBtnOn]}>
                <Text style={[s.dayText, item && { color: "#fff" }]}>{day}</Text>
              </Pressable>
              {item && (
                <View style={{ flexDirection: "row", gap: spacing.sm, flex: 1 }}>
                  <TextInput testID={`start-${day}`} value={item.start_time} onChangeText={v => upd(i, "start_time", v)} style={s.time} placeholder="09:00" />
                  <Text style={{ alignSelf: "center", fontFamily: font.body }}>—</Text>
                  <TextInput testID={`end-${day}`} value={item.end_time} onChangeText={v => upd(i, "end_time", v)} style={s.time} placeholder="18:00" />
                </View>
              )}
            </View>
          );
        })}
        {msg && <Text style={{ color: colors.success, fontFamily: font.bodyBold, marginTop: spacing.md }}>{msg}</Text>}
        <Pressable testID="avail-save" onPress={save} style={s.save}><Text style={s.saveText}>Save availability</Text></Pressable>
      </View>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 34, color: colors.onSurface, marginTop: spacing.lg },
  sub: { fontFamily: font.body, color: colors.muted, marginBottom: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  dayBtn: { width: 64, paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.md, alignItems: "center" },
  dayBtnOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  dayText: { fontFamily: font.bodyBold, color: colors.onSurface },
  time: { flex: 1, borderBottomWidth: 1, borderColor: colors.borderStrong, paddingVertical: spacing.sm, fontFamily: font.body, textAlign: "center" },
  save: { marginTop: spacing.xl, backgroundColor: colors.brand, padding: spacing.lg, borderRadius: radii.md, alignItems: "center" },
  saveText: { color: "#fff", fontFamily: font.bodyBold },
});
