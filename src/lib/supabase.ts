import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { Capacitor } from "@capacitor/core";

const rawUrl =
  (typeof import.meta !== "undefined" && import.meta.env
    ? import.meta.env["VITE_SUPABASE_URL"]
    : typeof process !== "undefined"
      ? process.env?.["VITE_SUPABASE_URL"]
      : "") ?? "";
const rawKey =
  (typeof import.meta !== "undefined" && import.meta.env
    ? import.meta.env["VITE_SUPABASE_ANON_KEY"]
    : typeof process !== "undefined"
      ? process.env?.["VITE_SUPABASE_ANON_KEY"]
      : "") ?? "";

const valid = /^https?:\/\//.test(rawUrl) && rawKey.length > 0;

/** Cloud sync is optional in the prototype — fall back to a harmless local placeholder. */
export const cloudEnabled = valid;

/** Whether the app is running inside an Android/iOS Capacitor shell. */
const isNative = Capacitor.isNativePlatform();

export const supabase = createClient(
  valid ? rawUrl : "http://localhost:54321",
  valid ? rawKey : "public-anon-key",
  {
    auth: {
      // PKCE is required for OAuth deep-link flows on native (no implicit token in URL).
      flowType: "pkce",
      detectSessionInUrl: true,
      autoRefreshToken: true,
      persistSession: true,
    },
    realtime: {
      transport: isNative
        ? // Native WebSocket is available globally on Android (Capacitor injects it).
          WebSocket
        : typeof WebSocket !== "undefined"
          ? WebSocket
          : (ws as any),
    },
  },
);
