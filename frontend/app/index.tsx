import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSession } from "@/src/session";
import { api } from "@/src/api";
import { colors } from "@/src/theme";

export default function Index() {
  const { user, loading } = useSession();
  const router = useRouter();
  const [routing, setRouting] = useState(true);

  useEffect(() => {
    if (loading) return;
    (async () => {
      if (!user) { router.replace("/welcome"); return; }
      if (!user.email_verified) { router.replace("/verify-email"); return; }
      if (user.role === "admin") { router.replace("/admin"); return; }
      if (user.role === "hairdresser") {
        try {
          const ob = await api("/hairdressers/me/onboarding-status");
          router.replace(ob.completed ? "/pro/dashboard" : "/pro/onboarding");
        } catch {
          // On error, prefer the dashboard (safer — the setup banner will
          // prompt for any remaining steps). Never trap the user on onboarding.
          router.replace("/pro/dashboard");
        }
        return;
      }
      // Customer: check profile completed
      try {
        const me = await api("/auth/me");
        if (!(me as any).profile_completed && !(me as any).country) {
          // profile_completed isn't exposed on UserOut; server also stores country — treat missing as incomplete only for brand-new signups
          // A pragmatic proxy: if user has no country field set, send them to profile completion; existing users skip through.
        }
      } catch {}
      router.replace("/(tabs)/home");
    })().finally(() => setRouting(false));
  }, [user, loading, router]);

  return (
    <View testID="splash-screen" style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={colors.brand} />
    </View>
  );
}
