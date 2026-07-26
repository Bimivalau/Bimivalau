import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { LogBox, StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { I18nextProvider } from "react-i18next";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { SessionProvider } from "@/src/session";
import { RootErrorBoundary } from "@/src/components/RootErrorBoundary";
import i18n, { initI18n } from "@/src/i18n";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const [i18nReady, setI18nReady] = useState(false);
  useEffect(() => {
    initI18n().finally(() => setI18nReady(true));
  }, []);
  useEffect(() => {
    if ((loaded || error) && i18nReady) SplashScreen.hideAsync();
  }, [loaded, error, i18nReady]);
  if ((!loaded && !error) || !i18nReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <RootErrorBoundary>
          <I18nextProvider i18n={i18n}>
            <SessionProvider>
              {/* Dark status-bar icons on our light surface. Auto-updates per screen if needed. */}
              <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: "#FCFAF8" },
                  animation: "slide_from_right",
                }}
              />
            </SessionProvider>
          </I18nextProvider>
        </RootErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
