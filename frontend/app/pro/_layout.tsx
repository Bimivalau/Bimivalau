import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { colors, font } from "@/src/theme";

/**
 * Professional tabs — the permanent workspace after onboarding.
 *
 * Tabs: Dashboard · Bookings · Growth · My Studio
 *
 * Non-tab screens (onboarding, availability, portfolio, verification, services,
 * studio-info) are hidden from the tab bar via `href: null`. They still route
 * but appear as pushed screens; the tab bar remains visible so the pro always
 * knows where they are in the app.
 *
 * The `onboarding` route additionally hides the tab bar entirely because it's
 * a one-time first-run experience.
 */
export default function ProTabsLayout() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("navigation");
  const tabHeight = 56 + Math.max(insets.bottom, Platform.OS === "ios" ? 8 : 6);
  return (
    <Tabs
      initialRouteName="dashboard"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.divider,
          borderTopWidth: 1,
          height: tabHeight,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, Platform.OS === "ios" ? 4 : 6),
        },
        tabBarLabelStyle: { fontFamily: font.bodyMed, fontSize: 11, letterSpacing: 0.3 },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: t("tabs.schedule"),
          tabBarIcon: ({ color, size }) => <Feather name="calendar" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: t("tabs.bookings"),
          tabBarIcon: ({ color, size }) => <Feather name="clipboard" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="studio"
        options={{
          title: t("tabs.profile"),
          tabBarIcon: ({ color, size }) => <Feather name="user" size={size - 2} color={color} />,
        }}
      />
      {/* Hidden routes — reachable via push, not shown as tabs. */}
      <Tabs.Screen name="onboarding" options={{ href: null, tabBarStyle: { display: "none" } }} />
      <Tabs.Screen name="availability" options={{ href: null }} />
      <Tabs.Screen name="portfolio" options={{ href: null }} />
      <Tabs.Screen name="verification" options={{ href: null }} />
      <Tabs.Screen name="services" options={{ href: null }} />
      <Tabs.Screen name="studio-info" options={{ href: null }} />
      <Tabs.Screen name="growth" options={{ href: null }} />
    </Tabs>
  );
}
