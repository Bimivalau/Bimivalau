import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState } from "react";
import { Feather } from "@expo/vector-icons";
import { useSession } from "@/src/session";
import { colors, spacing, font, radii } from "@/src/theme";

// The Welcome/Splash. Role choice, not a login form.
export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signInWithGoogle } = useSession();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const google = async () => {
    setErr(null); setBusy(true);
    try {
      const res = await signInWithGoogle();
      if (!res) { setBusy(false); return; }
      router.replace(res.needs_pro_completion ? "/pro/onboarding" : "/");
    } catch (e: any) { setErr(e.message || "Google sign-in failed"); }
    finally { setBusy(false); }
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceInverse }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ height: 520 }}>
          <Image source={{ uri: "https://images.unsplash.com/photo-1592520113018-180c8bc831c9?w=1000&q=85" }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.9)"]} style={StyleSheet.absoluteFill} />
          <View style={{ flex: 1, padding: spacing.xl, paddingTop: insets.top + spacing.lg, justifyContent: "flex-end" }}>
            <Text style={s.eyebrow}>BRAIDSCOMMUNITY</Text>
            <Text style={s.hero}>Where braids{"\n"}are art.</Text>
            <Text style={s.sub}>Discover braid artists in your city, book a chair, pay at the counter.</Text>
          </View>
        </View>

        <View style={{ padding: spacing.xl, gap: spacing.md, backgroundColor: colors.surfaceInverse }}>
          <View style={s.langRow}>
            <Feather name="globe" size={14} color="#F9F6F0" />
            <Text style={s.langText}>English</Text>
          </View>
          <Text style={s.chooseTitle}>How do you want to start?</Text>
          <Text style={s.explain}>BraidsCommunity is where you discover braid styles and the studios that create them.</Text>

          <Pressable testID="welcome-customer" onPress={() => router.push("/register?role=customer")} style={s.roleCard} accessibilityRole="button" accessibilityLabel="Continue as customer">
            <View style={{ flex: 1 }}>
              <Text style={s.roleTitle}>I&apos;m a Customer</Text>
              <Text style={s.roleDesc}>Find braid artists near you and book your next appointment.</Text>
            </View>
            <Text style={s.roleArrow}>→</Text>
          </Pressable>

          <Pressable testID="welcome-braider" onPress={() => router.push("/register?role=hairdresser")} style={[s.roleCard, s.roleCardBraider]} accessibilityRole="button" accessibilityLabel="Continue as braider">
            <View style={{ flex: 1 }}>
              <Text style={[s.roleTitle, { color: "#fff" }]}>I&apos;m a Braider</Text>
              <Text style={[s.roleDesc, { color: "#F9F6F0" }]}>Show your work, take bookings, get paid in person.</Text>
            </View>
            <Text style={[s.roleArrow, { color: "#fff" }]}>→</Text>
          </Pressable>

          <Pressable testID="welcome-existing" onPress={() => router.push("/login")} style={{ padding: spacing.md, alignItems: "center", marginTop: spacing.md }} accessibilityRole="button">
            <Text style={s.existingLink}>Already have an account? <Text style={{ fontFamily: font.bodyBold, color: "#fff" }}>Sign in</Text></Text>
          </Pressable>

          <View style={s.googleDivider}>
            <View style={s.gLine} />
            <Text style={s.gDivText}>OR CONTINUE INSTANTLY</Text>
            <View style={s.gLine} />
          </View>
          <Pressable testID="welcome-google" onPress={google} disabled={busy} style={s.googleBtn}>
            <View style={s.googleG}><Text style={s.googleGText}>G</Text></View>
            <Text style={s.googleBtnText}>{busy ? "Opening Google…" : "Continue with Google"}</Text>
          </Pressable>
          {err && <Text testID="welcome-err" style={{ color: "#FFB3B0", fontFamily: font.body, textAlign: "center", marginTop: spacing.sm }}>{err}</Text>}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  eyebrow: { color: "#E8CBBF", letterSpacing: 3, fontSize: 11, fontFamily: font.bodyMed, marginBottom: spacing.sm },
  hero: { color: "#F9F6F0", fontFamily: font.display, fontSize: 48, lineHeight: 52 },
  sub: { color: "#F9F6F0", opacity: 0.85, fontFamily: font.body, fontSize: 15, marginTop: spacing.md, maxWidth: 320 },
  chooseTitle: { color: "#F9F6F0", fontFamily: font.displayIt, fontSize: 20, marginTop: spacing.lg, marginBottom: spacing.md },
  explain: { color: "#F9F6F0", opacity: 0.7, fontFamily: font.body, fontSize: 13, lineHeight: 19, marginBottom: spacing.md },
  langRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center", alignSelf: "flex-start", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", borderRadius: radii.pill },
  langText: { color: "#F9F6F0", fontFamily: font.bodyMed, fontSize: 12, letterSpacing: 1 },
  langHint: { color: "#F9F6F0", opacity: 0.5, fontFamily: font.body, fontSize: 11 },
  roleCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, backgroundColor: "#F9F6F0", borderRadius: radii.md },
  roleCardBraider: { backgroundColor: colors.brand },
  roleTitle: { fontFamily: font.display, fontSize: 22, color: colors.onSurface },
  roleDesc: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 13, marginTop: 2 },
  roleArrow: { fontFamily: font.display, fontSize: 28, color: colors.brand },
  existingLink: { color: "#F9F6F0", opacity: 0.75, fontFamily: font.body, fontSize: 14 },
  googleDivider: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md, marginBottom: spacing.sm },
  gLine: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.2)" },
  gDivText: { color: "#F9F6F0", opacity: 0.55, fontFamily: font.bodyMed, fontSize: 10, letterSpacing: 2 },
  googleBtn: { flexDirection: "row", gap: spacing.md, alignItems: "center", justifyContent: "center", paddingVertical: spacing.lg, borderRadius: radii.md, backgroundColor: "#fff" },
  googleG: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#4285F4" },
  googleGText: { fontFamily: font.bodyBold, color: "#4285F4", fontSize: 13 },
  googleBtnText: { fontFamily: font.bodyBold, color: colors.onSurface, fontSize: 15 },
});
