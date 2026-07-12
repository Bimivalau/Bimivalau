import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api, setToken } from "@/src/api";
import { useSession } from "@/src/session";
import { colors, spacing, font, radii } from "@/src/theme";

export default function Register() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh } = useSession();
  const params = useLocalSearchParams<{ role?: string }>();
  const role: "customer" | "hairdresser" = params.role === "hairdresser" ? "hairdresser" : "customer";
  const isPro = role === "hairdresser";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [phone, setPhone] = useState("");
  const [accept, setAccept] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());
  const passwordsMatch = password.length >= 6 && password === confirm;
  const canSubmit =
    name.trim() && validEmail && passwordsMatch && accept &&
    (!isPro || phone.trim().length >= 4);

  const submit = async () => {
    setErr(null); setBusy(true);
    try {
      const res = await api("/auth/register", { method: "POST", body: JSON.stringify({
        email: email.trim(), password, name: name.trim(), role,
        phone: isPro ? phone.trim() : null,
        accept_terms: accept,
      })});
      await setToken(res.access_token);
      await refresh();
      router.replace("/verify-email");
    } catch (e: any) { setErr(e.message || "Sign-up failed"); }
    finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: insets.top + spacing.xl, paddingBottom: spacing.xxxl }} keyboardShouldPersistTaps="handled">
        <Pressable
          testID="register-back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/welcome"))}
          hitSlop={12}
          style={{ minHeight: 44, width: 44, justifyContent: "center" }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={s.title}>{isPro ? "Create your\nbraider account" : "Create your\naccount"}</Text>

        <Text style={s.label}>Full name</Text>
        <TextInput testID="reg-name" value={name} onChangeText={setName} style={s.input} />

        <Text style={s.label}>Email</Text>
        <TextInput testID="reg-email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={s.input} />

        <Text style={s.label}>Password (min 6)</Text>
        <View style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderColor: colors.borderStrong }}>
          <TextInput testID="reg-password" value={password} onChangeText={setPassword} secureTextEntry={!showPw} style={[s.input, { flex: 1, borderBottomWidth: 0 }]} />
          <Pressable testID="reg-toggle-pw" onPress={() => setShowPw(v => !v)} style={{ padding: spacing.sm }}>
            <Feather name={showPw ? "eye-off" : "eye"} size={18} color={colors.muted} />
          </Pressable>
        </View>

        <Text style={s.label}>Confirm password</Text>
        <TextInput testID="reg-confirm" value={confirm} onChangeText={setConfirm} secureTextEntry={!showPw} style={s.input} />
        {confirm.length > 0 && !passwordsMatch && (
          <Text style={{ color: colors.warning, fontFamily: font.body, fontSize: 12, marginTop: 4 }}>Passwords must match and be at least 6 characters.</Text>
        )}

        {isPro && (
          <>
            <Text style={s.label}>Private phone number</Text>
            <TextInput testID="reg-phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={s.input} />
            <View style={s.privacyBox}>
              <Feather name="lock" size={14} color={colors.brand} />
              <Text style={s.privacyText}>Your phone number is used only for account security and is never displayed publicly.</Text>
            </View>
          </>
        )}

        <Pressable testID="reg-accept" onPress={() => setAccept(a => !a)} style={s.termsRow}>
          <Feather name={accept ? "check-square" : "square"} size={20} color={accept ? colors.brand : colors.borderStrong} />
          <Text style={s.termsText}>
            I accept the <Text style={{ fontFamily: font.bodyBold, color: colors.brand }}>Terms of Service</Text> and <Text style={{ fontFamily: font.bodyBold, color: colors.brand }}>Privacy Policy</Text>.
          </Text>
        </Pressable>

        {err && <Text testID="reg-error" style={{ color: colors.error, fontFamily: font.body, marginTop: spacing.md }}>{err}</Text>}
        <Pressable testID="reg-submit" onPress={submit} disabled={!canSubmit || busy} style={[s.btn, (!canSubmit || busy) && { opacity: 0.4 }]}>
          <Text style={s.btnText}>{busy ? "Creating account…" : "Continue → verify email"}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 34, lineHeight: 38, color: colors.onSurface, marginTop: spacing.lg, marginBottom: spacing.lg },
  label: { fontFamily: font.bodyMed, color: colors.onSurfaceSecondary, fontSize: 12, letterSpacing: 1, marginTop: spacing.md },
  input: { borderBottomWidth: 1, borderColor: colors.borderStrong, paddingVertical: spacing.md, fontSize: 16, fontFamily: font.body, color: colors.onSurface },
  privacyBox: { flexDirection: "row", gap: spacing.sm, alignItems: "center", padding: spacing.md, backgroundColor: colors.brandTertiary, borderRadius: radii.md, marginTop: spacing.md },
  privacyText: { flex: 1, fontFamily: font.body, color: colors.onBrandTertiary, fontSize: 12 },
  termsRow: { flexDirection: "row", gap: spacing.md, alignItems: "center", marginTop: spacing.xl, paddingVertical: spacing.sm },
  termsText: { flex: 1, fontFamily: font.body, color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 18 },
  btn: { backgroundColor: colors.brand, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.lg, borderRadius: radii.md },
  btnText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 15 },
});
