/**
 * Cloudinary signed-upload helper for BraidsCommunity.
 *
 * Flow:
 *   1) Ask backend `/api/media/sign` for signed upload params.
 *   2) POST FormData directly to Cloudinary — backend never proxies bytes.
 *   3) Call `/api/media/complete` to persist {secure_url, public_id} in Mongo.
 *
 * Callers get:
 *   - onProgress: 0..1 stream of upload progress
 *   - auto-retry with exponential backoff (up to 3 attempts) on network errors
 */
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { api } from "@/src/api";

export type MediaContext = "portfolio" | "style_catalog" | "avatar" | "license" | "booking";

const PRESETS: Record<MediaContext, { maxWidth: number; compress: number }> = {
  portfolio: { maxWidth: 1600, compress: 0.72 },
  style_catalog: { maxWidth: 1600, compress: 0.75 },
  avatar: { maxWidth: 400, compress: 0.82 },
  license: { maxWidth: 2000, compress: 0.85 },
  booking: { maxWidth: 1600, compress: 0.72 },
};

export interface PickAndCompressResult {
  uri: string;
  width: number;
  height: number;
  mime: "image/jpeg";
}

export async function pickImage(context: MediaContext, opts?: { allowsEditing?: boolean; aspect?: [number, number] }): Promise<PickAndCompressResult | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error("Permission to access photos was denied.");
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: opts?.allowsEditing ?? false,
    aspect: opts?.aspect,
    quality: 1,
  });
  if (result.canceled || !result.assets?.length) return null;
  return compressAsset(result.assets[0].uri, context);
}

export async function captureImage(context: MediaContext, opts?: { allowsEditing?: boolean; aspect?: [number, number] }): Promise<PickAndCompressResult | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error("Camera permission denied.");
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: opts?.allowsEditing ?? false,
    aspect: opts?.aspect,
    quality: 1,
  });
  if (result.canceled || !result.assets?.length) return null;
  return compressAsset(result.assets[0].uri, context);
}

async function compressAsset(uri: string, context: MediaContext): Promise<PickAndCompressResult> {
  const { maxWidth, compress } = PRESETS[context];
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxWidth } }],
    { compress, format: ImageManipulator.SaveFormat.JPEG }
  );
  return { uri: manipulated.uri, width: manipulated.width, height: manipulated.height, mime: "image/jpeg" };
}


export interface SignedUploadResponse {
  secure_url: string;
  public_id: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
}

export interface SignedUploadOptions {
  context: MediaContext;
  fileUri: string;
  hairstyleId?: string;   // portfolio
  bookingId?: string;     // booking photos
  onProgress?: (fraction: number) => void;
  maxRetries?: number;    // default 3
}

interface SignPayload {
  cloud_name: string;
  api_key: string;
  timestamp: number;
  signature: string;
  folder: string;
  public_id: string;
  upload_preset?: string | null;
  access_mode?: string | null;
  upload_url: string;
}

async function requestSignedParams(opts: SignedUploadOptions): Promise<SignPayload> {
  const body: any = { context: opts.context };
  if (opts.bookingId) body.booking_id = opts.bookingId;
  return api("/media/sign", { method: "POST", body: JSON.stringify(body) });
}

function postWithProgress(url: string, form: FormData, onProgress?: (p: number) => void): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.responseType = "json";
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) onProgress(ev.loaded / ev.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response);
      } else {
        const msg = (xhr.response && (xhr.response.error?.message || xhr.response.error)) || xhr.statusText || `HTTP ${xhr.status}`;
        reject(new Error(String(msg)));
      }
    };
    xhr.onerror = () => reject(new Error("Upload network error"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.timeout = 60_000;
    xhr.send(form);
  });
}

/**
 * Uploads a compressed image to Cloudinary using signed params.
 * Retries on failure with exponential backoff (500ms, 1s, 2s).
 */
export async function uploadSigned(opts: SignedUploadOptions): Promise<SignedUploadResponse> {
  const params = await requestSignedParams(opts);

  const form = new FormData();
  // React Native FormData file shape:
  form.append("file", {
    uri: opts.fileUri,
    name: `${params.public_id.split("/").pop()}.jpg`,
    type: "image/jpeg",
  } as any);
  form.append("api_key", params.api_key);
  form.append("timestamp", String(params.timestamp));
  form.append("signature", params.signature);
  form.append("folder", params.folder);
  form.append("public_id", params.public_id);
  if (params.upload_preset) form.append("upload_preset", params.upload_preset);
  if (params.access_mode) form.append("access_mode", params.access_mode);

  const maxRetries = opts.maxRetries ?? 3;
  let lastErr: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await postWithProgress(params.upload_url, form, opts.onProgress);
      return res as SignedUploadResponse;
    } catch (e: any) {
      lastErr = e;
      // Bail out on 4xx signature errors (won't succeed on retry)
      if (/HTTP 40[013]/.test(String(e?.message))) throw e;
      // Backoff before retrying
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }
  throw lastErr || new Error("Upload failed");
}


export interface CompletePayload {
  context: MediaContext;
  secure_url: string;
  public_id: string;
  hairstyle_id?: string;
  caption?: string;
  booking_id?: string;
  bytes?: number;
  width?: number;
  height?: number;
}
export async function persistMedia(payload: CompletePayload): Promise<any> {
  return api("/media/complete", { method: "POST", body: JSON.stringify(payload) });
}


/**
 * All-in-one helper for the common case:
 *   pick → compress → signed upload → persist
 */
export async function pickCompressUploadPersist(opts: {
  context: MediaContext;
  hairstyleId?: string;
  bookingId?: string;
  caption?: string;
  onProgress?: (p: number) => void;
  fromCamera?: boolean;
  allowsEditing?: boolean;
  aspect?: [number, number];
}): Promise<{ secure_url: string; public_id: string } | null> {
  const picked = opts.fromCamera
    ? await captureImage(opts.context, { allowsEditing: opts.allowsEditing, aspect: opts.aspect })
    : await pickImage(opts.context, { allowsEditing: opts.allowsEditing, aspect: opts.aspect });
  if (!picked) return null;

  const uploaded = await uploadSigned({
    context: opts.context,
    fileUri: picked.uri,
    hairstyleId: opts.hairstyleId,
    bookingId: opts.bookingId,
    onProgress: opts.onProgress,
  });

  await persistMedia({
    context: opts.context,
    secure_url: uploaded.secure_url,
    public_id: uploaded.public_id,
    hairstyle_id: opts.hairstyleId,
    caption: opts.caption,
    booking_id: opts.bookingId,
    width: uploaded.width,
    height: uploaded.height,
    bytes: uploaded.bytes,
  });

  return { secure_url: uploaded.secure_url, public_id: uploaded.public_id };
}

/**
 * Build a Cloudinary URL with on-the-fly transformations (thumbnail, crop, etc.)
 * Example:
 *   cldThumb(secure_url, { w: 400, h: 400, c: "fill" })
 */
export function cldTransform(secureUrl: string, opts: { w?: number; h?: number; c?: "fill" | "fit" | "limit" | "thumb"; g?: "auto" | "face"; q?: "auto" | number; f?: "auto" | "webp" | "jpg" } = {}): string {
  if (!secureUrl || !secureUrl.includes("/upload/")) return secureUrl;
  const parts: string[] = [];
  if (opts.w) parts.push(`w_${opts.w}`);
  if (opts.h) parts.push(`h_${opts.h}`);
  if (opts.c) parts.push(`c_${opts.c}`);
  if (opts.g) parts.push(`g_${opts.g}`);
  parts.push(`q_${opts.q ?? "auto"}`);
  parts.push(`f_${opts.f ?? "auto"}`);
  const transform = parts.join(",");
  return secureUrl.replace("/upload/", `/upload/${transform}/`);
}
