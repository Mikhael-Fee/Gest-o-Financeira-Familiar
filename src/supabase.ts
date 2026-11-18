import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const dominioLogin =
  (import.meta.env.VITE_LOGIN_DOMAIN as string | undefined) || undefined;

// Sem configuração, o app abre só no modo demonstração.
export const supabase: SupabaseClient | null =
  url && chave ? createClient(url, chave, { auth: { persistSession: true } }) : null;
