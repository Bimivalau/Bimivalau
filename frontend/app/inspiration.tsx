/**
 * My Inspiration Photos — customer's personal inspiration board.
 * The upload button uses the camera or photo library. AI Style Match is not
 * wired yet — we display a "coming soon" chip on every card.
 */
import { useCallback, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { Image } from "expo-image";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, font, radii } from "@/src/theme";
import { pickImage, captureImage } from "@/src/utils/cloudinary";

export default function Inspiration() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api("/inspiration/me");
      setItems(d || []);
    } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const add = async (fromCamera: boolean) => {
    setBusy(true);
    try {
      const picked = fromCamera ? await captureImage("style_catalog") : await pickImage("style_catalog");
      if (!picked) return;
      await api("/inspiration", { method: "POST", body: JSON.stringify({ photo_url: picked.uri, note: "" }) });
      await load();
    } catch (e: any) {
      Alert.alert("Couldn't add photo", e.message || "Please try again.");
    } finally { setBusy(false); }
  };

  const del = async (id: string) => {
    Alert.alert("Remove photo?", "This will delete your inspiration photo.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await api(`/inspiration/${id}`, { method: "DELETE" }); await load(); } },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[s.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable testID="insp-back" onPress={() => router.back()} hitSlop={10}>
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={s.headerTitle}>My Inspiration Photos</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={s.aiCard}>
        <View style={s.aiIcon}><Feather name="zap" size={16} color="#fff" /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.aiTitle}>AI Style Match — Coming Soon</Text>
          <Text style={s.aiDesc}>Upload photos of braids you love. Once AI is ready, we'll auto-match them to styles + pros.</Text>
        </View>
      </View>

      <View style={s.actionRow}>
        <Pressable testID="insp-library" onPress={() => add(false)} disabled={busy} style={[s.actionBtn, busy && { opacity: 0.5 }]}>
          <Feather name="image" size={16} color={colors.onSurface} />
          <Text style={s.actionText}>Library</Text>
        </Pressable>
        <Pressable testID="insp-camera" onPress={() => add(true)} disabled={busy} style={[s.actionBtn, busy && { opacity: 0.5 }]}>
          <Feather name="camera" size={16} color={colors.onSurface} />
          <Text style={s.actionText}>Camera</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.brand} /></View>
      ) : items.length === 0 ? (
        <View style={s.empty}>
          <Feather name="camera" size={40} color={colors.borderStrong} />
          <Text style={s.emptyTitle}>No inspiration yet</Text>
          <Text style={s.emptyDesc}>Screenshot or snap braids you love. They'll live here until AI Match arrives.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.xxxl }} showsVerticalScrollIndicator={false}>
          <View style={s.grid}>
            {items.map((it) => (
              <Pressable key={it.id} onLongPress={() => del(it.id)} style={s.tile}>
                <Image source={{ uri: it.photo_url }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                <View style={s.tileBadge}><Text style={s.tileBadgeText}>AI SOON</Text></View>
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
  aiCard: { marginHorizontal: spacing.xl, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.brandTertiary, flexDirection: "row", alignItems: "center", gap: spacing.md },
  aiIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  aiTitle: { fontFamily: font.bodyBold, fontSize: 13, color: colors.onBrandTertiary },
  aiDesc: { fontFamily: font.body, fontSize: 11, color: colors.onBrandTertiary, marginTop: 2, lineHeight: 15 },
  actionRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.xl, marginTop: spacing.md, marginBottom: spacing.md },
  actionBtn: { flex: 1, height: 44, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: spacing.sm },
  actionText: { fontFamily: font.bodyMed, fontSize: 13, color: colors.onSurface },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyTitle: { fontFamily: font.display, fontSize: 20, color: colors.onSurface, marginTop: spacing.md },
  emptyDesc: { fontFamily: font.body, fontSize: 13, color: colors.onSurfaceTertiary, marginTop: spacing.xs, textAlign: "center", lineHeight: 18, maxWidth: 300 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tile: { width: "32.5%", aspectRatio: 3 / 4, borderRadius: radii.md, overflow: "hidden", position: "relative", backgroundColor: colors.surfaceSecondary },
  tileBadge: { position: "absolute", top: 6, right: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 4 },
  tileBadgeText: { fontFamily: font.bodyBold, fontSize: 8, color: "#fff", letterSpacing: 1 },
});
