import { createServerClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { session } } = await supabase.auth.getSession();

    const { pathname } = request.nextUrl;

    // Only redirect authenticated users away from auth pages
    // Let the client-side pages handle their own auth checks for protected routes
    // This avoids cookie sync issues between client and server
    if ((pathname.startsWith('/login') || pathname.startsWith('/signup')) && session) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // For protected routes, we'll let the client-side handle the redirect
    // This is more reliable since the client has the session in localStorage
    // The dashboard/leaderboard pages will check auth client-side and redirect if needed

    return NextResponse.next();
  } catch (error) {
    // If middleware fails, just continue (don't break the app)
    console.error('Middleware error:', error);
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};


