/**
 * StyleCard — luxury Airbnb/Apple-inspired card.
 * Variants:
 *   - "editorial" → 260×380  · hero-first slot in a section
 *   - "standard"  → 210×310  · rest of the row (or grid)
 *   - "compact"   → 172×250  · dense grids (Discover)
 *
 * Signature elements:
 *   - Circular gold→bronze "Style Intelligence" badge (score only, no label)
 *   - Optional "Saved / Last viewed" ribbon on top-left
 *   - Trending flame chip
 *   - Minimal metadata under the photo: name · $ · duration · nearby braiders
 *   - Soft elevation (Airbnb-style), 22px rounded corners, generous padding
 */
import { useState } from "react";
import { View, Text, Pressable, StyleSheet, Share, Platform } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { colors, spacing, font, radii } from "@/src/theme";
import { cldTransform } from "@/src/utils/cloudinary";

const FALLBACK_URI: any = require("../../assets/images/icon.png");

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
  personal_reason?: string; // "Saved" | "Last viewed"
};

type Variant = "editorial" | "standard" | "compact";

interface Props {
  style: Hairstyle;
  variant?: Variant;
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

const DIM = {
  editorial: { w: 260, h: 380, radius: 24 },
  standard: { w: 210, h: 310, radius: 22 },
  compact: { w: 172, h: 250, radius: 20 },
};

export default function StyleCard({ style, variant = "standard", onPress, onSave, onShare }: Props) {
  const dim = DIM[variant];
  const [imgError, setImgError] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isTrending = (style.tags || []).includes("trending");
  const img = cldTransform(style.cover_photo, { w: dim.w * 2, h: dim.h * 2, c: "fill", g: "auto", q: "auto", f: "auto" });
  const score = Math.round(style.style_score || 0);

  const share = async () => {
    if (onShare) return onShare();
    try {
      await Share.share({ message: `Check out "${style.name}" on BraidsCommunity 💫`, title: style.name });
    } catch {}
  };

  return (
    <Pressable
      testID={`style-card-${style.id}`}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[s.card, { width: dim.w, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      <View style={[s.image, { height: dim.h, borderRadius: dim.radius }]}>
        <Image
          source={imgError ? FALLBACK_URI : { uri: img }}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          transition={260}
          placeholder={{ blurhash: "L6PZfSjE.AyE_3t7t7Rj~qofbHof" }}
          onError={() => setImgError(true)}
        />

        {/* subtle top-fade for legibility of the score badge & reason ribbon */}
        <LinearGradient colors={["rgba(0,0,0,0.35)", "transparent"]} style={s.topFade} />

        {/* Reason ribbon (Saved / Last viewed) */}
        {style.personal_reason && (
          <View style={s.reasonRibbon}>
            <Feather name={style.personal_reason === "Saved" ? "bookmark" : "clock"} size={10} color="#fff" />
            <Text style={s.reasonText}>{style.personal_reason.toUpperCase()}</Text>
          </View>
        )}

        {/* Style Intelligence badge (top-right, gold→bronze gradient) */}
        <Pressable onPress={onPress} style={s.scoreWrap} hitSlop={6}>
          <LinearGradient colors={["#F5C77E", "#B78141", "#8B5A2B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.scoreCircle}>
            <Text style={s.scoreText}>{score || "—"}</Text>
          </LinearGradient>
        </Pressable>

        {/* Trending flame — small, discreet */}
        {isTrending && !style.personal_reason && (
          <View style={s.trendChip}>
            <Text style={s.trendEmoji}>🔥</Text>
          </View>
        )}

        {/* Bottom gradient + name overlay for editorial cards only */}
        {variant === "editorial" && (
          <>
            <LinearGradient colors={["transparent", "rgba(0,0,0,0.55)"]} style={s.bottomFade} />
            <View style={s.editorialText}>
              <Text numberOfLines={1} style={s.editorialName}>{style.name}</Text>
              <Text style={s.editorialMeta}>${Math.round(style.avg_price)} · {durationLabel(style.avg_duration_min)} · {style.nearby_pros_count ?? 0} braiders nearby</Text>
            </View>
          </>
        )}
      </View>

      {/* Off-image metadata for standard/compact — feels airy and premium */}
      {variant !== "editorial" && (
        <View style={s.meta}>
          <Text numberOfLines={1} style={s.name}>{style.name}</Text>
          <Text style={s.metaRow}>
            ${Math.round(style.avg_price)} · {durationLabel(style.avg_duration_min)}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
            <Feather name="users" size={10} color={colors.onSurfaceTertiary} />
            <Text style={s.nearby}>{style.nearby_pros_count ?? 0} braiders nearby</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    marginRight: spacing.lg,
    // Very soft Airbnb-style depth. Kept subtle so it doesn't fight the photography.
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  image: {
    overflow: "hidden",
    backgroundColor: colors.surfaceSecondary,
    position: "relative",
  },
  topFade: { position: "absolute", top: 0, left: 0, right: 0, height: "22%" },
  bottomFade: { position: "absolute", bottom: 0, left: 0, right: 0, height: "50%" },

  // Score badge
  scoreWrap: { position: "absolute", top: spacing.md, right: spacing.md, zIndex: 3 },
  scoreCircle: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.6)",
  },
  scoreText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 13, letterSpacing: 0.3 },

  // Reason ribbon
  reasonRibbon: {
    position: "absolute", top: spacing.md, left: spacing.md,
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: "rgba(0,0,0,0.55)",
    zIndex: 3,
  },
  reasonText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 9, letterSpacing: 1 },

  // Trending flame
  trendChip: {
    position: "absolute", top: spacing.md, left: spacing.md,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center", justifyContent: "center",
    zIndex: 3,
  },
  trendEmoji: { fontSize: 13 },

  // Editorial variant bottom text
  editorialText: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.lg },
  editorialName: { color: "#fff", fontFamily: font.display, fontSize: 22, lineHeight: 26 },
  editorialMeta: { color: "#F0EAE1", fontFamily: font.bodyMed, fontSize: 11, marginTop: 4 },

  // Off-image meta
  meta: { marginTop: spacing.sm, paddingHorizontal: 2 },
  name: { fontFamily: font.display, fontSize: 16, color: colors.onSurface, lineHeight: 20 },
  metaRow: { fontFamily: font.bodyMed, fontSize: 12, color: colors.onSurfaceTertiary, marginTop: 2 },
  nearby: { fontFamily: font.body, fontSize: 11, color: colors.onSurfaceTertiary },
});
