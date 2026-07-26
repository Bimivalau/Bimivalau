import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Modal, Switch } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, font, radii, spacing } from "@/src/theme";
import { SafeScrollView, ResponsiveHeading, Card, Badge, BottomCTA, EmptyState, LoadingState } from "@/src/ui";

type Hairstyle = { id: string; name: string; avg_price: number; avg_duration_min: number };
type Service = {
  id: string;
  hairstyle_id: string;
  hairstyle_name?: string;
  custom_name?: string;
  price: number;
  price_max?: number;
  duration_minutes: number;
  hair_included: boolean;
  hair_brands?: string[];
  hair_lengths?: string[];
  difficulty?: string;
  description?: string;
  active: boolean;
};

const LENGTHS = ["Short", "Mid-length", "Long", "Extra Long"];
const LENGTH_KEYS: Record<string, string> = {
  "Short": "short",
  "Mid-length": "mid_length",
  "Long": "long",
  "Extra Long": "extra_long",
};

export default function ProServices() {
  const { t } = useTranslation("pro_dashboard");
  const router = useRouter();
  const [services, setServices] = useState<Service[]>([]);
  const [styles, setStyles] = useState<Hairstyle[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Service | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [svc, sts] = await Promise.all([
        api("/hairdressers/me/services"),
        api("/hairstyles?limit=100"),
      ]);
      setServices(svc); setStyles(sts);
    } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const activeCount = services.filter(s => s.active).length;

  if (loading) return <LoadingState label={t("services.loading")} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <SafeScrollView>
        <View style={{ paddingTop: spacing.md }}>
          <Pressable testID="svc-back" onPress={() => router.back()} hitSlop={12} style={{ marginBottom: spacing.md }}>
            <Feather name="arrow-left" size={22} color={colors.onSurface} />
          </Pressable>
          <ResponsiveHeading size={30}>{t("services.header")}</ResponsiveHeading>
          <Text style={s.sub}>{t("services.subtitle")}</Text>

          <View style={s.metaRow}>
            <Text style={s.metaText}>{t("services.meta_count", { active: activeCount, total: services.length })}</Text>
            <Pressable testID="svc-add" onPress={() => { setEditing(null); setShowAdd(true); }} style={s.addBtn}>
              <Feather name="plus" size={14} color="#fff" />
              <Text style={s.addText}>{t("services.add_service")}</Text>
            </Pressable>
          </View>

          {services.length === 0 ? (
            <EmptyState
              icon="tag"
              title={t("services.empty_title")}
              message={t("services.empty_message")}
              ctaLabel={t("services.empty_cta")}
              onCta={() => setShowAdd(true)}
            />
          ) : (
            services.map(svc => (
              <ServiceRow
                key={svc.id}
                svc={svc}
                onEdit={() => { setEditing(svc); setShowAdd(true); }}
                onDelete={async () => { await api(`/hairdressers/me/services/${svc.id}`, { method: "DELETE" }); await load(); }}
                onToggle={async () => { await api(`/services/${svc.id}/toggle`, { method: "POST" }); await load(); }}
              />
            ))
          )}
        </View>
      </SafeScrollView>

      <ServiceEditor
        visible={showAdd}
        service={editing}
        styles_={styles}
        onClose={() => setShowAdd(false)}
        onSave={async (payload) => {
          await api("/hairdressers/me/services", { method: "POST", body: JSON.stringify(payload) });
          setShowAdd(false); await load();
        }}
      />
    </View>
  );
}

function ServiceRow({ svc, onEdit, onDelete, onToggle }: { svc: Service; onEdit: () => void; onDelete: () => void; onToggle: () => void }) {
  const { t } = useTranslation("pro_dashboard");
  const { t: tCommon } = useTranslation("common");
  return (
    <Card padding={spacing.md} style={{ marginBottom: spacing.sm, gap: spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, flexWrap: "wrap" }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, rowGap: 4 }}>
            <Text style={s.rowTitle} numberOfLines={2}>{svc.custom_name || svc.hairstyle_name || t("services.fallback_name")}</Text>
            {!svc.active && <Badge label={t("services.status_inactive")} tone="neutral" />}
            {svc.hair_included && <Badge label={t("services.hair_included_badge")} tone="brand" />}
          </View>
          <Text style={s.rowSub} numberOfLines={1}>
            {t("services.starting_at")} ${svc.price.toFixed(0)}
            {svc.price_max ? `–$${svc.price_max.toFixed(0)}` : ""} · {Math.round(svc.duration_minutes / 60 * 10) / 10}h
          </Text>
        </View>
        <Switch value={svc.active} onValueChange={onToggle} trackColor={{ true: colors.brand, false: colors.borderStrong }} />
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs }}>
        <Pressable testID={`svc-edit-${svc.id}`} onPress={onEdit} style={s.actionGhost}>
          <Feather name="edit-2" size={13} color={colors.brand} />
          <Text style={s.actionGhostText}>{tCommon("buttons.edit")}</Text>
        </Pressable>
        <Pressable testID={`svc-del-${svc.id}`} onPress={onDelete} style={s.actionGhost}>
          <Feather name="trash-2" size={13} color={colors.error} />
          <Text style={[s.actionGhostText, { color: colors.error }]}>{tCommon("buttons.remove")}</Text>
        </Pressable>
      </View>
    </Card>
  );
}

function ServiceEditor({ visible, service, styles_, onClose, onSave }: any) {
  const { t } = useTranslation("pro_dashboard");
  const [styleId, setStyleId] = useState<string>(service?.hairstyle_id || "");
  const [customName, setCustomName] = useState<string>(service?.custom_name || "");
  const [price, setPrice] = useState<string>(service?.price?.toString() || "");
  const [priceMax, setPriceMax] = useState<string>(service?.price_max?.toString() || "");
  const [duration, setDuration] = useState<string>(service?.duration_minutes?.toString() || "240");
  const [hairIncluded, setHairIncluded] = useState<boolean>(!!service?.hair_included);
  const [lengths, setLengths] = useState<string[]>(service?.hair_lengths || []);
  const [description, setDescription] = useState<string>(service?.description || "");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setStyleId(service?.hairstyle_id || "");
    setCustomName(service?.custom_name || "");
    setPrice(service?.price?.toString() || "");
    setPriceMax(service?.price_max?.toString() || "");
    setDuration(service?.duration_minutes?.toString() || "240");
    setHairIncluded(!!service?.hair_included);
    setLengths(service?.hair_lengths || []);
    setDescription(service?.description || "");
    setErr(null);
  }, [service, visible]);

  const submit = async () => {
    setErr(null);
    if (!styleId) return setErr(t("services.err_pick_style"));
    const p = parseFloat(price); if (!p || p <= 0) return setErr(t("services.err_starting_price"));
    const d = parseInt(duration, 10); if (!d || d < 15) return setErr(t("services.err_duration"));
    const pmx = priceMax ? parseFloat(priceMax) : undefined;
    if (pmx != null && pmx < p) return setErr(t("services.err_max_price"));
    try {
      await onSave({
        hairstyle_id: styleId,
        custom_name: customName || null,
        price: p,
        price_max: pmx,
        duration_minutes: d,
        hair_included: hairIncluded,
        hair_lengths: lengths,
        description: description || null,
        active: true,
      });
    } catch (e: any) { setErr(e?.userMessage || t("services.err_save_failed")); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <SafeScrollView topInset={false}>
          <View style={{ paddingTop: spacing.lg }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
              <ResponsiveHeading size={22}>{service ? t("services.edit_service") : t("services.new_service")}</ResponsiveHeading>
              <Pressable testID="svc-editor-close" onPress={onClose} hitSlop={12}>
                <Feather name="x" size={22} color={colors.onSurface} />
              </Pressable>
            </View>

            <Text style={s.label}>{t("services.field_hairstyle")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md }}>
              {styles_.map((st: any) => (
                <Pressable
                  key={st.id}
                  testID={`svc-style-${st.id}`}
                  onPress={() => setStyleId(st.id)}
                  style={[s.chip, styleId === st.id && s.chipActive]}
                >
                  <Text style={[s.chipText, styleId === st.id && { color: "#fff" }]} numberOfLines={1}>{st.name}</Text>
                </Pressable>
              ))}
            </View>

            <Field label={t("services.field_custom_name")} value={customName} onChange={setCustomName} placeholder={t("services.custom_name_placeholder")} />

            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Field label={t("services.field_starting_price")} value={price} onChange={setPrice} placeholder="180" numeric />
              </View>
              <View style={{ flex: 1 }}>
                <Field label={t("services.field_max_price")} value={priceMax} onChange={setPriceMax} placeholder="220" numeric />
              </View>
            </View>

            <Field label={t("services.field_duration")} value={duration} onChange={setDuration} placeholder="240" numeric />

            <Text style={s.label}>{t("services.field_hair_lengths")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md }}>
              {LENGTHS.map(L => {
                const on = lengths.includes(L);
                return (
                  <Pressable
                    key={L}
                    testID={`svc-len-${L}`}
                    onPress={() => setLengths(prev => on ? prev.filter(x => x !== L) : [...prev, L])}
                    style={[s.chip, on && s.chipActive]}
                  >
                    <Text style={[s.chipText, on && { color: "#fff" }]}>{t(`services.lengths.${LENGTH_KEYS[L]}`)}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>{t("services.field_hair_included")}</Text>
                <Text style={s.help}>{t("services.hair_included_help")}</Text>
              </View>
              <Switch value={hairIncluded} onValueChange={setHairIncluded} trackColor={{ true: colors.brand, false: colors.borderStrong }} />
            </View>

            <Field label={t("services.field_notes")} value={description} onChange={setDescription} placeholder={t("services.notes_placeholder")} multiline />

            {err ? <Text style={s.err}>{err}</Text> : null}
            <BottomCTA testID="svc-editor-save" label={service ? t("services.save_changes") : t("services.create_service")} onPress={submit} />
          </View>
        </SafeScrollView>
      </View>
    </Modal>
  );
}

function Field({ label, value, onChange, placeholder, numeric, multiline }: any) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={numeric ? "decimal-pad" : "default"}
        multiline={multiline}
        style={[s.input, multiline && { minHeight: 80, textAlignVertical: "top", paddingTop: spacing.md }]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  sub: { color: colors.onSurfaceTertiary, fontFamily: font.body, fontSize: 13, marginTop: spacing.sm, lineHeight: 18 },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.lg, marginBottom: spacing.md, gap: spacing.md, flexWrap: "wrap" },
  metaText: { fontFamily: font.bodyMed, color: colors.onSurfaceTertiary, fontSize: 12 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brand, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.pill, minHeight: 36 },
  addText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 12 },
  rowTitle: { fontFamily: font.bodyBold, color: colors.onSurface, fontSize: 15, flexShrink: 1 },
  rowSub: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 4 },
  actionGhost: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: spacing.sm },
  actionGhostText: { fontFamily: font.bodyMed, color: colors.brand, fontSize: 12 },
  label: { fontFamily: font.bodyBold, color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 1.5, marginBottom: spacing.xs },
  help: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontFamily: font.body, color: colors.onSurface, minHeight: 48 },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.borderStrong, minHeight: 36, justifyContent: "center", maxWidth: 200 },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontFamily: font.bodyMed, color: colors.onSurface, fontSize: 12 },
  err: { color: colors.error, fontFamily: font.body, marginTop: spacing.sm, fontSize: 13 },
});
