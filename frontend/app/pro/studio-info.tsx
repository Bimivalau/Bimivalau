import { useEffect, useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { api } from "@/src/api";
import { colors, font, spacing, radii } from "@/src/theme";
import { SafeScrollView, ResponsiveHeading, Card, BottomCTA, LoadingState } from "@/src/ui";

export default function StudioInfo() {
  const router = useRouter();
  const { t } = useTranslation("pro_studio");
  const { t: tCommon } = useTranslation("common");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [salonName, setSalonName] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const me = await api("/hairdressers/me");
        setBio(me.bio || ""); setSalonName(me.salon_name || ""); setCity(me.city || ""); setAddress(me.address || "");
      } catch (e: any) { setErr(e?.userMessage || t("studio_info.load_error")); }
      finally { setLoading(false); }
    })();
  }, []);

  const save = async () => {
    setSaving(true); setErr(null); setMsg(null);
    try {
      await api("/hairdressers/me", { method: "PUT", body: JSON.stringify({ bio, salon_name: salonName, city, address, latitude: 0, longitude: 0, cover_photo: "" }) });
      setMsg(t("studio_info.saved")); setTimeout(() => setMsg(null), 1500);
    } catch (e: any) { setErr(e?.userMessage || t("studio_info.save_error")); }
    finally { setSaving(false); }
  };

  if (loading) return <LoadingState label={t("studio_info.loading")} />;

  return (
    <SafeScrollView>
      <View style={{ paddingTop: spacing.md }}>
        <Pressable testID="info-back" onPress={() => router.back()} hitSlop={12} style={{ marginBottom: spacing.md }}>
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <ResponsiveHeading size={30}>{t("studio_info.heading")}</ResponsiveHeading>
        <Text style={s.sub}>{t("studio_info.subtitle")}</Text>

        <Card padding={spacing.lg} style={{ marginTop: spacing.lg, gap: spacing.md }}>
          <Field label={t("studio_info.fields.studio_name_label")} value={salonName} onChange={setSalonName} placeholder={t("studio_info.fields.studio_name_placeholder")} />
          <Field label={t("studio_info.fields.city_label")} value={city} onChange={setCity} placeholder={t("studio_info.fields.city_placeholder")} />
          <Field label={t("studio_info.fields.address_label")} value={address} onChange={setAddress} placeholder={t("studio_info.fields.address_placeholder")} />
          <Field label={t("studio_info.fields.bio_label")} value={bio} onChange={setBio} placeholder={t("studio_info.fields.bio_placeholder")} multiline />
        </Card>

        {err ? <Text style={s.err}>{err}</Text> : null}
        {msg ? <Text style={s.ok}>{msg}</Text> : null}

        <BottomCTA testID="info-save" label={saving ? tCommon("states.saving") : t("studio_info.save_button")} onPress={save} loading={saving} />
      </View>
    </SafeScrollView>
  );
}

function Field({ label, value, onChange, placeholder, multiline }: any) {
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        multiline={multiline}
        style={[s.input, multiline && { minHeight: 100, textAlignVertical: "top", paddingTop: spacing.md }]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  sub: { color: colors.onSurfaceTertiary, fontFamily: font.body, fontSize: 13, marginTop: spacing.sm, lineHeight: 18 },
  label: { fontFamily: font.bodyBold, color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 1.5, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontFamily: font.body, color: colors.onSurface, minHeight: 48 },
  err: { color: colors.error, fontFamily: font.body, marginTop: spacing.md, fontSize: 13 },
  ok: { color: colors.success, fontFamily: font.bodyBold, marginTop: spacing.md, fontSize: 13 },
});
