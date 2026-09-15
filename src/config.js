// Central place for build-time configuration. Values come from Vite's
// import.meta.env, which is populated from .env / .env.local at build time.

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const APP_NAME = import.meta.env.VITE_APP_NAME || "Super Makarios";
export const APP_SHORT_NAME =
  import.meta.env.VITE_APP_SHORT_NAME || "Super Makarios";

export const SUPABASE_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
