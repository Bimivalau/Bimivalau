/**
 * StyleCard — the signature card of the BraidsCommunity home experience.
 * Two variants:
 *   - variant="feature"  → large portrait card for hero sections (240x340)
 *   - variant="compact"  → smaller card for row scrolls        (200x280)
 *
 * Displays: image, style name, avg price, avg duration, difficulty,
 * hair length, trending badge, nearby pros count, saves count, bookmark & share.
 */
import { View, Text, Pressable, StyleSheet, Share } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { colors, spacing, font, radii } from "@/src/theme";
import { cldTransform } from "@/src/utils/cloudinary";

export type Hairstyle = {
  id: string;
  name: string;
  category?: string;
  cover_photo: string;
  avg_price: number;
  avg_duration_min: number;
  difficulty?: string;
  hair_length?: string;
  tags?: string[];
  style_score?: number;
  saves_count?: number;
  nearby_pros_count?: number;
  is_saved?: boolean;
};

interface Props {
  style: Hairstyle;
  variant?: "feature" | "compact" | "wide";
  onPress: () => void;
  onSave?: () => void;
  onShare?: () => void;
}

const durationLabel = (m: number) => {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h}h ${r}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

export default function StyleCard({ style, variant = "feature", onPress, onSave, onShare }: Props) {
  const isTrending = (style.tags || []).includes("trending");
  const w = variant === "feature" ? 240 : variant === "wide" ? 300 : 172;
  const h = variant === "feature" ? 340 : variant === "wide" ? 200 : 240;
  const img = cldTransform(style.cover_photo, { w: w * 2, h: h * 2, c: "fill", g: "auto", q: "auto", f: "auto" });

  const share = async () => {
    if (onShare) return onShare();
    try {
      await Share.share({ message: `Check out "${style.name}" on BraidsCommunity 💫`, title: style.name });
    } catch {}
  };

  return (
    <Pressable testID={`style-card-${style.id}`} onPress={onPress} style={[s.card, { width: w }]}>
      <View style={[s.image, { height: h }]}>
        <Image source={{ uri: img }} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={200} />
        {/* Top badges */}
        <View style={s.topRow}>
          {isTrending && (
            <View style={s.badge}>
              <Feather name="trending-up" size={11} color="#fff" />
              <Text style={s.badgeText}>TRENDING</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          <Pressable hitSlop={8} onPress={onSave} style={s.iconBtn}>
            <Feather name={style.is_saved ? "bookmark" : "bookmark"} size={16} color={style.is_saved ? colors.brand : "#fff"} />
          </Pressable>
        </View>

        {/* Bottom gradient info */}
        <View style={s.gradient} />
        <View style={s.bottomRow}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={s.name}>{style.name}</Text>
            <View style={s.metaRow}>
              <Text style={s.meta}>${Math.round(style.avg_price)}</Text>
              <Text style={s.metaDot}>•</Text>
              <Text style={s.meta}>{durationLabel(style.avg_duration_min)}</Text>
              {style.difficulty && (
                <>
                  <Text style={s.metaDot}>•</Text>
                  <Text style={s.meta}>{style.difficulty}</Text>
                </>
              )}
            </View>
          </View>
        </View>
      </View>

      <View style={s.footer}>
        <View style={s.tagPill}>
          <Text style={s.tagText}>{style.hair_length || "Long"}</Text>
        </View>
        {typeof style.nearby_pros_count === "number" && (
          <View style={s.footerItem}>
            <Feather name="users" size={11} color={colors.onSurfaceTertiary} />
            <Text style={s.footerText}>{style.nearby_pros_count} nearby</Text>
          </View>
        )}
        <Pressable hitSlop={6} onPress={share} style={{ marginLeft: "auto" }}>
          <Feather name="share-2" size={14} color={colors.onSurfaceTertiary} />
        </Pressable>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { marginRight: spacing.md },
  image: { borderRadius: radii.lg, overflow: "hidden", backgroundColor: colors.surfaceSecondary, position: "relative" },
  topRow: { position: "absolute", top: spacing.sm, left: spacing.sm, right: spacing.sm, flexDirection: "row", alignItems: "center", zIndex: 2 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brand, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.pill },
  badgeText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 9, letterSpacing: 1 },
  iconBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  gradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: "45%", backgroundColor: "rgba(0,0,0,0.35)" },
  bottomRow: { position: "absolute", bottom: 0, left: 0, right: 0, padding: spacing.md, flexDirection: "row", alignItems: "flex-end" },
  name: { color: "#fff", fontFamily: font.display, fontSize: 18, lineHeight: 22 },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 4, flexWrap: "wrap" },
  meta: { color: "#F5EFE7", fontFamily: font.bodyMed, fontSize: 11 },
  metaDot: { color: "#C6B9A8", marginHorizontal: 4, fontSize: 10 },
  footer: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm, paddingHorizontal: 2 },
  tagPill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.pill, backgroundColor: colors.brandTertiary },
  tagText: { fontFamily: font.bodyMed, fontSize: 10, color: colors.onBrandTertiary, letterSpacing: 0.4 },
  footerItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  footerText: { fontFamily: font.body, fontSize: 11, color: colors.onSurfaceTertiary },
});
