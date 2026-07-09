import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, font, radii } from "@/src/theme";

export default function Favorites() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [favs, setFavs] = useState<any[]>([]);
  useEffect(() => { api("/favorites/me").then(setFavs); }, []);

  return (
    <ScrollView style={{ backgroundColor: colors.surface }} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl }}>
        <Pressable testID="fav-back" onPress={() => router.back()}><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.title}>Favorites</Text>
        {favs.length === 0 ? (
          <Text style={{ color: colors.muted, fontFamily: font.body, marginTop: spacing.xl }}>No favorites yet. Tap the heart on any stylist to save them.</Text>
        ) : favs.map(h => (
          <Pressable key={h.id} testID={`fav-${h.id}`} onPress={() => router.push(`/hairdresser/${h.id}`)} style={s.card}>
            <Image source={{ uri: h.cover_photo }} style={s.img} contentFit="cover" />
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{h.name}</Text>
              <Text style={s.salon}>{h.salon_name}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 34, color: colors.onSurface, marginTop: spacing.lg, marginBottom: spacing.lg },
  card: { flexDirection: "row", gap: spacing.md, alignItems: "center", padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, marginBottom: spacing.sm },
  img: { width: 64, height: 64, borderRadius: radii.md, backgroundColor: colors.surfaceSecondary },
  name: { fontFamily: font.display, fontSize: 18, color: colors.onSurface },
  salon: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 13 },
});
