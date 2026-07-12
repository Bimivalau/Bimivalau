import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useSession } from "@/src/session";
import { colors, spacing, font, radii } from "@/src/theme";

export default function Login() {
  const { signIn, signInWithGoogle } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(null); setBusy(true);
    try {
      await signIn(email.trim(), password);
      router.replace("/");
    } catch (e: any) { setErr(e.message || "Login failed"); }
    finally { setBusy(false); }
  };

  const google = async () => {
    setErr(null); setBusy(true);
    try {
      const res = await signInWithGoogle();
      if (!res) { setBusy(false); return; }
      if (res.needs_pro_completion) router.replace("/pro/onboarding");
      else router.replace("/");
    } catch (e: any) { setErr(e.message || "Google sign-in failed"); }
    finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ height: 340 }}>
          <Image source={{ uri: "https://images.unsplash.com/photo-1592520113018-180c8bc831c9?w=800&q=85" }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient colors={["rgba(0,0,0,0.1)", "rgba(0,0,0,0.75)"]} style={StyleSheet.absoluteFill} />
          <View style={{ flex: 1, justifyContent: "flex-end", padding: spacing.xl, paddingTop: insets.top + spacing.lg }}>
            <Text style={styles.eyebrow}>BRAIDSCOMMUNITY</Text>
            <Text style={styles.hero}>Where braids{"\n"}are art.</Text>
          </View>
        </View>
        <View style={{ padding: spacing.xl, gap: spacing.md }}>
          <Text style={styles.label}>Email</Text>
          <TextInput testID="login-email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={styles.input} placeholderTextColor={colors.muted} />
          <Text style={styles.label}>Password</Text>
          <View style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderColor: colors.borderStrong }}>
            <TextInput testID="login-password" value={password} onChangeText={setPassword} secureTextEntry={!showPw} style={[styles.input, { flex: 1, borderBottomWidth: 0 }]} placeholderTextColor={colors.muted} />
            <Pressable testID="login-toggle-pw" onPress={() => setShowPw(v => !v)} style={{ padding: spacing.sm }}>
              <Feather name={showPw ? "eye-off" : "eye"} size={18} color={colors.muted} />
            </Pressable>
          </View>
          {err && <Text testID="login-error" style={styles.err}>{err}</Text>}
          <Pressable testID="login-submit" onPress={submit} disabled={busy} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]} accessibilityRole="button">
            <Text style={styles.btnText}>{busy ? "Signing in…" : "Sign in"}</Text>
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable testID="login-google" onPress={google} disabled={busy} style={styles.googleBtn}>
            <View style={styles.googleG}><Text style={styles.googleGText}>G</Text></View>
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          </Pressable>

          <Pressable testID="go-register" onPress={() => router.push("/welcome")}>
            <Text style={styles.link}>New here? Get started →</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: "#E8CBBF", letterSpacing: 3, fontSize: 11, fontFamily: font.bodyMed, marginBottom: spacing.sm },
  hero: { color: "#F9F6F0", fontFamily: font.display, fontSize: 44, lineHeight: 48 },
  label: { fontFamily: font.bodyMed, color: colors.onSurfaceSecondary, fontSize: 12, letterSpacing: 1 },
  input: { borderBottomWidth: 1, borderColor: colors.borderStrong, paddingVertical: spacing.md, fontSize: 16, fontFamily: font.body, color: colors.onSurface },
  btn: { backgroundColor: colors.brand, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.lg, borderRadius: radii.md },
  btnText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 16, letterSpacing: 0.5 },
  link: { color: colors.brandSecondary, fontFamily: font.bodyMed, textAlign: "center", marginTop: spacing.md },
  err: { color: colors.error, fontFamily: font.body },
  demo: { color: colors.muted, fontSize: 11, marginTop: spacing.xl, textAlign: "center", fontFamily: font.body, lineHeight: 16 },
  divider: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.lg, marginBottom: spacing.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.divider },
  dividerText: { fontFamily: font.bodyMed, color: colors.muted, fontSize: 11, letterSpacing: 2 },
  googleBtn: { flexDirection: "row", gap: spacing.md, alignItems: "center", justifyContent: "center", paddingVertical: spacing.lg, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: "#fff" },
  googleG: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#4285F4" },
  googleGText: { fontFamily: font.bodyBold, color: "#4285F4", fontSize: 13 },
  googleBtnText: { fontFamily: font.bodyBold, color: colors.onSurface, fontSize: 15 },
});
