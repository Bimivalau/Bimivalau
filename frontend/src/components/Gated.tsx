import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, font, radii, spacing } from "@/src/theme";
import { useEntitlements } from "@/src/entitlements";
import { PaywallSheet, type PaywallCtx } from "./PaywallSheet";

/**
 * <Gated> — wraps a feature. If the user has the entitlement, renders children.
 * Otherwise renders an elegant locked card with an "Unlock" button that opens
 * the PaywallSheet.
 *
 * Never a dead-end: the fallback is always a functional path forward.
 */
type Props = {
  feature: string;
  targetPlan: PaywallCtx["targetPlan"];
  eyebrow?: string;
  title?: string;
  value?: string;
  children: React.ReactNode;
  lockedTitle?: string;
  lockedMessage?: string;
};

export function Gated({ feature, targetPlan, eyebrow, title, value, children, lockedTitle, lockedMessage }: Props) {
  const { has, loading } = useEntitlements();
  const [open, setOpen] = useState(false);

  if (loading) return null;
  if (has(feature)) return <>{children}</>;

  return (
    <View>
      <View style={s.lock} testID={`locked-${feature}`}>
        <View style={s.icon}><Feather name="lock" size={16} color={colors.brand} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title} numberOfLines={2}>{lockedTitle || title || "Premium feature"}</Text>
          <Text style={s.msg} numberOfLines={3}>{lockedMessage || value || "Upgrade to unlock."}</Text>
        </View>
        <Pressable testID={`unlock-${feature}`} onPress={() => setOpen(true)} style={s.cta} accessibilityRole="button" accessibilityLabel="Unlock this feature">
          <Text style={s.ctaText}>Unlock</Text>
        </Pressable>
      </View>
      <PaywallSheet visible={open} onClose={() => setOpen(false)} ctx={{ targetPlan, eyebrow, title, value }} />
    </View>
  );
}

const s = StyleSheet.create({
  lock: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.brand, backgroundColor: colors.brandTertiary, borderRadius: radii.md },
  icon: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  title: { fontFamily: font.bodyBold, fontSize: 14, color: colors.brand, flexShrink: 1 },
  msg: { fontFamily: font.body, fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2, lineHeight: 16 },
  cta: { minHeight: 36, borderRadius: radii.pill, backgroundColor: colors.brand, paddingHorizontal: spacing.md, alignItems: "center", justifyContent: "center" },
  ctaText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 12 },
});
