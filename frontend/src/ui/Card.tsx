import React from "react";
import { View, Pressable, StyleSheet, ViewStyle, PressableProps } from "react-native";
import { colors, radii, spacing } from "@/src/theme";

/**
 * Card
 * - Flexible container. Wraps children in flexShrink so long text never
 *   pushes badges/icons off-screen.
 * - Padding scales via prop; default is 12 which matches spacing.md.
 * - If `onPress` is provided, renders as Pressable with hitSlop.
 */
type Props = {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  padding?: number;
  onPress?: PressableProps["onPress"];
  testID?: string;
  disabled?: boolean;
  variant?: "default" | "elevated" | "outline" | "tinted";
};

export function Card({ children, style, padding = spacing.md, onPress, testID, disabled, variant = "default" }: Props) {
  const variantStyle =
    variant === "elevated" ? styles.elevated :
    variant === "outline" ? styles.outline :
    variant === "tinted" ? styles.tinted :
    styles.default;
  const content = (
    <View style={[styles.base, variantStyle, { padding }, style, disabled ? { opacity: 0.5 } : null]}>
      {children}
    </View>
  );
  if (onPress) {
    return (
      <Pressable
        testID={testID}
        hitSlop={4}
        onPress={disabled ? undefined : onPress}
        android_ripple={{ color: "rgba(0,0,0,0.04)" }}
        style={({ pressed }) => [pressed && { opacity: 0.85 }]}
      >
        {content}
      </Pressable>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  base: { borderRadius: radii.lg, backgroundColor: colors.surface, minHeight: 44 },
  default: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  elevated: {
    backgroundColor: colors.surface,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  outline: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.borderStrong },
  tinted: { backgroundColor: colors.surfaceSecondary },
});
