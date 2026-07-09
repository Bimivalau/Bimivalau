import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput, Alert } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, font, radii } from "@/src/theme";

export default function ProPortfolio() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<any[]>([]);
  const [styles_, setStyles] = useState<any[]>([]);
  const [url, setUrl] = useState("");
  const [styleId, setStyleId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => api("/portfolio/me").then(setItems);
  useEffect(() => { load(); api("/hairstyles").then(setStyles); }, []);

  const add = async () => {
    setErr(null);
    if (!url || !styleId) { setErr("Photo URL and style required"); return; }
    try {
      await api("/portfolio", { method: "POST", body: JSON.stringify({ photo_url: url, hairstyle_id: styleId, caption: "" }) });
      setUrl(""); await load();
    } catch (e: any) { setErr(e.message); }
  };
  const del = async (id: string) => { await api(`/portfolio/${id}`, { method: "DELETE" }); await load(); };

  return (
    <ScrollView style={{ backgroundColor: colors.surface }} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl }}>
        <Pressable testID="port-back" onPress={() => router.back()}><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.title}>Portfolio</Text>
        <Text style={s.sub}>{items.length} photos — Standard capped at 10.</Text>

        <View style={s.form}>
          <TextInput testID="portfolio-url" value={url} onChangeText={setUrl} placeholder="Paste photo URL…" placeholderTextColor={colors.muted} style={s.input} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginTop: spacing.sm }}>
            {styles_.map(st => (
              <Pressable key={st.id} testID={`portfolio-style-${st.id}`} onPress={() => setStyleId(st.id)} style={[s.chip, styleId === st.id && s.chipActive]}>
                <Text style={[s.chipText, styleId === st.id && { color: "#fff" }]}>{st.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {err && <Text testID="port-err" style={{ color: colors.error, fontFamily: font.body, marginTop: spacing.sm }}>{err}</Text>}
          <Pressable testID="portfolio-add" onPress={add} style={s.addBtn}><Text style={s.addText}>Add photo</Text></Pressable>
        </View>

        <View style={s.grid}>
          {items.map(it => (
            <View key={it.id} style={s.item}>
              <Image source={{ uri: it.photo_url }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
              <Pressable testID={`portfolio-del-${it.id}`} onPress={() => del(it.id)} style={s.delBtn}><Feather name="x" size={14} color="#fff" /></Pressable>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 34, color: colors.onSurface, marginTop: spacing.lg },
  sub: { fontFamily: font.body, color: colors.muted, marginBottom: spacing.lg },
  form: { padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radii.md, marginBottom: spacing.lg },
  input: { borderBottomWidth: 1, borderColor: colors.borderStrong, paddingVertical: spacing.md, fontFamily: font.body, color: colors.onSurface },
  chip: { height: 34, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.borderStrong, justifyContent: "center" },
  chipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  chipText: { fontFamily: font.bodyMed, color: colors.onSurface, fontSize: 12 },
  addBtn: { marginTop: spacing.md, backgroundColor: colors.brand, padding: spacing.md, borderRadius: radii.md, alignItems: "center" },
  addText: { color: "#fff", fontFamily: font.bodyBold },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: spacing.md },
  item: { width: "32.5%", aspectRatio: 1, position: "relative" },
  delBtn: { position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.6)", width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
