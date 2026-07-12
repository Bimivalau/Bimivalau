import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, spacing, font, radii } from "@/src/theme";

/**
 * Global error boundary. Catches uncaught render errors and shows a friendly
 * "Something went wrong" screen with Retry — instead of a white screen or a
 * red RN error stack in production.
 */
type S = { hasError: boolean; err?: any };

export class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, S> {
  state: S = { hasError: false };
  static getDerivedStateFromError(err: any) { return { hasError: true, err }; }
  componentDidCatch(err: any, info: any) {
    // eslint-disable-next-line no-console
    console.warn("Root error boundary caught:", err, info?.componentStack);
  }
  reset = () => this.setState({ hasError: false, err: undefined });
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.wrap}>
        <View style={styles.iconWrap}>
          <Feather name="alert-triangle" size={26} color={colors.error} />
        </View>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.msg} numberOfLines={4}>
          BraidsCommunity hit an unexpected error. We&apos;re on it.
        </Text>
        <Pressable onPress={this.reset} style={styles.btn} accessibilityRole="button" accessibilityLabel="Try again">
          <Text style={styles.btnText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, paddingHorizontal: spacing.xl },
  iconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#F7DDDF", alignItems: "center", justifyContent: "center" },
  title: { marginTop: spacing.md, fontFamily: font.bodyBold, color: colors.onSurface, fontSize: 18, textAlign: "center" },
  msg: { marginTop: spacing.sm, fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 13, textAlign: "center", lineHeight: 18, maxWidth: 320 },
  btn: { marginTop: spacing.xl, backgroundColor: colors.brand, paddingHorizontal: spacing.xxl, minHeight: 48, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 14 },
});
