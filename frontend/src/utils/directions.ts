/**
 * "Get Directions" — opens the device's native maps app via a plain geo/maps
 * URL. No embedded map component, no Google Maps API key, no billing.
 */
import { Linking, Platform } from "react-native";

export interface DirectionsTarget {
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  label?: string | null;
}

/** hairdressers default to latitude/longitude = 0.0 until explicitly set — treat that as "no coords". */
function hasCoords(t: DirectionsTarget): boolean {
  return !!(t.latitude && t.longitude);
}

export function hasDirectionsTarget(t: DirectionsTarget): boolean {
  return hasCoords(t) || !!(t.address && t.address.trim());
}

function buildUrl(t: DirectionsTarget): string {
  const label = encodeURIComponent(t.label || "");
  const coords = hasCoords(t);
  const query = coords ? `${t.latitude},${t.longitude}` : encodeURIComponent(t.address || "");

  if (Platform.OS === "ios") {
    return coords ? `http://maps.apple.com/?daddr=${query}&q=${label}` : `http://maps.apple.com/?daddr=${query}`;
  }
  if (Platform.OS === "android") {
    return coords ? `geo:${query}?q=${query}(${label})` : `geo:0,0?q=${query}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function buildWebFallbackUrl(t: DirectionsTarget): string {
  const query = hasCoords(t) ? `${t.latitude},${t.longitude}` : encodeURIComponent(t.address || "");
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

/** Opens Apple Maps / Google Maps (whichever the device resolves for the scheme), falling back to the Google Maps web URL if the native scheme can't be opened. */
export async function openDirections(t: DirectionsTarget): Promise<void> {
  if (!hasDirectionsTarget(t)) return;
  const url = buildUrl(t);
  try {
    const can = await Linking.canOpenURL(url);
    if (can) {
      await Linking.openURL(url);
      return;
    }
  } catch {
    // fall through to web fallback
  }
  await Linking.openURL(buildWebFallbackUrl(t));
}
