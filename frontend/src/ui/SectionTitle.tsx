import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { colors, font, spacing } from "@/src/theme";

/**
 * SectionTitle
 * - Small eyebrow-style section header.
 * - Optional right-aligned action label (e.g. "See all").
 */
type Props = {
  title: string;
  action?: string;
  onActionPress?: () => void;
  style?: ViewStyle | ViewStyle[];
  testID?: string;
};

export function SectionTitle({ title, action, onActionPress, style, testID }: Props) {
  return (
    <View testID={testID} style={[styles.row, style]}>
      <Text style={styles.title} numberOfLines={2}>{title}</Text>
      {action ? (
        <Text onPress={onActionPress} style={styles.action}>{action}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: spacing.md, marginTop: spacing.xl, marginBottom: spacing.sm },
  title: { flex: 1, flexShrink: 1, fontFamily: font.bodyBold, color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" },
  action: { fontFamily: font.bodyMed, color: colors.brand, fontSize: 12 },
});
