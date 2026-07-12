import { useWindowDimensions, PixelRatio, Platform } from "react-native";

/**
 * Central responsive helpers. Used by every UI primitive.
 * We normalise to design widths [320, 360, 390, 412, 430] and let the caller
 * multiply / divide as needed. Never rely on fixed pixel widths.
 */
export function useResponsive() {
  const { width, height, fontScale } = useWindowDimensions();
  const isNarrow = width < 360;
  const isTiny = width < 340;
  const isCompact = width < 390;
  // Horizontal page padding scales down on narrow phones — 16 → 20 → 24.
  const pagePad = isTiny ? 16 : isNarrow ? 18 : isCompact ? 20 : 24;
  // Cap max page content width so tablets/wide phones don't feel over-stretched.
  const contentMaxWidth = 640;
  // Clamp system font scaling so accessibility settings can't destroy layouts.
  const clampedFontScale = Math.min(1.3, Math.max(0.9, fontScale));
  const scaleFont = (n: number) => {
    // Slightly shrink display-sized fonts on narrow screens; keep body stable.
    if (n >= 28 && isNarrow) return Math.round(n * 0.85);
    if (n >= 34 && isCompact) return Math.round(n * 0.9);
    return n;
  };
  return {
    width,
    height,
    fontScale: clampedFontScale,
    isNarrow,
    isTiny,
    isCompact,
    pagePad,
    contentMaxWidth,
    scaleFont,
    os: Platform.OS,
    pixelRatio: PixelRatio.get(),
  };
}

export type Responsive = ReturnType<typeof useResponsive>;
