import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { colors, font, radii } from "@/src/theme";

/**
 * Badge
 * - Small chip label. Always fits inside its parent (uses flexShrink).
 * - `variant` picks the visual treatment. `tone` picks the accent color.
 * - Prefer `size="sm"` for inline badges on narrow screens.
 */
type Tone = "brand" | "success" | "warning" | "error" | "neutral" | "info";
type Variant = "solid" | "soft" | "outline";

type Props = {
  label: string;
  tone?: Tone;
  variant?: Variant;
  size?: "sm" | "md";
  style?: ViewStyle | ViewStyle[];
  testID?: string;
};

const TONE = {
  brand:   { fg: colors.brand, bg: colors.brandTertiary, border: colors.brand },
  success: { fg: colors.success, bg: "#DDEBE0", border: colors.success },
  warning: { fg: colors.warning, bg: "#FFF3DA", border: colors.warning },
  error:   { fg: colors.error, bg: "#F7DDDF", border: colors.error },
  neutral: { fg: colors.onSurfaceTertiary, bg: colors.surfaceSecondary, border: colors.borderStrong },
  info:    { fg: colors.info, bg: "#E0E7EB", border: colors.info },
};

export function Badge({ label, tone = "neutral", variant = "soft", size = "sm", style, testID }: Props) {
  const t = TONE[tone];
  const bg = variant === "solid" ? t.fg : variant === "outline" ? "transparent" : t.bg;
  const fg = variant === "solid" ? "#fff" : t.fg;
  const borderColor = variant === "outline" ? t.border : "transparent";
  return (
    <View testID={testID} style={[
      styles.base,
      size === "sm" ? styles.sm : styles.md,
      { backgroundColor: bg, borderColor, borderWidth: variant === "outline" ? 1 : 0 },
      style,
    ]}>
      <Text numberOfLines={1} allowFontScaling={false} style={[styles.text, size === "sm" ? styles.textSm : styles.textMd, { color: fg }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radii.pill, alignSelf: "flex-start", flexShrink: 1, maxWidth: "100%" },
  sm: { paddingHorizontal: 8, paddingVertical: 2, minHeight: 18 },
  md: { paddingHorizontal: 10, paddingVertical: 4, minHeight: 22 },
  text: { fontFamily: font.bodyBold, letterSpacing: 1 },
  textSm: { fontSize: 9 },
  textMd: { fontSize: 11 },
});
