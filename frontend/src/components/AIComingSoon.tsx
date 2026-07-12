/**
 * Beautiful reusable AI "Coming Soon" screen with join-waitlist CTA.
 * Every AI module (Style Match, Recreate Look, Coach, Recommendations, etc.)
 * shares this shell. Real AI ships in a later pass.
 *
 * Uses the responsive UI kit so it looks correct on 320–430px devices,
 * respects safe-area top/bottom, and avoids keyboard overlap on the
 * "Tell us what you'd love this to do" note field.
 */
import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, TextInput, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api, ApiError } from "@/src/api";
import { useSession } from "@/src/session";
import { useEntitlements } from "@/src/entitlements";
import { PaywallSheet } from "@/src/components/PaywallSheet";
import { colors, spacing, font, radii } from "@/src/theme";
import { SafeScrollView, ResponsiveHeading, Card, Badge, useResponsive } from "@/src/ui";

export interface AIComingSoonProps {
  module: string;                // key sent to /ai/waitlist
  emoji: string;
  eyebrow: string;               // e.g. "AI STYLE MATCH"
  title: string;                 // e.g. "Find your perfect braid"
  description: string;           // longer paragraph explaining value
  bullets: string[];             // 3-6 lines describing what the AI will do
  gradient?: [string, string, string];
  requiresUnlimited?: boolean;
  audience?: "customer" | "braider";
  featureKey?: string;           // e.g. "customer.ai.style_match"
}

export function AIComingSoonScreen(p: AIComingSoonProps) {
  const router = useRouter();
  const { user } = useSession();
  const { has, snapshot } = useEntitlements();
  const { scaleFont } = useResponsive();
  const [joined, setJoined] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const audience = p.audience || (p.eyebrow.toLowerCase().includes("business") || p.eyebrow.toLowerCase().includes("braider") ? "braider" : "customer");
  const featureKey = p.featureKey || (audience === "customer" ? `customer.ai.${p.module}` : `braider.ai.${p.module}`);
  const isEntitled = has(featureKey);
  const launchMode = !!snapshot?.launch_mode && audience === "customer";
  const targetPlan: any = audience === "customer" ? "customer_unlimited" : "braider_unlimited";

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
  const showUpgradeHint = !isEntitled && !launchMode;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <SafeScrollView>
        <View style={s.headerRow}>
          <Pressable
            testID="ai-back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            hitSlop={12}
            style={s.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Feather name="arrow-left" size={22} color={colors.onSurface} />
          </Pressable>
        </View>

        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
          <View style={s.heroEmoji}><Text style={{ fontSize: scaleFont(34), lineHeight: scaleFont(40) }}>{p.emoji}</Text></View>
          <Text style={s.eyebrow}>{p.eyebrow}</Text>
          <ResponsiveHeading size={28} color="#fff" style={{ textAlign: "center", marginTop: 6 }}>{p.title}</ResponsiveHeading>
          <Text style={s.desc}>{p.description}</Text>
          <Badge label="COMING SOON" tone="brand" variant="solid" style={{ marginTop: spacing.md, backgroundColor: "rgba(255,255,255,0.25)" }} />
        </LinearGradient>

        <Text style={s.sectionTitle}>What it does</Text>
        <View style={{ gap: spacing.sm }}>
          {p.bullets.map((b, i) => (
            <Card key={i} variant="tinted" padding={spacing.md}>
              <View style={s.bullet}>
                <View style={s.dot} />
                <Text style={s.bulletText}>{b}</Text>
              </View>
            </Card>
          ))}
        </View>

        {showUpgradeHint && (
          <Pressable testID="ai-upgrade" onPress={() => setPaywallOpen(true)} style={{ marginTop: spacing.lg }}>
            <Card variant="outline" padding={spacing.md} style={{ borderColor: colors.brand, backgroundColor: colors.brandTertiary }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" }}>
                <Feather name="lock" size={14} color={colors.brand} />
                <Text style={s.upgradeText}>{audience === "customer" ? "Unlimited members get first access when this launches." : "Braider Unlimited members get first access when this launches."}</Text>
                <Text style={s.upgradeLink}>See plans →</Text>
              </View>
            </Card>
          </Pressable>
        )}
        {launchMode && (
          <View style={{ marginTop: spacing.lg }}>
            <Card variant="outline" padding={spacing.md} style={{ borderColor: colors.success, backgroundColor: "#EFFDF5" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Feather name="gift" size={14} color={colors.success} />
                <Text style={{ flex: 1, fontFamily: font.bodyMed, fontSize: 12, color: "#207449" }}>Included free during BraidsCommunity&apos;s launch — you&apos;ll be first to try it.</Text>
              </View>
            </Card>
          </View>
        )}

        {joined ? (
          <Card style={s.joinedCard} padding={spacing.lg}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <Feather name="check-circle" size={20} color={colors.success} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.joinedTitle}>You&apos;re on the waitlist ✨</Text>
                <Text style={s.joinedDesc} numberOfLines={3}>We&apos;ll notify you the moment {p.eyebrow.toLowerCase()} launches.</Text>
              </View>
            </View>
          </Card>
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
              accessibilityLabel="Optional note about what you want this AI to do"
              maxLength={280}
            />
            <Pressable
              testID="ai-join"
              onPress={join}
              disabled={busy}
              style={[s.joinBtn, busy && { opacity: 0.5 }]}
              accessibilityRole="button"
              accessibilityLabel="Notify me when this feature launches"
            >
              <Text style={s.joinText}>{busy ? "Joining…" : "Notify me when it's ready"}</Text>
            </Pressable>
            <Text style={s.privacy}>We&apos;ll only email you about this feature.</Text>
          </View>
        )}
      </SafeScrollView>
      <PaywallSheet
        visible={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        ctx={{
          targetPlan,
          eyebrow: p.eyebrow,
          title: audience === "customer" ? "Unlock BraidsCommunity Unlimited" : "Unlock Braider Unlimited",
          value: p.description,
        }}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  headerRow: { paddingBottom: spacing.md, minHeight: 44, justifyContent: "center" },
  backBtn: { minHeight: 44, width: 44, alignItems: "flex-start", justifyContent: "center" },
  hero: { padding: spacing.xl, borderRadius: 28, alignItems: "center" },
  heroEmoji: { width: 76, height: 76, borderRadius: 38, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  eyebrow: { color: "rgba(255,255,255,0.85)", fontFamily: font.bodyBold, fontSize: 10, letterSpacing: 2.5 },
  desc: { color: "rgba(255,255,255,0.9)", fontFamily: font.body, fontSize: 13, lineHeight: 19, marginTop: spacing.md, textAlign: "center", flexShrink: 1 },
  sectionTitle: { fontFamily: font.display, fontSize: 20, color: colors.onSurface, marginTop: spacing.xxl, marginBottom: spacing.md, flexShrink: 1 },
  bullet: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, flexShrink: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand, marginTop: 8 },
  bulletText: { flex: 1, fontFamily: font.body, fontSize: 13, color: colors.onSurfaceSecondary, lineHeight: 18, flexShrink: 1 },
  upgradeText: { flex: 1, fontFamily: font.bodyMed, fontSize: 12, color: colors.onSurfaceSecondary, minWidth: 180, flexShrink: 1 },
  upgradeLink: { fontFamily: font.bodyBold, fontSize: 13, color: colors.brand },
  noteInput: { minHeight: 96, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, fontFamily: font.body, fontSize: 14, color: colors.onSurface, textAlignVertical: "top" },
  joinBtn: { marginTop: spacing.md, backgroundColor: colors.brand, minHeight: 52, borderRadius: radii.md, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
  joinText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 14 },
  privacy: { fontFamily: font.body, fontSize: 10, color: colors.muted, textAlign: "center", marginTop: spacing.sm },
  joinedCard: { marginTop: spacing.xxl, backgroundColor: "#EFFDF5", borderWidth: 1, borderColor: "#B7E4C7" },
  joinedTitle: { fontFamily: font.bodyBold, fontSize: 14, color: "#207449" },
  joinedDesc: { fontFamily: font.body, fontSize: 12, color: "#38875D", marginTop: 3, lineHeight: 17 },
});
