import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, font, radii } from "@/src/theme";
import { pickCompressUploadPersist, cldTransform } from "@/src/utils/cloudinary";

const FREE_CAP = 5;

export default function ProPortfolio() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<any[]>([]);
  const [styles_, setStyles] = useState<any[]>([]);
  const [url, setUrl] = useState("");
  const [styleId, setStyleId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [cloudinaryOk, setCloudinaryOk] = useState<boolean | null>(null);

  const load = () => api("/portfolio/me").then(setItems);
  useEffect(() => {
    load();
    api("/hairstyles").then(setStyles);
    api("/media/config").then((c) => setCloudinaryOk(!!c.cloudinary_configured)).catch(() => setCloudinaryOk(false));
  }, []);

  const atCap = items.length >= FREE_CAP;

  const addFromDevice = async () => {
    setErr(null);
    if (!styleId) { setErr("Pick a style first."); return; }
    if (atCap) { setErr(`Free plan is capped at ${FREE_CAP} photos.`); return; }
    if (cloudinaryOk === false) {
      Alert.alert("Uploads not configured", "Ask admin to add Cloudinary keys before uploading photos.");
      return;
    }
    setBusy(true); setUploadProgress(0);
    try {
      const res = await pickCompressUploadPersist({
        context: "portfolio",
        hairstyleId: styleId,
        onProgress: (p) => setUploadProgress(p),
      });
      if (res) await load();
    } catch (e: any) {
      setErr(e.message || "Upload failed. Please try again.");
    } finally {
      setBusy(false);
      setUploadProgress(null);
    }
  };

  const addFromUrl = async () => {
    setErr(null);
    if (!url || !styleId) { setErr("Photo URL and style required."); return; }
    if (atCap) { setErr(`Free plan is capped at ${FREE_CAP} photos.`); return; }
    try {
      await api("/portfolio", { method: "POST", body: JSON.stringify({ photo_url: url, hairstyle_id: styleId, caption: "" }) });
      setUrl(""); await load();
    } catch (e: any) { setErr(e.message); }
  };

  const del = async (id: string) => { await api(`/portfolio/${id}`, { method: "DELETE" }); await load(); };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView style={{ backgroundColor: colors.surface }} contentContainerStyle={{ paddingBottom: spacing.xxxl + insets.bottom }} keyboardShouldPersistTaps="handled">
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl }}>
        <Pressable testID="port-back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/pro/studio"))} hitSlop={12} style={{ minHeight: 44, width: 44, justifyContent: "center" }} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={s.title}>Portfolio</Text>
        <Text style={s.sub}>{items.length}/{FREE_CAP} photos — free plan cap.</Text>

        <View style={s.form}>
          <Text style={s.label}>1. Pick a style</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginTop: spacing.sm }}>
            {styles_.map(st => (
              <Pressable key={st.id} testID={`portfolio-style-${st.id}`} onPress={() => setStyleId(st.id)} style={[s.chip, styleId === st.id && s.chipActive]}>
                <Text style={[s.chipText, styleId === st.id && { color: "#fff" }]}>{st.name}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={[s.label, { marginTop: spacing.md }]}>2. Add a photo</Text>
          <Pressable
            testID="portfolio-pick"
            onPress={addFromDevice}
            disabled={busy || atCap}
            style={[s.primaryBtn, (busy || atCap) && { opacity: 0.5 }]}
          >
            {busy ? <ActivityIndicator color="#fff" /> : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Feather name="upload-cloud" size={16} color="#fff" />
                <Text style={s.primaryText}>Choose from library</Text>
              </View>
            )}
          </Pressable>
          {uploadProgress !== null && (
            <View style={s.progressWrap}>
              <View style={[s.progressBar, { width: `${Math.round(uploadProgress * 100)}%` }]} />
              <Text style={s.progressText}>{Math.round(uploadProgress * 100)}%</Text>
            </View>
          )}

          <Text style={s.orRow}>— or paste a URL —</Text>
          <TextInput testID="portfolio-url" value={url} onChangeText={setUrl} placeholder="https://…" placeholderTextColor={colors.muted} style={s.input} autoCapitalize="none" />
          <Pressable testID="portfolio-add" onPress={addFromUrl} disabled={atCap} style={[s.ghostBtn, atCap && { opacity: 0.5 }]}>
            <Text style={s.ghostText}>Add from URL</Text>
          </Pressable>

          {err && <Text testID="port-err" style={{ color: colors.error, fontFamily: font.body, marginTop: spacing.sm }}>{err}</Text>}
          {atCap && <Text style={s.capMsg}>You&apos;ve reached your {FREE_CAP}-photo cap. Delete one to add another, or upgrade for more.</Text>}
        </View>

        <View style={s.grid}>
          {items.map(it => (
            <View key={it.id} style={s.item}>
              <Image
                source={{ uri: cldTransform(it.photo_url, { w: 400, h: 400, c: "fill" }) }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
              />
              <Pressable testID={`portfolio-del-${it.id}`} onPress={() => del(it.id)} style={s.delBtn}><Feather name="x" size={14} color="#fff" /></Pressable>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 34, color: colors.onSurface, marginTop: spacing.lg },
  sub: { fontFamily: font.body, color: colors.muted, marginBottom: spacing.lg },
  form: { padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radii.md, marginBottom: spacing.lg },
  label: { fontFamily: font.bodyBold, color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 1.5 },
  input: { borderBottomWidth: 1, borderColor: colors.borderStrong, paddingVertical: spacing.md, fontFamily: font.body, color: colors.onSurface, marginTop: spacing.xs },
  chip: { height: 34, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.borderStrong, justifyContent: "center" },
  chipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  chipText: { fontFamily: font.bodyMed, color: colors.onSurface, fontSize: 12 },
  primaryBtn: { marginTop: spacing.sm, backgroundColor: colors.brand, padding: spacing.md, borderRadius: radii.md, alignItems: "center" },
  primaryText: { color: "#fff", fontFamily: font.bodyBold },
  progressWrap: { marginTop: spacing.sm, height: 6, backgroundColor: colors.divider, borderRadius: 3, overflow: "hidden", position: "relative" },
  progressBar: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: colors.brand },
  progressText: { position: "absolute", right: 6, top: -18, fontFamily: font.bodyMed, fontSize: 10, color: colors.onSurfaceTertiary },
  orRow: { textAlign: "center", fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 12, marginTop: spacing.md, marginBottom: spacing.xs },
  ghostBtn: { marginTop: spacing.xs, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center" },
  ghostText: { color: colors.onSurface, fontFamily: font.bodyMed, fontSize: 13 },
  capMsg: { color: colors.onSurfaceTertiary, fontFamily: font.body, fontSize: 12, marginTop: spacing.sm, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: spacing.md },
  item: { width: "32.5%", aspectRatio: 1, position: "relative" },
  delBtn: { position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.6)", width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
