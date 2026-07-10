import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, font, radii } from "@/src/theme";

// The Welcome/Splash. Role choice, not a login form.
export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceInverse }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ height: 520 }}>
          <Image source={{ uri: "https://images.unsplash.com/photo-1592520113018-180c8bc831c9?w=1000&q=85" }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.9)"]} style={StyleSheet.absoluteFill} />
          <View style={{ flex: 1, padding: spacing.xl, paddingTop: insets.top + spacing.lg, justifyContent: "flex-end" }}>
            <Text style={s.eyebrow}>BRAIDSCOMMUNITY</Text>
            <Text style={s.hero}>Where braids{"\n"}are art.</Text>
            <Text style={s.sub}>Discover braid artists in your city, book a chair, pay at the counter.</Text>
          </View>
        </View>

        <View style={{ padding: spacing.xl, gap: spacing.md, backgroundColor: colors.surfaceInverse }}>
          <Text style={s.chooseTitle}>How do you want to start?</Text>

          <Pressable testID="welcome-customer" onPress={() => router.push("/login?role=customer")} style={s.roleCard}>
            <View style={{ flex: 1 }}>
              <Text style={s.roleTitle}>I'm a Customer</Text>
              <Text style={s.roleDesc}>Find braid artists near you and book your next appointment.</Text>
            </View>
            <Text style={s.roleArrow}>→</Text>
          </Pressable>

          <Pressable testID="welcome-braider" onPress={() => router.push("/register?role=hairdresser")} style={[s.roleCard, s.roleCardBraider]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.roleTitle, { color: "#fff" }]}>I'm a Braider</Text>
              <Text style={[s.roleDesc, { color: "#F9F6F0" }]}>Show your work, take bookings, get paid in person.</Text>
            </View>
            <Text style={[s.roleArrow, { color: "#fff" }]}>→</Text>
          </Pressable>

          <Pressable testID="welcome-existing" onPress={() => router.push("/login")} style={{ padding: spacing.md, alignItems: "center", marginTop: spacing.md }}>
            <Text style={s.existingLink}>Already have an account? <Text style={{ fontFamily: font.bodyBold, color: "#fff" }}>Sign in</Text></Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  eyebrow: { color: "#E8CBBF", letterSpacing: 3, fontSize: 11, fontFamily: font.bodyMed, marginBottom: spacing.sm },
  hero: { color: "#F9F6F0", fontFamily: font.display, fontSize: 48, lineHeight: 52 },
  sub: { color: "#F9F6F0", opacity: 0.85, fontFamily: font.body, fontSize: 15, marginTop: spacing.md, maxWidth: 320 },
  chooseTitle: { color: "#F9F6F0", fontFamily: font.displayIt, fontSize: 20, marginTop: spacing.lg, marginBottom: spacing.md },
  roleCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, backgroundColor: "#F9F6F0", borderRadius: radii.md },
  roleCardBraider: { backgroundColor: colors.brand },
  roleTitle: { fontFamily: font.display, fontSize: 22, color: colors.onSurface },
  roleDesc: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 13, marginTop: 2 },
  roleArrow: { fontFamily: font.display, fontSize: 28, color: colors.brand },
  existingLink: { color: "#F9F6F0", opacity: 0.75, fontFamily: font.body, fontSize: 14 },
});
