/**
 * StyleCard — luxury Airbnb/Apple-inspired card.
 * Variants:
 *   - "editorial" → 260×380  · hero-first slot in a section
 *   - "standard"  → 210×310  · rest of the row (or grid)
 *   - "compact"   → 172×250  · dense grids (Discover)
 *
 * Pass an explicit `width` to fit a responsive grid column (e.g. a 2-column
 * Discover grid) — height scales to preserve the variant's aspect ratio, and
 * the card's own inter-item margin is dropped since the caller controls
 * gutter spacing (via `gap`) in that case.
 *
 * Signature elements:
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
  /** Explicit width override for responsive grid columns; height scales to match the variant's aspect ratio. */
  width?: number;
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

export default function StyleCard({ style, variant = "standard", width, onPress, onSave, onShare }: Props) {
  const dim = DIM[variant];
  const cardWidth = width ?? dim.w;
  const cardHeight = width ? Math.round(width * (dim.h / dim.w)) : dim.h;
  const [imgError, setImgError] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isTrending = (style.tags || []).includes("trending");
  const img = cldTransform(style.cover_photo, { w: cardWidth * 2, h: cardHeight * 2, c: "fill", g: "auto", q: "auto", f: "auto" });

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
      style={[s.card, width != null && s.cardNoGutter, { width: cardWidth, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      <View style={[s.image, { height: cardHeight, borderRadius: dim.radius }]}>
        <Image
          source={imgError ? FALLBACK_URI : { uri: img }}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          transition={260}
          placeholder={{ blurhash: "L6PZfSjE.AyE_3t7t7Rj~qofbHof" }}
          onError={() => setImgError(true)}
        />

        {/* subtle top-fade for legibility of the reason ribbon */}
        <LinearGradient colors={["rgba(0,0,0,0.35)", "transparent"]} style={s.topFade} />

        {/* Reason ribbon (Saved / Last viewed) */}
        {style.personal_reason && (
          <View style={s.reasonRibbon}>
            <Feather name={style.personal_reason === "Saved" ? "bookmark" : "clock"} size={10} color="#fff" />
            <Text style={s.reasonText}>{style.personal_reason.toUpperCase()}</Text>
          </View>
        )}

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
  // Used when `width` is passed explicitly (responsive grid columns) — the
  // caller controls gutter spacing via `gap`, so the card's own margin would
  // double up the spacing and break the column math.
  cardNoGutter: { marginRight: 0 },
  image: {
    overflow: "hidden",
    backgroundColor: colors.surfaceSecondary,
    position: "relative",
  },
  topFade: { position: "absolute", top: 0, left: 0, right: 0, height: "22%" },
  bottomFade: { position: "absolute", bottom: 0, left: 0, right: 0, height: "50%" },

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
