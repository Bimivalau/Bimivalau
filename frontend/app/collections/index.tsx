/**
 * Collections — list all inspiration boards owned by the customer.
 * Tap a board → view styles saved to it.
 */
import { useCallback, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { Image } from "expo-image";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, font, radii } from "@/src/theme";

interface Collection { id: string; name: string; saves_count?: number; cover?: string | null; is_default?: boolean; }

export default function Collections() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [cols, setCols] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const c = await api("/collections/me");
      setCols(c || []);
    } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const iconFor = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes("fav")) return "heart";
    if (n.includes("wedding") || n.includes("bridal")) return "gift";
    if (n.includes("vacation") || n.includes("summer")) return "sun";
    if (n.includes("kids")) return "smile";
    if (n.includes("birthday")) return "coffee";
    if (n.includes("next")) return "calendar";
    return "folder";
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[s.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable testID="col-back" onPress={() => router.back()} hitSlop={10}>
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={s.headerTitle}>My Saved Styles</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xxxl }}>
          <View style={s.grid}>
            {cols.map((c) => (
              <Pressable
                key={c.id}
                testID={`board-${c.id}`}
                onPress={() => router.push({ pathname: "/collections/[id]", params: { id: c.id, name: c.name } })}
                style={s.tile}
              >
                {c.cover ? (
                  <Image source={{ uri: c.cover }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                ) : (
                  <View style={s.emptyTile}><Feather name={iconFor(c.name) as any} size={26} color={colors.borderStrong} /></View>
                )}
                <View style={s.tileGradient} />
                <View style={s.tileMeta}>
                  <Text style={s.tileName}>{c.name}</Text>
                  <Text style={s.tileCount}>{c.saves_count || 0} styles</Text>
                </View>
              </Pressable>
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
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.md },
  tile: { width: "48%", aspectRatio: 1, borderRadius: radii.lg, overflow: "hidden", position: "relative", backgroundColor: colors.surfaceSecondary, marginBottom: spacing.md },
  emptyTile: { flex: 1, alignItems: "center", justifyContent: "center" },
  tileGradient: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.25)" },
  tileMeta: { position: "absolute", bottom: spacing.md, left: spacing.md, right: spacing.md },
  tileName: { fontFamily: font.display, fontSize: 18, color: "#fff" },
  tileCount: { fontFamily: font.bodyMed, fontSize: 11, color: "#F5EFE7", marginTop: 2 },
});
