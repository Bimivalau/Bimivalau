import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors, font } from "@/src/theme";

// Sprint 2 tab bar: Home · Discover · Bookings · Profile
// Messages tab intentionally omitted — messaging arrives after booking is mature.
export default function TabsLayout() {
  const { t } = useTranslation("navigation");
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.divider, borderTopWidth: 1, height: 74, paddingTop: 8, paddingBottom: 18 },
        tabBarLabelStyle: { fontFamily: font.bodyMed, fontSize: 11, letterSpacing: 0.3 },
      }}
    >
      <Tabs.Screen name="home" options={{ title: t("tabs.home"), tabBarIcon: ({ color, size }) => <Feather name="home" size={size - 2} color={color} /> }} />
      <Tabs.Screen name="search" options={{ title: t("tabs.discover"), tabBarIcon: ({ color, size }) => <Feather name="compass" size={size - 2} color={color} /> }} />
      <Tabs.Screen name="bookings" options={{ title: t("tabs.bookings"), tabBarIcon: ({ color, size }) => <Feather name="calendar" size={size - 2} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: t("tabs.profile"), tabBarIcon: ({ color, size }) => <Feather name="user" size={size - 2} color={color} /> }} />
    </Tabs>
  );
}
