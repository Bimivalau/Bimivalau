/**
 * Collection detail — styles saved to a specific inspiration board.
 */
import { useCallback, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, font } from "@/src/theme";
import StyleCard, { Hairstyle } from "@/src/components/StyleCard";

export default function CollectionDetail() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Hairstyle[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const arr = await api(`/style-saves/me?collection_id=${encodeURIComponent(id as string)}`);
      setItems(arr || []);
    } finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[s.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable testID="cd-back" onPress={() => router.back()} hitSlop={10}>
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={s.headerTitle}>{name || "Board"}</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.brand} /></View>
      ) : items.length === 0 ? (
        <View style={s.empty}>
          <Feather name="bookmark" size={40} color={colors.borderStrong} />
          <Text style={s.emptyTitle}>Nothing saved yet</Text>
          <Text style={s.emptyDesc}>Tap the bookmark on any style to add it here.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xxxl }} showsVerticalScrollIndicator={false}>
          <View style={s.grid}>
            {items.map((h) => (
              <View key={h.id} style={{ width: "48%", marginBottom: spacing.xl }}>
                <StyleCard style={h} variant="compact" onPress={() => router.push({ pathname: "/hairstyle/[id]", params: { id: h.id } })} />
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  headerTitle: { fontFamily: font.bodyBold, fontSize: 16, color: colors.onSurface },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyTitle: { fontFamily: font.display, fontSize: 20, color: colors.onSurface, marginTop: spacing.md },
  emptyDesc: { fontFamily: font.body, fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 4, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
});
