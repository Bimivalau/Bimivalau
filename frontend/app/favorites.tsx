import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, font, radii } from "@/src/theme";
import { SafeScrollView, ResponsiveHeading, Card, EmptyState, LoadingState, ErrorState } from "@/src/ui";

export default function Favorites() {
  const router = useRouter();
  const [favs, setFavs] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setErr(null); const d = await api("/favorites/me"); setFavs(Array.isArray(d) ? d : []); }
    catch (e: any) { setErr(e?.userMessage || "Could not load favorites."); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (err && !favs) return <ErrorState message={err} onRetry={load} />;
  if (!favs) return <LoadingState label="Loading your favorites…" />;

  return (
    <SafeScrollView>
      <View style={{ paddingTop: spacing.md }}>
        <View style={s.headerRow}>
          <Pressable
            testID="fav-back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            hitSlop={12}
            style={s.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Feather name="arrow-left" size={22} color={colors.onSurface} />
          </Pressable>
        </View>
        <ResponsiveHeading size={30} style={{ marginTop: spacing.sm }}>Favorites</ResponsiveHeading>
        <Text style={s.sub}>Braid artists you&apos;ve saved.</Text>

        {favs.length === 0 ? (
          <View style={{ marginTop: spacing.xxxl }}>
            <EmptyState
              icon="heart"
              title="No favorites yet"
              message="Tap the heart on any Studio to save them here for quick access."
              ctaLabel="Browse studios"
              onCta={() => router.push("/(tabs)/search")}
            />
          </View>
        ) : (
          <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
            {favs.map((h: any) => (
              <Pressable
                key={h.id}
                testID={`fav-${h.id}`}
                onPress={() => router.push(`/hairdresser/${h.id}` as any)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${h.salon_name || h.name}`}
              >
                <Card padding={spacing.md} style={{ flexDirection: "row", gap: spacing.md, alignItems: "center" }}>
                  {h.cover_photo ? (
                    <Image source={{ uri: h.cover_photo }} style={s.img} contentFit="cover" />
                  ) : (
                    <View style={[s.img, s.imgPlaceholder]}>
                      <Feather name="user" size={20} color={colors.muted} />
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.name} numberOfLines={1}>{h.name}</Text>
                    <Text style={s.salon} numberOfLines={1}>{h.salon_name || "Studio"}</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.muted} />
                </Card>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </SafeScrollView>
  );
}

const s = StyleSheet.create({
  headerRow: { minHeight: 44, justifyContent: "center" },
  backBtn: { minHeight: 44, width: 44, alignItems: "flex-start", justifyContent: "center" },
  sub: { color: colors.onSurfaceTertiary, fontFamily: font.body, fontSize: 13, marginTop: spacing.sm, lineHeight: 18 },
  img: { width: 56, height: 56, borderRadius: radii.md, backgroundColor: colors.surfaceSecondary },
  imgPlaceholder: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  name: { fontFamily: font.bodyBold, fontSize: 15, color: colors.onSurface },
  salon: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
});
