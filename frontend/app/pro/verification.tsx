import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, font, radii } from "@/src/theme";

export default function ProVerification() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [v, setV] = useState<any>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [justResubmitted, setJustResubmitted] = useState(false);

  const load = () => api("/hairdressers/me/verification").then((res) => {
    setV(res);
    // prefill with prior URL when rejected so pro can tweak instead of retyping
    if (res.status === "rejected" && res.license_url) setUrl(res.license_url);
  });
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!url) return;
    setBusy(true);
    try {
      await api("/hairdressers/me/submit-verification", { method: "POST", body: JSON.stringify({ license_url: url }) });
      setJustResubmitted(true);
      await load();
    } finally { setBusy(false); }
  };

  if (!v) return <ActivityIndicator style={{ flex: 1 }} color={colors.brand} />;

  const isRejected = v.status === "rejected";
  const isPending = v.status === "pending";
  const isApproved = v.status === "approved";
  const isUnverified = v.status === "unverified";

  return (
    <ScrollView
      style={{ backgroundColor: colors.surface }}
      contentContainerStyle={{ paddingBottom: spacing.xxxl }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl }}>
        <Pressable testID="ver-back" onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={s.title}>License verification</Text>

        {/* ---------- Fresh account, never submitted (UNVERIFIED = optional pitch) ---------- */}
        {isUnverified && !justResubmitted && (
          <>
            <View testID="optional-hero" style={s.optionalHero}>
              <View style={s.optionalBadge}>
                <Feather name="shield" size={22} color={colors.brand} />
              </View>
              <Text style={s.optionalTitle}>Get the “Verified Pro” badge</Text>
              <Text style={s.optionalSub}>
                Verification is <Text style={{ fontFamily: font.bodyBold }}>optional</Text> — you&apos;re already live in customer search. Verified stylists get a badge on their profile and tend to earn more bookings.
              </Text>
            </View>

            <Text style={[s.section, { marginTop: spacing.xl }]}>Why verify?</Text>
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              <Perk icon="award" title="Verified Pro badge" desc="Shown on your profile, portfolio, and search results." />
              <Perk icon="trending-up" title="More trust, more bookings" desc="Customers filter for verified stylists in busy cities." />
              <Perk icon="clock" title="Fast turnaround" desc="Admins review within 3 business days." />
            </View>

            <Text style={[s.section, { marginTop: spacing.xl }]}>Submit ID / business license</Text>
            <Text style={s.help}>Paste a URL to a photo of your government-issued ID or braiding license.</Text>
            <TextInput
              testID="ver-url"
              value={url}
              onChangeText={setUrl}
              placeholder="https://…"
              placeholderTextColor={colors.muted}
              style={s.input}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable testID="ver-submit" onPress={submit} disabled={!url || busy} style={[s.btn, (!url || busy) && { opacity: 0.4 }]}>
              <Text style={s.btnText}>{busy ? "Submitting…" : "Submit for review"}</Text>
            </Pressable>
            <Pressable testID="ver-skip" onPress={() => router.back()} style={s.skipBtn}>
              <Text style={s.skipText}>Maybe later</Text>
            </Pressable>
          </>
        )}

        {/* ---------- REJECTED: dedicated fix-and-resubmit flow ---------- */}
        {isRejected && !justResubmitted && (
          <>
            <View testID="rejected-hero" style={s.rejectedHero}>
              <View style={s.rejectedIcon}>
                <Feather name="alert-triangle" size={22} color="#fff" />
              </View>
              <Text style={s.rejectedTitle}>Application needs attention</Text>
              <Text style={s.rejectedSub}>
                Your last submission wasn&apos;t approved. Fix the issues below and resubmit — you&apos;ll go back into the queue with a fresh 3-day SLA.
              </Text>
            </View>

            <View style={s.reasonBox}>
              <Text style={s.reasonLabel}>ADMIN FEEDBACK</Text>
              <Text testID="ver-reason" style={s.reasonText}>
                “{v.reason || "No specific reason given. Please upload a clearer photo of a government-issued ID or braiding license."}”
              </Text>
              {v.decided_at && (
                <Text style={s.reasonMeta}>Reviewed {new Date(v.decided_at).toLocaleDateString()}</Text>
              )}
            </View>

            <Text style={s.section}>How to fix it</Text>
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              <Step n={1} title="Read the feedback" desc="Understand what the admin flagged in your previous upload." />
              <Step n={2} title="Take a clear photo" desc="Well-lit, no glare, full document visible, text readable." />
              <Step n={3} title="Upload and resubmit" desc="Paste the new URL below. Your profile stays hidden from customers until re-approved." />
            </View>

            <Text style={[s.section, { marginTop: spacing.xl }]}>Upload a new document</Text>
            <Text style={s.help}>We&apos;ve kept your previous URL so you can adjust it — replace with the new photo before resubmitting.</Text>
            <TextInput
              testID="ver-url"
              value={url}
              onChangeText={setUrl}
              placeholder="https://…"
              placeholderTextColor={colors.muted}
              style={s.input}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              testID="ver-resubmit"
              onPress={submit}
              disabled={!url || busy || url === v.license_url}
              style={[s.btn, (!url || busy || url === v.license_url) && { opacity: 0.4 }]}
            >
              <Text style={s.btnText}>{busy ? "Resubmitting…" : "Resubmit for review"}</Text>
            </Pressable>
            {url && url === v.license_url && (
              <Text style={s.hintInline}>Change the URL before resubmitting — otherwise you&apos;ll upload the same document that was rejected.</Text>
            )}
          </>
        )}

        {/* ---------- Success just after resubmit: back to pending queue ---------- */}
        {isPending && justResubmitted && (
          <View testID="resubmitted-success" style={s.successBox}>
            <Feather name="check-circle" size={28} color={colors.success} />
            <Text style={s.successTitle}>You&apos;re back in the queue</Text>
            <Text style={s.successMsg}>Admin has 3 business days to re-review. You&apos;ll get a notification with the outcome.</Text>
          </View>
        )}

        {/* ---------- PENDING (first submission or after resubmit) ---------- */}
        {isPending && !justResubmitted && (
          <>
            <View style={[s.status, { borderColor: colors.warning }]}>
              <Text style={[s.statusLabel, { color: colors.warning }]}>PENDING</Text>
              <Text style={s.statusMsg}>Under review — typically completed within 3 business days.</Text>
              {v.submitted_at && (
                <Text style={s.statusMeta}>
                  Submitted {new Date(v.submitted_at).toLocaleDateString()} · {v.overdue ? "Overdue — admin flagged" : `${v.days_left_sla} day(s) remaining in SLA`}
                </Text>
              )}
            </View>
            <Text style={[s.help, { marginTop: spacing.lg }]}>
              Your profile stays hidden from customer search while pending. We&apos;ll notify you as soon as an admin reviews.
            </Text>
          </>
        )}

        {/* ---------- APPROVED ---------- */}
        {isApproved && (
          <View style={[s.status, { borderColor: colors.success }]}>
            <Text style={[s.statusLabel, { color: colors.success }]}>APPROVED</Text>
            <Text style={s.statusMsg}>You&apos;re verified. Your profile is live in customer search.</Text>
            {v.decided_at && <Text style={s.statusMeta}>Approved {new Date(v.decided_at).toLocaleDateString()}</Text>}
          </View>
        )}

        {/* ---------- Fresh account, no submission yet (legacy 'pending' with no submitted_at — kept for backward compat) ---------- */}
        {isPending && !v.submitted_at && !justResubmitted && (
          <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
            <Text style={s.section}>Submit ID / business license</Text>
            <Text style={s.help}>Paste a URL to a photo of your government-issued ID or braiding license. Your profile will be locked until an admin approves.</Text>
            <TextInput
              testID="ver-url"
              value={url}
              onChangeText={setUrl}
              placeholder="https://…"
              placeholderTextColor={colors.muted}
              style={s.input}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable testID="ver-submit" onPress={submit} disabled={!url || busy} style={[s.btn, (!url || busy) && { opacity: 0.4 }]}>
              <Text style={s.btnText}>{busy ? "Submitting…" : "Submit for review"}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <View style={s.step}>
      <View style={s.stepNum}><Text style={s.stepNumText}>{n}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={s.stepTitle}>{title}</Text>
        <Text style={s.stepDesc}>{desc}</Text>
      </View>
    </View>
  );
}

function Perk({ icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <View style={s.step}>
      <View style={s.perkIcon}><Feather name={icon} size={16} color={colors.brand} /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.stepTitle}>{title}</Text>
        <Text style={s.stepDesc}>{desc}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 32, color: colors.onSurface, marginTop: spacing.lg, marginBottom: spacing.lg },
  status: { padding: spacing.lg, borderLeftWidth: 4, borderRadius: radii.md, backgroundColor: colors.surfaceSecondary },
  statusLabel: { fontFamily: font.bodyBold, letterSpacing: 2, fontSize: 12, marginBottom: 4 },
  statusMsg: { fontFamily: font.body, color: colors.onSurfaceSecondary, fontSize: 14 },
  statusMeta: { fontFamily: font.body, color: colors.muted, fontSize: 12, marginTop: spacing.sm },
  section: { fontFamily: font.display, fontSize: 22, color: colors.onSurface },
  help: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 13, lineHeight: 18 },
  input: { borderBottomWidth: 1, borderColor: colors.borderStrong, paddingVertical: spacing.md, fontFamily: font.body, color: colors.onSurface },
  btn: { backgroundColor: colors.brand, padding: spacing.md, borderRadius: radii.md, alignItems: "center" },
  btnText: { color: "#fff", fontFamily: font.bodyBold },
  hintInline: { fontFamily: font.body, color: colors.warning, fontSize: 12, marginTop: -spacing.sm },
  // Rejected UI
  rejectedHero: { padding: spacing.lg, backgroundColor: colors.error, borderRadius: radii.md, gap: spacing.sm },
  rejectedIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  rejectedTitle: { fontFamily: font.display, fontSize: 24, color: "#fff", marginTop: spacing.sm },
  rejectedSub: { fontFamily: font.body, color: "#FFE6E4", fontSize: 14, lineHeight: 20 },
  reasonBox: { marginTop: spacing.lg, padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderLeftWidth: 3, borderLeftColor: colors.error, borderRadius: radii.md },
  reasonLabel: { fontFamily: font.bodyBold, color: colors.error, letterSpacing: 2, fontSize: 11 },
  reasonText: { fontFamily: font.displayIt, color: colors.onSurface, fontSize: 16, lineHeight: 22, marginTop: spacing.sm },
  reasonMeta: { fontFamily: font.body, color: colors.muted, fontSize: 11, marginTop: spacing.sm },
  step: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start", paddingVertical: spacing.sm },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  stepNumText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 13 },
  stepTitle: { fontFamily: font.bodyBold, color: colors.onSurface, fontSize: 15 },
  stepDesc: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 13, marginTop: 2 },
  successBox: { padding: spacing.xl, backgroundColor: colors.surfaceSecondary, borderRadius: radii.md, alignItems: "center", gap: spacing.sm },
  successTitle: { fontFamily: font.display, fontSize: 22, color: colors.onSurface },
  successMsg: { fontFamily: font.body, color: colors.onSurfaceTertiary, textAlign: "center", fontSize: 14 },
  // Optional/unverified UI
  optionalHero: { padding: spacing.lg, backgroundColor: colors.brandTertiary, borderRadius: radii.md, gap: spacing.sm },
  optionalBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  optionalTitle: { fontFamily: font.display, fontSize: 26, color: colors.onBrandTertiary, marginTop: spacing.sm },
  optionalSub: { fontFamily: font.body, color: colors.onBrandTertiary, fontSize: 14, lineHeight: 20 },
  perkIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  skipBtn: { padding: spacing.md, alignItems: "center" },
  skipText: { color: colors.muted, fontFamily: font.bodyMed, fontSize: 14 },
});
