import React from "react";
import { ScrollView, ScrollViewProps, StyleSheet, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "@/src/theme";
import { useResponsive } from "./responsive";

/**
 * SafeScrollView
 * - Applies horizontal padding (scaled by useResponsive).
 * - Adds bottom padding = safe-area + extra so buttons/cards are never
 *   hidden behind Android gesture bar or iOS home indicator.
 * - Caps content maxWidth for wide devices.
 * - Adds top safe-area padding by default.
 */
type Props = ScrollViewProps & {
  children: React.ReactNode;
  contentStyle?: ViewStyle | ViewStyle[];
  topInset?: boolean;
  extraBottom?: number;
  paddingTop?: number;
  paddingHorizontal?: number;
  background?: string;
  keyboardOffset?: number;
};

export function SafeScrollView({
  children,
  contentStyle,
  topInset = true,
  extraBottom = spacing.xxxl,
  paddingTop,
  paddingHorizontal,
  background,
  keyboardOffset,
  ...rest
}: Props) {
  const insets = useSafeAreaInsets();
  const { pagePad, contentMaxWidth } = useResponsive();
  return (
    <ScrollView
      style={[styles.root, background ? { backgroundColor: background } : null]}
      contentContainerStyle={[
        {
          paddingTop: (topInset ? insets.top : 0) + (paddingTop ?? 0),
          paddingBottom: insets.bottom + extraBottom + (keyboardOffset ?? 0),
          paddingHorizontal: paddingHorizontal ?? pagePad,
          alignSelf: "center",
          width: "100%",
          maxWidth: contentMaxWidth,
        },
        contentStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      {...rest}
    >
      <View>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
});
