import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, font, radii } from "@/src/theme";

export default function Notifications() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { api("/notifications/me").then(setItems); }, []);
  return (
    <ScrollView style={{ backgroundColor: colors.surface }} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl }}>
        <Pressable testID="notif-back" onPress={() => router.back()}><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.title}>Notifications</Text>
        {items.length === 0 && <Text style={{ color: colors.muted, fontFamily: font.body }}>No notifications yet.</Text>}
        {items.map(n => (
          <View key={n.id} style={s.item}>
            <Feather name="bell" size={16} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={s.msg}>{n.message}</Text>
              <Text style={s.date}>{new Date(n.created_at).toLocaleString()}</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 34, color: colors.onSurface, marginTop: spacing.lg, marginBottom: spacing.lg },
  item: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start", padding: spacing.md, borderBottomWidth: 1, borderColor: colors.divider },
  msg: { fontFamily: font.body, color: colors.onSurface, fontSize: 14 },
  date: { fontFamily: font.body, color: colors.muted, fontSize: 11, marginTop: 2 },
});
