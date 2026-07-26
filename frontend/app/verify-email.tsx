import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { api } from "@/src/api";
import { useSession } from "@/src/session";
import { colors, spacing, font, radii } from "@/src/theme";

export default function VerifyEmail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, refresh } = useSession();
  const { t } = useTranslation("auth");
  const { t: tCommon } = useTranslation("common");
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [changing, setChanging] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const refs = useRef<Array<TextInput | null>>([]);

  const sendCode = async () => {
    setErr(null); setInfo(null); setDevCode(null);
    try {
      const r = await api("/auth/send-verification", { method: "POST", body: "{}" });
      if (r.already_verified) {
        // Someone opened /verify-email but their email is already confirmed — just route them onward.
        await refresh();
        router.replace("/");
        return;
      }
      setInfo(t("verify_email.code_sent", { email: r.email }));
      if (r.dev_code) setDevCode(r.dev_code);
      setCooldown(r.resend_after_sec || 45);
    } catch (e: any) {
      if (e.status === 429) setErr(e.message);
      else setErr(e.message || t("verify_email.errors.send_failed"));
    }
  };

  useEffect(() => { sendCode(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const setDigit = (i: number, v: string) => {
    const clean = v.replace(/\D/g, "").slice(0, 1);
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < 5) refs.current[i + 1]?.focus();
  };
  const onKeyDown = (i: number, key: string) => {
    if (key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const submit = async () => {
    setErr(null); setBusy(true);
    try {
      await api("/auth/verify-email", { method: "POST", body: JSON.stringify({ code: digits.join("") }) });
      await refresh();
      // Route based on role — customer → profile completion; pro → onboarding
      if (user?.role === "hairdresser") router.replace("/pro/onboarding");
      else router.replace("/customer/profile");
    } catch (e: any) { setErr(e.message || t("verify_email.errors.verify_failed")); }
    finally { setBusy(false); }
  };

  const changeEmail = async () => {
    if (!newEmail.trim()) return;
    setErr(null); setBusy(true);
    try {
      await api("/auth/change-email", { method: "POST", body: JSON.stringify({ new_email: newEmail.trim() }) });
      setChanging(false);
      setNewEmail("");
      setDigits(["", "", "", "", "", ""]);
      await refresh();
      await sendCode();
    } catch (e: any) { setErr(e.message || t("verify_email.errors.change_failed")); }
    finally { setBusy(false); }
  };

  const complete = digits.every(d => d.length === 1);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: insets.top + spacing.xl }} keyboardShouldPersistTaps="handled">
        <Pressable testID="verify-back" onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={s.title}>{t("verify_email.title")}</Text>
        <Text style={s.sub}>{t("verify_email.subtitle_prefix")}<Text style={{ fontFamily: font.bodyBold }}>{user?.email}</Text>{t("verify_email.subtitle_suffix")}</Text>

        {devCode && (
          <View testID="dev-code-banner" style={s.devBanner}>
            <Feather name="alert-circle" size={14} color={colors.warning} />
            <Text style={s.devText}>{t("verify_email.dev_banner_prefix")}<Text style={{ fontFamily: font.bodyBold }}>{devCode}</Text></Text>
          </View>
        )}

        <View style={s.digitsRow}>
          {digits.map((d, i) => (
            <TextInput
              key={i}
              testID={`digit-${i}`}
              ref={(r) => { refs.current[i] = r; }}
              value={d}
              onChangeText={(v) => setDigit(i, v)}
              onKeyPress={(e) => onKeyDown(i, (e.nativeEvent as any).key)}
              keyboardType="number-pad"
              maxLength={1}
              style={s.digit}
              autoFocus={i === 0}
            />
          ))}
        </View>

        {err && <Text testID="verify-err" style={s.err}>{err}</Text>}
        {info && !err && <Text style={s.info}>{info}</Text>}

        <Pressable testID="verify-submit" onPress={submit} disabled={!complete || busy} style={[s.btn, (!complete || busy) && { opacity: 0.4 }]}>
          <Text style={s.btnText}>{busy ? t("verify_email.verifying") : t("verify_email.verify")}</Text>
        </Pressable>

        <View style={{ flexDirection: "row", justifyContent: "center", gap: spacing.sm, marginTop: spacing.lg }}>
          <Text style={{ fontFamily: font.body, color: colors.muted, fontSize: 13 }}>{t("verify_email.no_code_question")}</Text>
          <Pressable testID="verify-resend" onPress={sendCode} disabled={cooldown > 0}>
            <Text style={{ fontFamily: font.bodyBold, color: cooldown > 0 ? colors.muted : colors.brand, fontSize: 13 }}>
              {cooldown > 0 ? t("verify_email.resend_in", { seconds: cooldown }) : t("verify_email.resend_code")}
            </Text>
          </Pressable>
        </View>

        {!changing ? (
          <Pressable testID="change-email-open" onPress={() => setChanging(true)} style={{ padding: spacing.md, alignItems: "center", marginTop: spacing.md }}>
            <Text style={{ fontFamily: font.bodyMed, color: colors.onSurfaceTertiary, fontSize: 13 }}>{t("verify_email.change_email")}</Text>
          </Pressable>
        ) : (
          <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
            <Text style={s.label}>{t("verify_email.new_email_label")}</Text>
            <TextInput
              testID="change-email-input"
              value={newEmail}
              onChangeText={setNewEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder={t("verify_email.email_placeholder")}
              placeholderTextColor={colors.muted}
              style={s.input}
            />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Pressable testID="change-email-cancel" onPress={() => { setChanging(false); setNewEmail(""); }} style={[s.btn, s.btnGhost, { flex: 1 }]}>
                <Text style={[s.btnText, { color: colors.onSurface }]}>{tCommon("buttons.cancel")}</Text>
              </Pressable>
              <Pressable testID="change-email-save" onPress={changeEmail} disabled={!newEmail.trim() || busy} style={[s.btn, { flex: 1 }, (!newEmail.trim() || busy) && { opacity: 0.4 }]}>
                <Text style={s.btnText}>{t("verify_email.update_and_resend")}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 34, color: colors.onSurface, marginTop: spacing.lg },
  sub: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 14, marginTop: spacing.sm, lineHeight: 20 },
  devBanner: { flexDirection: "row", gap: spacing.sm, alignItems: "center", padding: spacing.md, backgroundColor: "#FFF6E6", borderRadius: radii.md, marginTop: spacing.lg, borderWidth: 1, borderColor: colors.warning },
  devText: { flex: 1, fontFamily: font.body, color: colors.onSurfaceSecondary, fontSize: 12 },
  digitsRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xl, gap: spacing.sm },
  digit: { flex: 1, height: 56, maxWidth: 52, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.md, textAlign: "center", fontFamily: font.display, fontSize: 26, color: colors.onSurface, backgroundColor: colors.surface },
  err: { color: colors.error, fontFamily: font.body, marginTop: spacing.md },
  info: { color: colors.success, fontFamily: font.body, marginTop: spacing.md, fontSize: 12 },
  btn: { backgroundColor: colors.brand, padding: spacing.lg, alignItems: "center", marginTop: spacing.xl, borderRadius: radii.md },
  btnGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.borderStrong },
  btnText: { color: "#fff", fontFamily: font.bodyBold },
  label: { fontFamily: font.bodyMed, color: colors.onSurfaceSecondary, fontSize: 12, letterSpacing: 1 },
  input: { borderBottomWidth: 1, borderColor: colors.borderStrong, paddingVertical: spacing.md, fontFamily: font.body, color: colors.onSurface },
});
