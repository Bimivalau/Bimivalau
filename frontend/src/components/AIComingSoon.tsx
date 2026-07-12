/**
 * Beautiful reusable AI "Coming Soon" screen with join-waitlist CTA.
 * Every AI module (Style Match, Recreate Look, Coach, Recommendations, etc.)
 * shares this shell. Real AI ships in a later pass.
 */
import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Alert, TextInput } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api, ApiError } from "@/src/api";
import { useSession } from "@/src/session";
import { colors, spacing, font, radii } from "@/src/theme";

export interface AIComingSoonProps {
  module: string;                // key sent to /ai/waitlist
  emoji: string;
  eyebrow: string;               // e.g. "AI STYLE MATCH"
  title: string;                 // e.g. "Find your perfect braid"
  description: string;           // longer paragraph explaining value
  bullets: string[];             // 3-6 lines describing what the AI will do
  gradient?: [string, string, string];
  requiresUnlimited?: boolean;   // shows upgrade hint if user is not unlimited
}

export function AIComingSoonScreen(p: AIComingSoonProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const [joined, setJoined] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api("/ai/waitlist/me");
      if ((d.modules || []).includes(p.module)) setJoined(true);
    } catch {}
  }, [p.module]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const join = async () => {
    setBusy(true);
    try {
      await api("/ai/waitlist", { method: "POST", body: JSON.stringify({ module: p.module, note }) });
      setJoined(true);
    } catch (e: any) {
      Alert.alert("Couldn't join", e instanceof ApiError ? e.userMessage : "Please try again.");
    } finally { setBusy(false); }
  };

  const gradient = p.gradient || ["#F5C77E", "#B78141", "#8B5A2B"];
  const isUnlimited = user?.plan === "unlimited";
  const upgradeHint = p.requiresUnlimited && !isUnlimited;

  return (
    <ScrollView style={{ backgroundColor: colors.surface }} contentContainerStyle={{ paddingBottom: spacing.xxxl + insets.bottom }}>
      <View style={[s.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable testID="ai-back" onPress={() => router.back()} hitSlop={10}>
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: spacing.xl }}>
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
          <View style={s.heroEmoji}><Text style={{ fontSize: 36 }}>{p.emoji}</Text></View>
          <Text style={s.eyebrow}>{p.eyebrow}</Text>
          <Text style={s.title}>{p.title}</Text>
          <Text style={s.desc}>{p.description}</Text>
          <View style={s.soonPill}><Text style={s.soonText}>COMING SOON</Text></View>
        </LinearGradient>

        <Text style={s.sectionTitle}>What it does</Text>
        <View style={{ gap: spacing.sm }}>
          {p.bullets.map((b, i) => (
            <View key={i} style={s.bullet}>
              <View style={s.dot} />
              <Text style={s.bulletText}>{b}</Text>
            </View>
          ))}
        </View>

        {upgradeHint && (
          <View style={s.upgradeCard}>
            <Feather name="lock" size={14} color={colors.brand} />
            <Text style={s.upgradeText}>Unlimited members get first access when this launches.</Text>
            <Pressable testID="ai-upgrade" onPress={() => router.push("/subscription")} hitSlop={6}>
              <Text style={s.upgradeLink}>See plans →</Text>
            </Pressable>
          </View>
        )}

        {joined ? (
          <View style={s.joinedCard}>
            <Feather name="check-circle" size={20} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={s.joinedTitle}>You're on the waitlist ✨</Text>
              <Text style={s.joinedDesc}>We'll notify you the moment {p.eyebrow.toLowerCase()} launches.</Text>
            </View>
          </View>
        ) : (
          <View style={{ marginTop: spacing.xxl }}>
            <Text style={s.sectionTitle}>Join the waitlist</Text>
            <TextInput
              testID="ai-note"
              value={note}
              onChangeText={setNote}
              placeholder="Tell us what you'd love this to do (optional)"
              placeholderTextColor={colors.muted}
              style={s.noteInput}
              multiline
            />
            <Pressable
              testID="ai-join"
              onPress={join}
              disabled={busy}
              style={[s.joinBtn, busy && { opacity: 0.5 }]}
            >
              <Text style={s.joinText}>{busy ? "Joining…" : "Notify me when it's ready"}</Text>
            </Pressable>
            <Text style={s.privacy}>We'll only email you about this feature.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  hero: { padding: spacing.xl, borderRadius: 28, marginTop: spacing.md, alignItems: "center" },
  heroEmoji: { width: 76, height: 76, borderRadius: 38, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  eyebrow: { color: "rgba(255,255,255,0.85)", fontFamily: font.bodyBold, fontSize: 10, letterSpacing: 2.5 },
  title: { color: "#fff", fontFamily: font.display, fontSize: 30, lineHeight: 34, marginTop: 6, textAlign: "center" },
  desc: { color: "rgba(255,255,255,0.9)", fontFamily: font.body, fontSize: 13, lineHeight: 19, marginTop: spacing.md, textAlign: "center" },
  soonPill: { marginTop: spacing.md, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: "rgba(255,255,255,0.25)" },
  soonText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 10, letterSpacing: 1.5 },

  sectionTitle: { fontFamily: font.display, fontSize: 20, color: colors.onSurface, marginTop: spacing.xxl, marginBottom: spacing.md },
  bullet: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surfaceSecondary },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand, marginTop: 8 },
  bulletText: { flex: 1, fontFamily: font.body, fontSize: 13, color: colors.onSurfaceSecondary, lineHeight: 18 },

  upgradeCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.brandTertiary, marginTop: spacing.lg },
  upgradeText: { flex: 1, fontFamily: font.bodyMed, fontSize: 12, color: colors.onBrandTertiary },
  upgradeLink: { fontFamily: font.bodyBold, fontSize: 13, color: colors.brand },

  noteInput: { minHeight: 80, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, fontFamily: font.body, fontSize: 14, color: colors.onSurface, textAlignVertical: "top" },
  joinBtn: { marginTop: spacing.md, backgroundColor: colors.brand, padding: spacing.md, borderRadius: radii.md, alignItems: "center" },
  joinText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 14 },
  privacy: { fontFamily: font.body, fontSize: 10, color: colors.muted, textAlign: "center", marginTop: spacing.sm },

  joinedCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderRadius: radii.lg, backgroundColor: "#EFFDF5", borderWidth: 1, borderColor: "#B7E4C7", marginTop: spacing.xxl },
  joinedTitle: { fontFamily: font.bodyBold, fontSize: 14, color: "#207449" },
  joinedDesc: { fontFamily: font.body, fontSize: 12, color: "#38875D", marginTop: 3, lineHeight: 17 },
});
