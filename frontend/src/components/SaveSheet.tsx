/**
 * Bottom sheet — Save a style to one or more collections.
 * Simple modal presentation for now (no reanimated dependency).
 */
import { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, StyleSheet, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, font, radii } from "@/src/theme";

interface Props {
  visible: boolean;
  hairstyleId: string;
  hairstyleName?: string;
  onClose: () => void;
  onSaved?: () => void;
}

interface Collection { id: string; name: string; saves_count?: number; cover?: string | null; is_default?: boolean; }

export default function SaveSheet({ visible, hairstyleId, hairstyleName, onClose, onSaved }: Props) {
  const [cols, setCols] = useState<Collection[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSelected(new Set());
    api("/collections/me").then((c: Collection[]) => {
      setCols(c);
      const fav = c.find((x) => x.name === "Favorites");
      if (fav) setSelected(new Set([fav.id]));
    });
  }, [visible]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const create = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const c: Collection = await api("/collections/me", { method: "POST", body: JSON.stringify({ name: newName.trim() }) });
      setCols((prev) => [...prev, c]);
      setSelected((s) => new Set([...s, c.id]));
      setNewName("");
    } catch {}
    finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true);
    try {
      await api("/style-saves", {
        method: "POST",
        body: JSON.stringify({ hairstyle_id: hairstyleId, collection_ids: [...selected] }),
      });
      onSaved?.();
      onClose();
    } catch {} finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.handle} />
        <Text style={s.title}>Save to inspiration</Text>
        {hairstyleName && <Text style={s.sub}>&quot;{hairstyleName}&quot;</Text>}

        <ScrollView style={{ maxHeight: 320, marginTop: spacing.md }}>
          {cols.map((c) => {
            const on = selected.has(c.id);
            return (
              <Pressable key={c.id} testID={`col-${c.id}`} onPress={() => toggle(c.id)} style={s.row}>
                <View style={s.rowIcon}>
                  <Feather name={c.name === "Favorites" ? "heart" : "folder"} size={16} color={colors.onSurfaceTertiary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowName}>{c.name}</Text>
                  <Text style={s.rowMeta}>{c.saves_count || 0} styles</Text>
                </View>
                <View style={[s.check, on && s.checkOn]}>
                  {on && <Feather name="check" size={14} color="#fff" />}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={s.createRow}>
          <TextInput
            testID="save-new-name"
            value={newName}
            onChangeText={setNewName}
            placeholder="Create a new board…"
            placeholderTextColor={colors.muted}
            style={s.input}
          />
          <Pressable disabled={!newName.trim() || busy} onPress={create} style={[s.createBtn, (!newName.trim() || busy) && { opacity: 0.5 }]}>
            <Feather name="plus" size={16} color={colors.brand} />
          </Pressable>
        </View>

        <Pressable testID="save-confirm" onPress={save} disabled={busy || selected.size === 0} style={[s.confirm, (busy || selected.size === 0) && { opacity: 0.5 }]}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.confirmText}>Save to {selected.size || 0} board{selected.size === 1 ? "" : "s"}</Text>}
        </Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.xl, paddingBottom: spacing.xxl },
  handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: "center", marginBottom: spacing.md },
  title: { fontFamily: font.display, fontSize: 22, color: colors.onSurface, textAlign: "center" },
  sub: { fontFamily: font.body, fontSize: 12, color: colors.onSurfaceTertiary, textAlign: "center", marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.md, gap: spacing.md, borderBottomWidth: 1, borderColor: colors.divider },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  rowName: { fontFamily: font.bodyMed, fontSize: 14, color: colors.onSurface },
  rowMeta: { fontFamily: font.body, fontSize: 11, color: colors.onSurfaceTertiary, marginTop: 1 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  createRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.md, gap: spacing.sm, borderBottomWidth: 1, borderColor: colors.borderStrong, paddingBottom: spacing.sm },
  input: { flex: 1, fontFamily: font.body, fontSize: 14, color: colors.onSurface, paddingVertical: spacing.sm },
  createBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTertiary },
  confirm: { marginTop: spacing.lg, backgroundColor: colors.brand, padding: spacing.md, borderRadius: radii.md, alignItems: "center" },
  confirmText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 15 },
});
