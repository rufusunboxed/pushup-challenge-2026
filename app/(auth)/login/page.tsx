'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const errorParam = searchParams.get('error');
    const messageParam = searchParams.get('message');
    if (errorParam) setError(errorParam);
    if (messageParam) setMessage(messageParam);
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Don't proceed if fields are empty
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    console.log('=== LOGIN ATTEMPT STARTED ===');
    console.log('Email:', email);
    console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Set' : 'MISSING');
    console.log('Supabase Key:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Set' : 'MISSING');

    try {
      console.log('Calling supabase.auth.signInWithPassword...');
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      console.log('=== LOGIN RESPONSE ===');
      console.log('Has data:', !!data);
      console.log('Has session:', !!data?.session);
      console.log('Has error:', !!loginError);
      console.log('Error details:', loginError);

      if (loginError) {
        console.error('Login error:', loginError);
        const errorMessage = loginError.message || 'An error occurred during login';
        
        // Check for specific error types
        if (errorMessage.includes('Email not confirmed') || errorMessage.includes('confirm')) {
          setError('Your email is not confirmed. Please check your email for a confirmation link, or contact support to manually confirm your account.');
        } else if (errorMessage.includes('Invalid login credentials')) {
          setError('Invalid email or password. Please check your credentials and try again.');
        } else {
          setError(errorMessage);
        }
        setLoading(false);
        return;
      }

      // Check if we got a session
      if (data?.session) {
        console.log('✅ Login successful!');
        console.log('User ID:', data.session.user.id);
        console.log('Session token:', data.session.access_token ? 'Present' : 'Missing');
        
        // Force session to be saved
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token!,
        });
        
        // Wait for session to be saved
        console.log('Waiting for session to be saved...');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Verify session is still there before redirecting
        const { data: { session: verifySession } } = await supabase.auth.getSession();
        if (verifySession) {
          console.log('Session verified, redirecting to dashboard...');
          // Force a full page reload to ensure middleware sees the session
          window.location.replace('/dashboard');
        } else {
          console.error('Session lost after save!');
          setError('Session could not be saved. Please try again.');
          setLoading(false);
        }
        // Don't set loading to false here - we're redirecting
      } else {
        console.error('❌ No session in response');
        console.error('Full response data:', data);
        setError('Login failed: No session created. This might be a configuration issue. Please check your Supabase settings.');
        setLoading(false);
      }
    } catch (err: any) {
      console.error('❌ UNEXPECTED ERROR:', err);
      console.error('Error stack:', err.stack);
      setError(err.message || 'An unexpected error occurred during login. Please check the browser console for details.');
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (!email) {
      setError('Please enter your email address first');
      return;
    }

    setResending(true);
    setError(null);
    
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (resendError) {
        setError(resendError.message);
      } else {
        setMessage('Confirmation email sent! Please check your inbox.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to resend confirmation email');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-white dark:bg-[#1a1a1a]">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-semibold mb-2 text-black dark:text-white">
            Pushup Tracker 2026
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Welcome back
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2 text-black dark:text-white">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-2xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#2a2a2a] text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent"
              placeholder="john@example.com"
              inputMode="email"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2 text-black dark:text-white">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-2xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#2a2a2a] text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          {message && (
            <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-600 dark:text-blue-400">{message}</p>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              {error.includes('not confirmed') && (
                <button
                  type="button"
                  onClick={handleResendConfirmation}
                  disabled={resending}
                  className="mt-2 text-sm underline hover:no-underline disabled:opacity-50"
                >
                  {resending ? 'Sending...' : 'Resend confirmation email'}
                </button>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-2xl bg-black dark:bg-white text-white dark:text-black font-medium text-lg hover:opacity-90 active:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-h-[44px]"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Logging in...
              </>
            ) : (
              'Log In'
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
          Don't have an account?{' '}
          <a href="/signup" className="text-black dark:text-white font-medium hover:underline">
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}


