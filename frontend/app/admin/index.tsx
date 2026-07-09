import { useEffect } from "react";
import { useRouter } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useSession } from "@/src/session";
import { colors } from "@/src/theme";

export default function AdminIndex() {
  const { user, loading } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (user.role !== "admin") router.replace("/");
    else router.replace("/admin/verifications");
  }, [user, loading, router]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={colors.brand} />
    </View>
  );
}
