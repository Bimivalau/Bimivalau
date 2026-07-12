import React from "react";
import { View, Text, ActivityIndicator, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, font, radii, spacing } from "@/src/theme";

/**
 * LoadingState / EmptyState / ErrorState
 * Centered, safe layouts with consistent spacing.
 */
export function LoadingState({ label, testID }: { label?: string; testID?: string }) {
  return (
    <View testID={testID || "loading-state"} style={styles.center}>
      <ActivityIndicator color={colors.brand} />
      {label ? <Text style={styles.helper}>{label}</Text> : null}
    </View>
  );
}

export function EmptyState({
  icon = "inbox",
  title,
  message,
  ctaLabel,
  onCta,
  testID,
}: {
  icon?: any;
  title: string;
  message?: string;
  ctaLabel?: string;
  onCta?: () => void;
  testID?: string;
}) {
  return (
    <View testID={testID || "empty-state"} style={styles.center}>
      <View style={styles.iconWrap}>
        <Feather name={icon} size={26} color={colors.brand} />
      </View>
      <Text style={styles.title} numberOfLines={2}>{title}</Text>
      {message ? <Text style={styles.helper}>{message}</Text> : null}
      {ctaLabel && onCta ? (
        <Pressable testID="empty-state-cta" onPress={onCta} style={styles.cta}>
          <Text style={styles.ctaLabel}>{ctaLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  testID,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  testID?: string;
}) {
  return (
    <View testID={testID || "error-state"} style={styles.center}>
      <View style={[styles.iconWrap, { backgroundColor: "#F7DDDF" }]}>
        <Feather name="alert-circle" size={26} color={colors.error} />
      </View>
      <Text style={styles.title} numberOfLines={2}>{title}</Text>
      {message ? <Text style={styles.helper}>{message}</Text> : null}
      {onRetry ? (
        <Pressable testID="error-state-retry" onPress={onRetry} style={styles.cta}>
          <Text style={styles.ctaLabel}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl },
  iconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  title: { marginTop: spacing.md, fontFamily: font.bodyBold, color: colors.onSurface, fontSize: 16, textAlign: "center" },
  helper: { marginTop: spacing.xs, fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 13, textAlign: "center", lineHeight: 18, maxWidth: 320 },
  cta: { marginTop: spacing.lg, backgroundColor: colors.brand, paddingHorizontal: spacing.xl, minHeight: 44, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  ctaLabel: { color: "#fff", fontFamily: font.bodyBold, fontSize: 14 },
});
