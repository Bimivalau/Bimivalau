export const colors = {
  surface: "#FCFAF8",
  onSurface: "#1A1918",
  surfaceSecondary: "#F3F0EA",
  onSurfaceSecondary: "#2D2A26",
  surfaceTertiary: "#E9E5DE",
  onSurfaceTertiary: "#4A4541",
  surfaceInverse: "#2A2825",
  onSurfaceInverse: "#F9F6F0",
  brand: "#B65942",
  brandSecondary: "#8F4533",
  brandTertiary: "#E8CBBF",
  onBrandTertiary: "#5C2B1F",
  success: "#4B7355",
  warning: "#D9933D",
  error: "#A84448",
  info: "#647781",
  border: "#E3DDD3",
  borderStrong: "#C7BEAF",
  divider: "#EAE4DA",
  muted: "#8A8378",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radii = { sm: 0, md: 4, lg: 8, pill: 999 };
// System-safe fonts; serif gives an editorial "Playfair-like" feel on both platforms.
import { Platform } from "react-native";
export const font = {
  display: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }) as string,
  displayIt: Platform.select({ ios: "Georgia-Italic", android: "serif", default: "serif" }) as string,
  body: Platform.select({ ios: "System", android: "sans-serif", default: "System" }) as string,
  bodyMed: Platform.select({ ios: "System", android: "sans-serif-medium", default: "System" }) as string,
  bodyBold: Platform.select({ ios: "System", android: "sans-serif", default: "System" }) as string,
};
