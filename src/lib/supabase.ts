/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js'

// Wholesaler frontend client
// Uses anon key + RLS
// Ensure these environment variables are defined in your .env.local file.
// IMPORTANT: NEVER place the SUPABASE_SERVICE_ROLE_KEY in this frontend project.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase environment variables. Please check your .env.local file.")
}

const isInvalidUrl = !supabaseUrl || !supabaseUrl.startsWith('http');

export const supabase = createClient(
  isInvalidUrl ? 'https://placeholder.supabase.co' : supabaseUrl,
  supabaseAnonKey || 'placeholder'
)
