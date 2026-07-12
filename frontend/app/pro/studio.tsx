import { useCallback, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Animated } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useSession } from "@/src/session";
import { colors, font, radii, spacing } from "@/src/theme";
import {
  SafeScrollView,
  ResponsiveHeading,
  Card,
  Badge,
  SectionTitle,
  LoadingState,
  ErrorState,
} from "@/src/ui";

type SectionKey = "availability" | "services" | "portfolio" | "info" | "verification";

type Section = {
  key: SectionKey;
  label: string;
  sub: string;
  complete: boolean;
  required?: boolean;
  count?: number;
  state?: string;
};

type Status = {
  onboarding_completed: boolean;
  sections: Section[];
  first_incomplete: SectionKey | null;
  progress: { done: number; total: number; percent: number };
};

const ROUTES: Record<SectionKey, string> = {
  availability: "/pro/availability",
  services: "/pro/services",
  portfolio: "/pro/portfolio",
  info: "/pro/studio-info",
  verification: "/pro/verification",
};

const ICONS: Record<SectionKey, any> = {
  availability: "clock",
  services: "tag",
  portfolio: "image",
  info: "info",
  verification: "shield",
};

export default function MyStudio() {
  const router = useRouter();
  const { user, signOut } = useSession();
  const params = useLocalSearchParams<{ focus?: string }>();
  const [status, setStatus] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Record<string, number>>({});
  const highlightAnim = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    try {
      setErr(null);
      const s = await api("/hairdressers/me/studio-status");
      setStatus(s);
    } catch (e: any) {
      setErr(e?.userMessage || e?.message || "Could not load your Studio.");
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // After first load, if a `focus` param was supplied OR there's a first
  // incomplete section, scroll to that section and pulse a highlight.
  const focusTarget = (params.focus as SectionKey) || status?.first_incomplete;
  const focusedOnce = useRef(false);
  const maybeFocus = useCallback(() => {
    if (!status || focusedOnce.current) return;
    const target = (params.focus as SectionKey) || status.first_incomplete;
    if (!target) return;
    focusedOnce.current = true;
    setTimeout(() => {
      const y = sectionOffsets.current[target];
      if (y != null) {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
        Animated.sequence([
          Animated.timing(highlightAnim, { toValue: 1, duration: 250, useNativeDriver: false }),
          Animated.delay(900),
          Animated.timing(highlightAnim, { toValue: 0, duration: 500, useNativeDriver: false }),
        ]).start();
      }
    }, 250);
  }, [status, params.focus, highlightAnim]);

  if (err && !status) return <ErrorState message={err} onRetry={load} />;
  if (!status) return <LoadingState label="Loading your Studio…" />;

  const percent = status.progress.percent;

  return (
    <SafeScrollView
      ref={scrollRef as any}
      background={colors.surface}
      onLayout={maybeFocus}
      onContentSizeChange={maybeFocus}
    >
      <View style={{ paddingTop: spacing.md }}>
        <Text style={s.eyebrow}>MY STUDIO</Text>
        <ResponsiveHeading size={30} style={{ marginTop: spacing.xs }}>
          {user?.name?.split(" ")[0] || "Your"}&apos;s Studio
        </ResponsiveHeading>
        <Text style={s.sub}>The permanent home to manage and grow your business.</Text>

        {/* Progress card */}
        <Card variant="tinted" padding={spacing.lg} style={{ marginTop: spacing.lg }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, flexWrap: "wrap" }}>
            <View style={{ flexShrink: 1 }}>
              <Text style={s.progressLabel}>Studio setup</Text>
              <Text style={s.progressValue}>{status.progress.done} of {status.progress.total} complete</Text>
            </View>
            <Badge label={`${percent}%`} tone="brand" variant="solid" size="md" />
          </View>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${percent}%` }]} />
          </View>
          {status.first_incomplete ? (
            <Text style={s.progressHint}>
              Next up:{" "}
              <Text style={{ fontFamily: font.bodyBold, color: colors.brand }}>
                {status.sections.find(x => x.key === status.first_incomplete)?.label}
              </Text>
            </Text>
          ) : (
            <Text style={s.progressHint}>Everything looks great. You&apos;re fully set up.</Text>
          )}
        </Card>

        <SectionTitle title="Manage your Studio" />

        {status.sections.map((sec) => {
          const isFocus = focusTarget === sec.key;
          const highlightBg = highlightAnim.interpolate({ inputRange: [0, 1], outputRange: [colors.surface, colors.brandTertiary] });
          const highlightBorder = highlightAnim.interpolate({ inputRange: [0, 1], outputRange: [colors.border, colors.brand] });
          return (
            <Pressable
              key={sec.key}
              testID={`studio-${sec.key}`}
              onPress={() => router.push(ROUTES[sec.key] as any)}
              onLayout={(e) => { sectionOffsets.current[sec.key] = e.nativeEvent.layout.y; }}
              style={{ marginBottom: spacing.sm }}
              android_ripple={{ color: "rgba(0,0,0,0.04)" }}
            >
              <Animated.View
                style={[
                  s.row,
                  { backgroundColor: isFocus ? highlightBg : colors.surface, borderColor: isFocus ? highlightBorder : colors.border },
                ]}
              >
                <View style={[s.icon, sec.complete && { backgroundColor: colors.brandTertiary }]}>
                  {sec.complete
                    ? <Feather name="check" size={16} color={colors.brand} />
                    : <Feather name={ICONS[sec.key]} size={16} color={colors.brand} />}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm, rowGap: 4 }}>
                    <Text style={s.rowTitle} numberOfLines={2}>{sec.label}</Text>
                    {sec.required && !sec.complete ? <Badge label="REQUIRED" tone="warning" /> : null}
                    {sec.complete ? <Badge label="DONE" tone="success" /> : null}
                    {sec.count != null && sec.count > 0 && !sec.complete ? <Badge label={`${sec.count}`} tone="neutral" /> : null}
                  </View>
                  <Text style={s.rowSub} numberOfLines={2}>{sec.sub}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.muted} />
              </Animated.View>
            </Pressable>
          );
        })}

        {/* Business Health & Braider DNA — read-only cards that deep-link to Growth */}
        <SectionTitle title="Business insights" action="See all →" onActionPress={() => router.push("/pro/growth")} />
        <Pressable testID="studio-success-score" onPress={() => router.push("/pro/growth")}>
          <Card variant="tinted" padding={spacing.lg}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <View style={s.insightIcon}><Feather name="activity" size={16} color={colors.brand} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.rowTitle}>Business Success Score</Text>
                <Text style={s.rowSub} numberOfLines={2}>Your 0–100 signal that decides how often you appear to customers.</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.muted} />
            </View>
          </Card>
        </Pressable>
        <View style={{ height: spacing.sm }} />
        <Pressable testID="studio-braider-dna" onPress={() => router.push("/pro/growth")}>
          <Card variant="tinted" padding={spacing.lg}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <View style={s.insightIcon}><Feather name="award" size={16} color={colors.brand} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.rowTitle}>Braider DNA</Text>
                <Text style={s.rowSub} numberOfLines={2}>Your expertise scores across each style — higher scores boost ranking.</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.muted} />
            </View>
          </Card>
        </Pressable>

        {/* Account footer */}
        <SectionTitle title="Account" />
        <Pressable testID="studio-subscription" onPress={() => router.push("/subscription")}>
          <Card padding={spacing.lg} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <View style={s.insightIcon}><Feather name="star" size={16} color={colors.brand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>Subscription</Text>
              <Text style={s.rowSub}>{(user?.plan || "free").toUpperCase()}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.muted} />
          </Card>
        </Pressable>
        <View style={{ height: spacing.sm }} />
        <Pressable
          testID="studio-signout"
          onPress={async () => { await signOut(); router.replace("/welcome"); }}
        >
          <Card padding={spacing.lg} variant="outline" style={{ alignItems: "center" }}>
            <Text style={{ color: colors.error, fontFamily: font.bodyBold, fontSize: 14 }}>Sign out</Text>
          </Card>
        </Pressable>
      </View>
    </SafeScrollView>
  );
}

const s = StyleSheet.create({
  eyebrow: { color: colors.brand, letterSpacing: 3, fontSize: 10, fontFamily: font.bodyMed },
  sub: { color: colors.onSurfaceTertiary, fontFamily: font.body, fontSize: 13, marginTop: spacing.sm, lineHeight: 18 },
  progressLabel: { color: colors.onSurfaceTertiary, fontFamily: font.bodyMed, fontSize: 11, letterSpacing: 1.5 },
  progressValue: { color: colors.onSurface, fontFamily: font.bodyBold, fontSize: 16, marginTop: 2 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.divider, marginTop: spacing.md, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: colors.brand },
  progressHint: { color: colors.onSurfaceTertiary, fontFamily: font.body, fontSize: 12, marginTop: spacing.md },
  row: { flexDirection: "row", gap: spacing.md, alignItems: "center", padding: spacing.md, borderWidth: 1, borderRadius: radii.md, minHeight: 64 },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontFamily: font.bodyBold, color: colors.onSurface, fontSize: 14, flexShrink: 1 },
  rowSub: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2, lineHeight: 16 },
  insightIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
});
