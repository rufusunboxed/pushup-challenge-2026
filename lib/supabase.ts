import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Validate environment variables (warnings only, don't break build)
function validateSupabaseConfig() {
  const warnings: string[] = []
  
  if (!supabaseUrl) {
    warnings.push('NEXT_PUBLIC_SUPABASE_URL is missing')
  } else if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
    warnings.push('NEXT_PUBLIC_SUPABASE_URL may be invalid (expected format: https://*.supabase.co)')
  }
  
  if (!supabaseAnonKey) {
    warnings.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is missing')
  } else if (!supabaseAnonKey.startsWith('eyJ') && supabaseAnonKey.length > 20) {
    // Only warn if it's a long string that doesn't look like a JWT
    // Some Supabase projects might use different key formats
    warnings.push('NEXT_PUBLIC_SUPABASE_ANON_KEY may be invalid (Supabase keys typically start with "eyJ")')
  }
  
  if (warnings.length > 0) {
    const warningMessage = `Supabase configuration warning:\n${warnings.join('\n')}\n\nPlease verify your environment variables in:\n- Local: .env.local file\n- Vercel: Project Settings → Environment Variables\n\nIf you see "Invalid API key" errors, check that the values are correct in Vercel.`
    console.warn(warningMessage)
    // Don't throw - let runtime errors handle invalid keys
  }
}

// Run validation
validateSupabaseConfig()

export const supabase = createBrowserClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
)

