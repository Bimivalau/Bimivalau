import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "@/src/session";
import { colors, spacing, font, radii } from "@/src/theme";

export default function Login() {
  const { signIn } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("sara@braids.demo");
  const [password, setPassword] = useState("demo1234");
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
          <TextInput testID="login-password" value={password} onChangeText={setPassword} secureTextEntry style={styles.input} placeholderTextColor={colors.muted} />
          {err && <Text testID="login-error" style={styles.err}>{err}</Text>}
          <Pressable testID="login-submit" onPress={submit} disabled={busy} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}>
            <Text style={styles.btnText}>{busy ? "Signing in…" : "Sign in"}</Text>
          </Pressable>
          <Pressable testID="go-register" onPress={() => router.push("/register")}>
            <Text style={styles.link}>New here? Create an account →</Text>
          </Pressable>
          <Text style={styles.demo}>Demo customer: sara@braids.demo · demo1234{"\n"}Demo pro: amara@braids.demo · demo1234</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.onBrandTertiary, letterSpacing: 3, fontSize: 11, fontFamily: font.bodyMed, marginBottom: spacing.sm, color: "#E8CBBF" },
  hero: { color: "#F9F6F0", fontFamily: font.display, fontSize: 44, lineHeight: 48 },
  label: { fontFamily: font.bodyMed, color: colors.onSurfaceSecondary, fontSize: 12, letterSpacing: 1 },
  input: { borderBottomWidth: 1, borderColor: colors.borderStrong, paddingVertical: spacing.md, fontSize: 16, fontFamily: font.body, color: colors.onSurface },
  btn: { backgroundColor: colors.brand, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.lg, borderRadius: radii.md },
  btnText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 16, letterSpacing: 0.5 },
  link: { color: colors.brandSecondary, fontFamily: font.bodyMed, textAlign: "center", marginTop: spacing.md },
  err: { color: colors.error, fontFamily: font.body },
  demo: { color: colors.muted, fontSize: 11, marginTop: spacing.xl, textAlign: "center", fontFamily: font.body, lineHeight: 16 },
});
