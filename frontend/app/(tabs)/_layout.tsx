import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { colors, font } from "@/src/theme";

export default function TabsLayout() {
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
      <Tabs.Screen name="home" options={{ title: "Discover", tabBarIcon: ({ color, size }) => <Feather name="grid" size={size - 2} color={color} /> }} />
      <Tabs.Screen name="search" options={{ title: "Search", tabBarIcon: ({ color, size }) => <Feather name="search" size={size - 2} color={color} /> }} />
      <Tabs.Screen name="bookings" options={{ title: "Bookings", tabBarIcon: ({ color, size }) => <Feather name="calendar" size={size - 2} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color, size }) => <Feather name="user" size={size - 2} color={color} /> }} />
    </Tabs>
  );
}
