import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useSession } from "@/src/session";
import { colors, spacing, font, radii } from "@/src/theme";

export default function Register() {
  const { signUp } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ role?: string }>();
  const initialRole = params.role === "hairdresser" ? "hairdresser" : "customer";
  const [role, setRole] = useState<"customer" | "hairdresser">(initialRole);

  // Common
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Pro-only extended
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [salonName, setSalonName] = useState("");
  const [city, setCity] = useState("");
  const [styles_, setStyles] = useState<any[]>([]);
  const [specIds, setSpecIds] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(1); // pro-only wizard steps

  useEffect(() => { if (role === "hairdresser") api("/hairstyles").then(setStyles); }, [role]);

  const validPro =
    name.trim() && email.trim() && password.length >= 6 &&
    phone.trim() && bio.trim() && serviceArea.trim() && specIds.length > 0;
  const validCust = name.trim() && email.trim() && password.length >= 6;

  const submit = async () => {
    setErr(null); setBusy(true);
    try {
      if (role === "hairdresser") {
        await api("/auth/register", { method: "POST", body: JSON.stringify({
          email: email.trim(), password, name: name.trim(), role,
          phone: phone.trim(), bio: bio.trim(), service_area: serviceArea.trim(),
          salon_name: salonName.trim() || null, city: city.trim() || serviceArea.trim(),
          specialty_ids: specIds,
        })}).then(async (res: any) => {
          const { setToken } = await import("@/src/api");
          await setToken(res.access_token);
        });
        // Fresh pro → still needs availability + portfolio before onboarding_completed can flip
        router.replace("/pro/onboarding");
      } else {
        await signUp(email.trim(), password, name.trim(), "customer");
        router.replace("/");
      }
    } catch (e: any) { setErr(e.message || "Sign-up failed"); }
    finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: insets.top + spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl }} keyboardShouldPersistTaps="handled">
        <Pressable testID="register-back" onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={s.title}>{role === "hairdresser" ? "Braider signup" : "Create\nyour account"}</Text>

        <View style={s.roleRow}>
          {(["customer", "hairdresser"] as const).map(r => (
            <Pressable key={r} testID={`role-${r}`} onPress={() => { setRole(r); setStep(1); }} style={[s.rolePill, role === r && s.rolePillActive]}>
              <Text style={[s.roleText, role === r && s.roleTextActive]}>{r === "customer" ? "I book braids" : "I braid hair"}</Text>
            </Pressable>
          ))}
        </View>

        {/* --- Common fields --- */}
        <Text style={s.label}>Full name</Text>
        <TextInput testID="reg-name" value={name} onChangeText={setName} style={s.input} />
        <Text style={s.label}>Email</Text>
        <TextInput testID="reg-email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={s.input} />
        <Text style={s.label}>Password (min 6)</Text>
        <TextInput testID="reg-password" value={password} onChangeText={setPassword} secureTextEntry style={s.input} />

        {role === "hairdresser" && (
          <>
            <View style={s.privacyBox}>
              <Feather name="lock" size={14} color={colors.brand} />
              <Text style={s.privacyText}>Phone is private — used only for account security. Never shown to customers.</Text>
            </View>
            <Text style={s.label}>Phone (private)</Text>
            <TextInput testID="reg-phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={s.input} />

            <Text style={s.label}>Service area / city</Text>
            <TextInput testID="reg-service-area" value={serviceArea} onChangeText={setServiceArea} style={s.input} placeholder="Brooklyn, NY" placeholderTextColor={colors.muted} />
            <Text style={s.label}>Salon name (optional)</Text>
            <TextInput testID="reg-salon" value={salonName} onChangeText={setSalonName} style={s.input} placeholder="Or leave blank if you work from home" placeholderTextColor={colors.muted} />
            <Text style={s.label}>Short bio</Text>
            <TextInput testID="reg-bio" value={bio} onChangeText={setBio} multiline style={[s.input, { minHeight: 80, textAlignVertical: "top" }]} placeholder="10 years of knotless & Fulani…" placeholderTextColor={colors.muted} />

            <Text style={s.label}>Specialties (required)</Text>
            <Text style={s.help}>Pick every style you offer. Customers find you by these.</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
              {styles_.map(st => {
                const active = specIds.includes(st.id);
                return (
                  <Pressable key={st.id} testID={`reg-spec-${st.id}`} onPress={() => setSpecIds(a => active ? a.filter(x => x !== st.id) : [...a, st.id])} style={[s.chip, active && s.chipActive]}>
                    <Text style={[s.chipText, active && { color: "#fff" }]}>{st.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {err && <Text testID="reg-error" style={{ color: colors.error, fontFamily: font.body, marginTop: spacing.sm }}>{err}</Text>}
        <Pressable
          testID="reg-submit"
          onPress={submit}
          disabled={busy || (role === "hairdresser" ? !validPro : !validCust)}
          style={[s.btn, (busy || (role === "hairdresser" ? !validPro : !validCust)) && { opacity: 0.4 }]}
        >
          <Text style={s.btnText}>{busy ? "Creating…" : role === "hairdresser" ? "Continue → Portfolio & Availability" : "Create account"}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 36, lineHeight: 42, color: colors.onSurface, marginTop: spacing.lg, marginBottom: spacing.lg },
  roleRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  rolePill: { flex: 1, paddingVertical: spacing.md, alignItems: "center", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.md },
  rolePillActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  roleText: { color: colors.onSurface, fontFamily: font.bodyMed },
  roleTextActive: { color: colors.onSurfaceInverse },
  label: { fontFamily: font.bodyMed, color: colors.onSurfaceSecondary, fontSize: 12, letterSpacing: 1, marginTop: spacing.sm },
  input: { borderBottomWidth: 1, borderColor: colors.borderStrong, paddingVertical: spacing.md, fontSize: 16, fontFamily: font.body, color: colors.onSurface },
  help: { fontFamily: font.body, color: colors.muted, fontSize: 12 },
  privacyBox: { flexDirection: "row", gap: spacing.sm, alignItems: "center", padding: spacing.md, backgroundColor: colors.brandTertiary, borderRadius: radii.md, marginTop: spacing.md },
  privacyText: { flex: 1, fontFamily: font.body, color: colors.onBrandTertiary, fontSize: 12 },
  chip: { height: 34, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.borderStrong, justifyContent: "center" },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontFamily: font.bodyMed, color: colors.onSurface, fontSize: 13 },
  btn: { backgroundColor: colors.brand, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.xl, borderRadius: radii.md },
  btnText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 15 },
});
