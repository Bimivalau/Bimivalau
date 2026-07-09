import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useSession } from "@/src/session";
import { colors, spacing, font, radii } from "@/src/theme";

export default function Register() {
  const { signUp } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [role, setRole] = useState<"customer" | "hairdresser">("customer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(null); setBusy(true);
    try {
      await signUp(email.trim(), password, name.trim(), role);
      // Verification is optional — send everyone to the normal post-login route.
      router.replace("/");
    } catch (e: any) { setErr(e.message || "Sign-up failed"); }
    finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: insets.top + spacing.xl, gap: spacing.md }} keyboardShouldPersistTaps="handled">
        <Pressable testID="register-back" onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Create{"\n"}your account</Text>
        <View style={styles.roleRow}>
          {(["customer", "hairdresser"] as const).map(r => (
            <Pressable key={r} testID={`role-${r}`} onPress={() => setRole(r)} style={[styles.rolePill, role === r && styles.rolePillActive]}>
              <Text style={[styles.roleText, role === r && styles.roleTextActive]}>{r === "customer" ? "I book braids" : "I braid hair"}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>Full name</Text>
        <TextInput testID="reg-name" value={name} onChangeText={setName} style={styles.input} />
        <Text style={styles.label}>Email</Text>
        <TextInput testID="reg-email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={styles.input} />
        <Text style={styles.label}>Password</Text>
        <TextInput testID="reg-password" value={password} onChangeText={setPassword} secureTextEntry style={styles.input} />
        {err && <Text testID="reg-error" style={{ color: colors.error, fontFamily: font.body }}>{err}</Text>}
        <Pressable testID="reg-submit" onPress={submit} disabled={busy} style={styles.btn}>
          <Text style={styles.btnText}>{busy ? "Creating…" : "Create account"}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 40, lineHeight: 44, color: colors.onSurface, marginTop: spacing.lg, marginBottom: spacing.lg },
  roleRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  rolePill: { flex: 1, paddingVertical: spacing.md, alignItems: "center", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.md },
  rolePillActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  roleText: { color: colors.onSurface, fontFamily: font.bodyMed },
  roleTextActive: { color: colors.onSurfaceInverse },
  label: { fontFamily: font.bodyMed, color: colors.onSurfaceSecondary, fontSize: 12, letterSpacing: 1, marginTop: spacing.sm },
  input: { borderBottomWidth: 1, borderColor: colors.borderStrong, paddingVertical: spacing.md, fontSize: 16, fontFamily: font.body, color: colors.onSurface },
  btn: { backgroundColor: colors.brand, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.xl, borderRadius: radii.md },
  btnText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 16 },
});
