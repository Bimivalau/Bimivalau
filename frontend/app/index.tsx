import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSession } from "@/src/session";
import { colors } from "@/src/theme";

export default function Index() {
  const { user, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (user.role === "hairdresser") router.replace("/pro/dashboard");
    else router.replace("/(tabs)/home");
  }, [user, loading, router]);

  return (
    <View testID="splash-screen" style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={colors.brand} />
    </View>
  );
}
