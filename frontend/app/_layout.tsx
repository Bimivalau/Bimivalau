import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { SessionProvider } from "@/src/session";
import { RootErrorBoundary } from "@/src/components/RootErrorBoundary";
import { EntitlementsProvider } from "@/src/entitlements";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);
  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <RootErrorBoundary>
          <SessionProvider>
            <EntitlementsProvider>
              {/* Dark status-bar icons on our light surface. Auto-updates per screen if needed. */}
              <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: "#FCFAF8" },
                  animation: "slide_from_right",
                }}
              />
            </EntitlementsProvider>
          </SessionProvider>
        </RootErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
