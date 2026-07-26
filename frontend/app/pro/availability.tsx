import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { api } from "@/src/api";
import { colors, spacing, font, radii } from "@/src/theme";
import { SafeScrollView, ResponsiveHeading, LoadingState, BottomCTA } from "@/src/ui";

const DAYS = [
  { key: "Mon", i: 0 }, { key: "Tue", i: 1 }, { key: "Wed", i: 2 },
  { key: "Thu", i: 3 }, { key: "Fri", i: 4 }, { key: "Sat", i: 5 }, { key: "Sun", i: 6 },
];

type Slot = { day_of_week: number; start_time: string; end_time: string };

export default function ProAvailability() {
  const router = useRouter();
  const { t } = useTranslation("pro_studio");
  const { t: tCommon } = useTranslation("common");
  const [items, setItems] = useState<Slot[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { const d = await api("/availability/me"); setItems(Array.isArray(d) ? d : []); }
    catch (e: any) { setErr(e?.userMessage || t("availability.load_error")); setItems([]); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!items) return <LoadingState label={t("availability.loading")} />;

  const toggle = (d: number) => {
    setItems(prev => (prev || []).find(i => i.day_of_week === d)
      ? (prev || []).filter(i => i.day_of_week !== d)
      : [...(prev || []), { day_of_week: d, start_time: "09:00", end_time: "18:00" }]);
  };
  const upd = (d: number, k: "start_time" | "end_time", v: string) =>
    setItems(prev => (prev || []).map(i => i.day_of_week === d ? { ...i, [k]: v } : i));

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      await api("/availability/me", { method: "PUT", body: JSON.stringify(items) });
      setMsg(t("availability.saved")); setTimeout(() => setMsg(null), 1800);
    } catch (e: any) { setErr(e?.userMessage || t("availability.save_error")); }
    finally { setSaving(false); }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SafeScrollView>
        <View style={{ paddingTop: spacing.md }}>
          <Pressable
            testID="avail-back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/pro/studio"))}
            hitSlop={12}
            style={s.backBtn}
            accessibilityRole="button"
            accessibilityLabel={tCommon("buttons.back")}
          >
            <Feather name="arrow-left" size={22} color={colors.onSurface} />
          </Pressable>
          <ResponsiveHeading size={30} style={{ marginTop: spacing.sm }}>{t("availability.heading")}</ResponsiveHeading>
          <Text style={s.sub}>{t("availability.subtitle")}</Text>

          <View style={{ marginTop: spacing.lg }}>
            {DAYS.map(({ key, i }) => {
              const item = (items || []).find(it => it.day_of_week === i);
              const isOn = !!item;
              const dayLabel = t(`availability.days.${key}`);
              return (
                <View key={key} style={s.row}>
                  <Pressable
                    testID={`day-${key}`}
                    onPress={() => toggle(i)}
                    style={[s.dayBtn, isOn && s.dayBtnOn]}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: isOn }}
                    accessibilityLabel={`${dayLabel} — ${isOn ? t("availability.status_on") : t("availability.status_off")}`}
                  >
                    <Text style={[s.dayText, isOn && { color: "#fff" }]}>{dayLabel}</Text>
                  </Pressable>
                  {isOn && item && (
                    <View style={s.timeRow}>
                      <TextInput
                        testID={`start-${key}`}
                        value={item.start_time}
                        onChangeText={v => upd(i, "start_time", v)}
                        style={s.time}
                        placeholder="09:00"
                        placeholderTextColor={colors.muted}
                        maxLength={5}
                        keyboardType="numbers-and-punctuation"
                      />
                      <Text style={{ fontFamily: font.body, color: colors.muted }}>—</Text>
                      <TextInput
                        testID={`end-${key}`}
                        value={item.end_time}
                        onChangeText={v => upd(i, "end_time", v)}
                        style={s.time}
                        placeholder="18:00"
                        placeholderTextColor={colors.muted}
                        maxLength={5}
                        keyboardType="numbers-and-punctuation"
                      />
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {msg && <Text style={s.ok} accessibilityLiveRegion="polite">{msg}</Text>}
          {err && <Text style={s.err} accessibilityLiveRegion="polite">{err}</Text>}

          <BottomCTA testID="avail-save" label={saving ? tCommon("states.saving") : t("availability.save_button")} onPress={save} loading={saving} />
        </View>
      </SafeScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  backBtn: { minHeight: 44, width: 44, alignItems: "flex-start", justifyContent: "center" },
  sub: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 13, marginTop: spacing.sm, lineHeight: 18 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm, minHeight: 48 },
  dayBtn: { width: 56, paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.md, alignItems: "center", justifyContent: "center", minHeight: 48 },
  dayBtnOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  dayText: { fontFamily: font.bodyBold, color: colors.onSurface, fontSize: 12 },
  timeRow: { flex: 1, flexDirection: "row", gap: spacing.xs, alignItems: "center", minWidth: 0 },
  time: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: 4, minHeight: 44, fontFamily: font.body, textAlign: "center", color: colors.onSurface, fontSize: 13 },
  ok: { color: colors.success, fontFamily: font.bodyBold, marginTop: spacing.md, fontSize: 13 },
  err: { color: colors.error, fontFamily: font.body, marginTop: spacing.md, fontSize: 13 },
});
