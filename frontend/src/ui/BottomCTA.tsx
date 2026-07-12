import React from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radii, spacing } from "@/src/theme";

/**
 * BottomCTA
 * - Sticky bottom container that always respects the home indicator +
 *   Android gesture nav bar. Use as the last item in a screen.
 * - Guarantees min touch target 48px and full-width primary button.
 */
type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary" | "outline";
  helper?: string;
  testID?: string;
  sticky?: boolean;
};

export function BottomCTA({ label, onPress, disabled, loading, variant = "primary", helper, testID, sticky = false }: Props) {
  const insets = useSafeAreaInsets();
  const bg = variant === "primary" ? colors.brand : variant === "secondary" ? colors.surfaceInverse : "transparent";
  const fg = variant === "outline" ? colors.onSurface : "#fff";
  return (
    <View style={[styles.wrap, sticky && styles.sticky, { paddingBottom: Math.max(insets.bottom + spacing.sm, spacing.lg) }]}>
      <Pressable
        testID={testID}
        onPress={disabled || loading ? undefined : onPress}
        style={({ pressed }) => [
          styles.btn,
          { backgroundColor: bg, borderColor: variant === "outline" ? colors.borderStrong : bg },
          (disabled || loading) && styles.disabled,
          pressed && !disabled && { opacity: 0.85 },
        ]}
      >
        {loading ? <ActivityIndicator color={fg} /> : (
          <Text numberOfLines={1} style={[styles.label, { color: fg }]}>{label}</Text>
        )}
      </Pressable>
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: spacing.md },
  sticky: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider, paddingHorizontal: spacing.xl },
  btn: { minHeight: 52, borderRadius: radii.md, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
  disabled: { opacity: 0.4 },
  label: { fontFamily: font.bodyBold, fontSize: 15, letterSpacing: 0.3 },
  helper: { textAlign: "center", marginTop: spacing.sm, color: colors.onSurfaceTertiary, fontFamily: font.body, fontSize: 12 },
});
