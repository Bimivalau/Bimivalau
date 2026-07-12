import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/theme";
import { useResponsive } from "./responsive";

/**
 * PageContainer
 * - Provides consistent horizontal padding that scales down on narrow phones.
 * - Applies top safe-area padding automatically (unless disabled).
 * - Caps content width on wide devices so text never over-stretches.
 * Use this as the outermost wrapper INSIDE a ScrollView (or on its own).
 */
type Props = {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  topInset?: boolean;
  paddingTop?: number;
  paddingHorizontal?: number;
  background?: string;
  testID?: string;
};

export function PageContainer({ children, style, topInset = true, paddingTop, paddingHorizontal, background, testID }: Props) {
  const insets = useSafeAreaInsets();
  const { pagePad, contentMaxWidth } = useResponsive();
  return (
    <View testID={testID} style={[styles.root, background ? { backgroundColor: background } : null]}>
      <View
        style={[
          styles.inner,
          {
            paddingTop: (topInset ? insets.top : 0) + (paddingTop ?? 0),
            paddingHorizontal: paddingHorizontal ?? pagePad,
            maxWidth: contentMaxWidth,
          },
          style,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, width: "100%", alignItems: "center" },
  inner: { width: "100%", flexGrow: 1 },
});
