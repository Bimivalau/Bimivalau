/**
 * Braider Business Growth screen — the "AI-powered growth partner" surface.
 * Contains:
 *   - Business Success Score card (score, tier, breakdown, recommendations)
 *   - Profile analytics (Standard+)
 *   - Trending report (Standard+)
 *   - Weekly business report (Standard+)
 *   - Coming-soon cards for AI Business Assistant, Marketing tools, Revenue analytics (Unlimited)
 */
import { useCallback, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api, ApiError } from "@/src/api";
import { useSession } from "@/src/session";
import { colors, spacing, font, radii } from "@/src/theme";

interface Score { score: number; tier: string; breakdown: any; recommendations: string[]; }
interface Analytics { views_30d: number; views_7d: number; total_bookings: number; completed_30d: number; cancelled_30d: number; }
interface WeeklyReport { bookings_this_week: number; bookings_growth_pct: number | null; profile_views_this_week: number; views_growth_pct: number | null; }
interface HealthMetric { score: number; label: string; tip: string; }
interface Health { metrics: Record<string, HealthMetric>; unique_customers: number; repeat_customers: number; }
interface DNARow { category: string; score: number; label: string; portfolio_count: number; }

const TIER_COLORS: Record<string, [string, string]> = {
  Elite: ["#F5C77E", "#8B5A2B"],
  Excellent: ["#B7D6BD", "#4B7355"],
  Growing: ["#F2C58C", "#B65942"],
  Building: ["#DAD3C4", "#8A8378"],
};

export default function BusinessGrowth() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const [score, setScore] = useState<Score | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [trending, setTrending] = useState<any>(null);
  const [weekly, setWeekly] = useState<WeeklyReport | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [dna, setDna] = useState<DNARow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [sc, a, t, w, h, d] = await Promise.all([
        api("/braiders/me/business-score"),
        api("/braiders/me/analytics").catch((e: any) => (e instanceof ApiError && e.status === 402 ? null : Promise.reject(e))),
        api("/braiders/me/trending-report").catch((e: any) => (e instanceof ApiError && e.status === 402 ? null : Promise.reject(e))),
        api("/braiders/me/weekly-report").catch((e: any) => (e instanceof ApiError && e.status === 402 ? null : Promise.reject(e))),
        api("/braiders/me/business-health").catch(() => null),
        api("/braiders/me/dna").catch(() => []),
      ]);
      setScore(sc); setAnalytics(a); setTrending(t); setWeekly(w); setHealth(h); setDna(d);
    } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const plan = user?.plan || "free";
  const isPaid = plan !== "free";
  const isUnlimited = plan === "unlimited";

  if (loading || !score) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}><ActivityIndicator color={colors.brand} /></View>;
  }

  const [c1, c2] = TIER_COLORS[score.tier] || TIER_COLORS.Building;

  return (
    <ScrollView style={{ backgroundColor: colors.surface }} contentContainerStyle={{ paddingBottom: spacing.xxxl + insets.bottom }}>
      <View style={[s.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable testID="bg-back" onPress={() => router.back()} hitSlop={10}>
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={s.headerTitle}>Business Growth</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={{ paddingHorizontal: spacing.xl }}>
        {/* ---- Business Success Score ---- */}
        <LinearGradient colors={[c1, c2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.scoreCard}>
          <Text style={s.scoreLabel}>BUSINESS SUCCESS SCORE</Text>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing.md, marginTop: spacing.sm }}>
            <Text testID="bg-score" style={s.scoreValue}>{score.score}</Text>
            <Text style={s.scoreOut}>/100</Text>
            <View style={{ flex: 1 }} />
            <View style={s.tierPill}><Text style={s.tierText}>{score.tier}</Text></View>
          </View>
          <Text style={s.scoreDesc}>A proprietary BraidsCommunity signal. The higher your score, the more customers see you.</Text>
        </LinearGradient>

        {/* Breakdown */}
        <Text style={s.section}>Score breakdown</Text>
        <View style={s.breakdownGrid}>
          {Object.entries(score.breakdown).map(([k, v]: any) => (
            <BreakdownBar key={k} label={k.replace(/_/g, " ")} value={v.score} max={v.max} />
          ))}
        </View>

        {/* Recommendations */}
        {score.recommendations.length > 0 && (
          <>
            <Text style={s.section}>How to grow your score</Text>
            <View style={{ gap: spacing.sm }}>
              {score.recommendations.map((r, i) => (
                <View key={i} style={s.recRow}>
                  <View style={s.recIcon}><Feather name="trending-up" size={13} color={colors.brand} /></View>
                  <Text style={s.recText}>{r}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ---- Business Health ---- */}
        {health && (
          <>
            <Text style={s.section}>Business Health</Text>
            <Text style={{ fontFamily: font.body, fontSize: 12, color: colors.onSurfaceTertiary, marginTop: -8, marginBottom: spacing.md }}>
              6 signals that decide whether customers pick you. Improve any one to lift your Business Success Score.
            </Text>
            <View style={{ gap: spacing.sm }}>
              {Object.entries(health.metrics).map(([k, m]) => (
                <View key={k} style={s.healthCard}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={s.healthLabel}>{m.label}</Text>
                    <Text style={[s.healthScore, { color: m.score >= 80 ? colors.success : m.score >= 40 ? colors.brand : colors.warning }]}>{m.score}</Text>
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.divider, marginTop: 6, overflow: "hidden" }}>
                    <View style={{ height: 6, width: `${m.score}%`, backgroundColor: m.score >= 80 ? colors.success : m.score >= 40 ? colors.brand : colors.warning }} />
                  </View>
                  <Text style={s.healthTip}>💡 {m.tip}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ---- Braider DNA ---- */}
        {dna.length > 0 && (
          <>
            <Text style={s.section}>Your Braider DNA</Text>
            <Text style={{ fontFamily: font.body, fontSize: 12, color: colors.onSurfaceTertiary, marginTop: -8, marginBottom: spacing.md }}>
              Your expertise across styles. Higher scores = better ranking for those categories.
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {dna.map((row) => (
                <View key={row.category} style={s.dnaBadge}>
                  <Text style={s.dnaLabel}>{row.label}</Text>
                  <Text style={s.dnaScore}>{row.score}<Text style={{ opacity: 0.5, fontSize: 10 }}>/100</Text></Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Analytics (Standard+) */}
        <View style={s.divider} />
        {isPaid ? (
          <>
            <Text style={s.section}>Profile analytics · last 30 days</Text>
            <View style={s.statGrid}>
              <Stat label="Profile views" value={analytics?.views_30d ?? 0} sub={`+${analytics?.views_7d ?? 0} last 7 days`} />
              <Stat label="Bookings completed" value={analytics?.completed_30d ?? 0} sub={`${analytics?.total_bookings ?? 0} total lifetime`} />
              <Stat label="Cancelled" value={analytics?.cancelled_30d ?? 0} sub="Aim to keep this low" />
              <Stat label="Portfolio saves" value={analytics?.portfolio_saves ?? 0} sub="Coming soon" comingSoon />
            </View>

            {weekly && (
              <>
                <Text style={s.section}>This week</Text>
                <View style={s.weeklyRow}>
                  <WeeklyCard label="New bookings" value={weekly.bookings_this_week} growth={weekly.bookings_growth_pct} />
                  <WeeklyCard label="Profile views" value={weekly.profile_views_this_week} growth={weekly.views_growth_pct} />
                </View>
              </>
            )}

            {trending?.top?.length > 0 && (
              <>
                <Text style={s.section}>Trending in your categories</Text>
                <View style={{ gap: spacing.sm }}>
                  {trending.top.map((t: any, i: number) => (
                    <View key={t.id} style={s.trendRow}>
                      <Text style={s.trendRank}>{i + 1}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={s.trendName}>{t.name}</Text>
                        <Text style={s.trendMeta}>{t.category} · Style Score {Math.round(t.style_score)}</Text>
                      </View>
                      <Feather name="trending-up" size={14} color={colors.success} />
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        ) : (
          <LockedCard
            title="Analytics · locked"
            desc="Upgrade to Standard to unlock profile analytics, weekly reports and the trending hairstyle report."
            cta="See plans" onPress={() => router.push("/subscription")}
          />
        )}

        {/* Unlimited perks */}
        <View style={s.divider} />
        <Text style={s.section}>{isUnlimited ? "Your AI growth tools" : "Unlimited plan — coming soon"}</Text>
        <View style={{ gap: spacing.md }}>
          <ComingSoonCard emoji="🤖" title="AI Business Assistant" desc="Ask questions about your business — pricing, availability, growth ideas." locked={!isUnlimited} />
          <ComingSoonCard emoji="📈" title="Revenue analytics" desc="Track earnings, top-earning styles, seasonal peaks." locked={!isUnlimited} />
          <ComingSoonCard emoji="🎯" title="Marketing tools & campaigns" desc="Seasonal campaign templates, promo codes, birthday DMs." locked={!isUnlimited} />
          <ComingSoonCard emoji="💌" title="Customer retention" desc="See who's booked twice, who's about to churn, who to win back." locked={!isUnlimited} />
          <ComingSoonCard emoji="🔔" title="Automatic reminders" desc="Reduce no-shows with automated 24-hour and check-in reminders." locked={!isUnlimited} />
          <ComingSoonCard emoji="🛍" title="Website · online store · inventory" desc="Sell hair, care products and giftcards from your own storefront." locked={!isUnlimited} />
        </View>

        {!isUnlimited && (
          <Pressable testID="bg-upgrade" onPress={() => router.push("/subscription")} style={s.upgradeBtn}>
            <Text style={s.upgradeText}>Invest in Unlimited →</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}


function BreakdownBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: font.bodyMed, fontSize: 12, color: colors.onSurfaceSecondary, textTransform: "capitalize" }}>{label}</Text>
        <Text style={{ fontFamily: font.bodyBold, fontSize: 12, color: colors.onSurfaceTertiary }}>{value}/{max}</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.divider, marginTop: 4, overflow: "hidden" }}>
        <View style={{ height: 6, width: `${pct}%`, backgroundColor: pct > 80 ? colors.success : pct > 40 ? colors.brand : colors.warning }} />
      </View>
    </View>
  );
}


function Stat({ label, value, sub, comingSoon }: { label: string; value: number; sub?: string; comingSoon?: boolean }) {
  return (
    <View style={s.statCard}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{comingSoon ? "—" : value.toLocaleString()}</Text>
      {sub && <Text style={s.statSub}>{sub}</Text>}
    </View>
  );
}


function WeeklyCard({ label, value, growth }: { label: string; value: number; growth: number | null }) {
  const up = growth != null && growth >= 0;
  return (
    <View style={s.weeklyCard}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
      {growth != null && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
          <Feather name={up ? "arrow-up-right" : "arrow-down-right"} size={12} color={up ? colors.success : colors.error} />
          <Text style={{ fontFamily: font.bodyMed, fontSize: 11, color: up ? colors.success : colors.error }}>{Math.abs(growth)}% vs last week</Text>
        </View>
      )}
    </View>
  );
}


function LockedCard({ title, desc, cta, onPress }: any) {
  return (
    <View style={s.lockedCard}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Feather name="lock" size={14} color={colors.brand} />
        <Text style={s.lockedTitle}>{title}</Text>
      </View>
      <Text style={s.lockedDesc}>{desc}</Text>
      <Pressable testID="locked-cta" onPress={onPress} style={s.lockedBtn}>
        <Text style={s.lockedBtnText}>{cta}</Text>
      </Pressable>
    </View>
  );
}


function ComingSoonCard({ emoji, title, desc, locked }: any) {
  return (
    <View style={[s.comingCard, locked && { opacity: 0.7 }]}>
      <Text style={{ fontSize: 22 }}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Text style={s.comingTitle}>{title}</Text>
          {locked ? <Feather name="lock" size={11} color={colors.muted} /> : null}
          <Text style={s.comingBadge}>SOON</Text>
        </View>
        <Text style={s.comingDesc}>{desc}</Text>
      </View>
    </View>
  );
}


const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  headerTitle: { fontFamily: font.bodyBold, fontSize: 16, color: colors.onSurface },

  scoreCard: { padding: spacing.xl, borderRadius: 24, marginTop: spacing.md },
  scoreLabel: { color: "rgba(255,255,255,0.8)", fontFamily: font.bodyBold, fontSize: 10, letterSpacing: 2 },
  scoreValue: { color: "#fff", fontFamily: font.display, fontSize: 56, lineHeight: 60 },
  scoreOut: { color: "rgba(255,255,255,0.85)", fontFamily: font.body, fontSize: 16, marginBottom: 8 },
  tierPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: "rgba(255,255,255,0.2)" },
  tierText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 11, letterSpacing: 1.5 },
  scoreDesc: { color: "rgba(255,255,255,0.9)", fontFamily: font.body, fontSize: 12, marginTop: spacing.md, lineHeight: 17 },

  section: { fontFamily: font.display, fontSize: 20, color: colors.onSurface, marginTop: spacing.xxl, marginBottom: spacing.md },
  breakdownGrid: {},

  recRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surfaceSecondary },
  recIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  recText: { flex: 1, fontFamily: font.body, fontSize: 13, color: colors.onSurfaceSecondary, lineHeight: 18 },

  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.xxl },

  statGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  statCard: { width: "48%", padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surfaceSecondary, marginBottom: spacing.md },
  statLabel: { fontFamily: font.bodyMed, fontSize: 10, color: colors.onSurfaceTertiary, letterSpacing: 1 },
  statValue: { fontFamily: font.display, fontSize: 28, color: colors.onSurface, marginTop: 4 },
  statSub: { fontFamily: font.body, fontSize: 11, color: colors.onSurfaceTertiary, marginTop: 2 },

  weeklyRow: { flexDirection: "row", gap: spacing.md },
  weeklyCard: { flex: 1, padding: spacing.md, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff" },

  trendRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surfaceSecondary },
  trendRank: { fontFamily: font.display, fontSize: 22, color: colors.brand, width: 26 },
  trendName: { fontFamily: font.bodyBold, fontSize: 14, color: colors.onSurface },
  trendMeta: { fontFamily: font.body, fontSize: 11, color: colors.onSurfaceTertiary, marginTop: 2 },

  lockedCard: { padding: spacing.lg, borderRadius: radii.lg, backgroundColor: "#FAF6EF", borderWidth: 1, borderColor: "#EBDEC5" },
  lockedTitle: { fontFamily: font.bodyBold, fontSize: 14, color: colors.brand, letterSpacing: 0.3 },
  lockedDesc: { fontFamily: font.body, fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 6, lineHeight: 17 },
  lockedBtn: { marginTop: spacing.md, height: 40, borderRadius: 20, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  lockedBtnText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 13 },

  comingCard: { flexDirection: "row", gap: spacing.md, padding: spacing.md, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff", alignItems: "center" },
  comingTitle: { fontFamily: font.bodyBold, fontSize: 14, color: colors.onSurface },
  comingBadge: { fontFamily: font.bodyBold, fontSize: 8, color: colors.brand, backgroundColor: colors.brandTertiary, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, letterSpacing: 1 },
  comingDesc: { fontFamily: font.body, fontSize: 11, color: colors.onSurfaceTertiary, marginTop: 3, lineHeight: 15 },

  upgradeBtn: { marginTop: spacing.xl, backgroundColor: colors.surfaceInverse, padding: spacing.md, borderRadius: radii.md, alignItems: "center" },
  upgradeText: { color: colors.onSurfaceInverse, fontFamily: font.bodyBold, fontSize: 14 },

  healthCard: { padding: spacing.md, borderRadius: radii.lg, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border },
  healthLabel: { fontFamily: font.bodyBold, fontSize: 13, color: colors.onSurface },
  healthScore: { fontFamily: font.display, fontSize: 22 },
  healthTip: { fontFamily: font.body, fontSize: 11, color: colors.onSurfaceTertiary, marginTop: spacing.sm, lineHeight: 15 },

  dnaBadge: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.pill, backgroundColor: "#FAF6EF", borderWidth: 1, borderColor: "#EBDEC5", flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dnaLabel: { fontFamily: font.bodyBold, fontSize: 12, color: colors.brand },
  dnaScore: { fontFamily: font.display, fontSize: 16, color: "#8B5A2B" },
});
