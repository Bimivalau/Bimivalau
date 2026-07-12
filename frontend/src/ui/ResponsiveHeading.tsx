import React from "react";
import { Text, TextProps, StyleSheet } from "react-native";
import { colors, font } from "@/src/theme";
import { useResponsive } from "./responsive";

/**
 * ResponsiveHeading
 * - Auto-scales down on narrow devices.
 * - Clamps to a minimum readable size.
 * - Uses a display font by default; caller can override.
 * - Uses `numberOfLines` intentionally — never truncate for headings.
 */
type Props = TextProps & {
  size?: number;
  color?: string;
  weight?: "display" | "body" | "bodyMed" | "bodyBold";
  children: React.ReactNode;
};

export function ResponsiveHeading({ size = 32, color = colors.onSurface, weight = "display", style, children, ...rest }: Props) {
  const { scaleFont, fontScale } = useResponsive();
  const scaled = Math.max(20, scaleFont(size));
  const lineHeight = Math.round(scaled * 1.15);
  return (
    <Text
      allowFontScaling
      maxFontSizeMultiplier={1.3}
      style={[
        styles.base,
        { fontFamily: font[weight], color, fontSize: scaled / fontScale, lineHeight: lineHeight / fontScale },
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: { flexShrink: 1, flexWrap: "wrap" },
});
