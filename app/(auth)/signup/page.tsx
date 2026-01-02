'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    console.log('Signup attempt started for:', email);

    try {
      console.log('Calling supabase.auth.signUp...');
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            first_name: firstName,
            last_name: lastName,
          },
        },
      });

      console.log('Signup response:', { data, error: signUpError });

      if (signUpError) {
        console.error('Signup error:', signUpError);
        setError(signUpError.message || 'An error occurred during sign up');
        setLoading(false);
        return;
      }

      // Check if email confirmation is required
      if (data?.user && !data?.session) {
        // Email confirmation required
        console.log('Email confirmation required');
        setError(null);
        alert('Please check your email to verify your account. You can close this window and click the link in your email.');
        // Still redirect to login so they can sign in after verifying
        window.location.href = '/login?message=Please check your email to verify your account';
      } else if (data?.session) {
        // No email confirmation needed, go straight to dashboard
        console.log('Signup successful! Redirecting to dashboard...');
        await new Promise(resolve => setTimeout(resolve, 100));
        window.location.href = '/dashboard';
      } else {
        console.error('Unexpected signup response:', data);
        setError('Signup completed but no user or session was created. Please try logging in.');
        setLoading(false);
      }
    } catch (err: any) {
      console.error('Unexpected error:', err);
      setError(err.message || 'An error occurred during sign up');
      setLoading(false);
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
            Create your account
          </p>
        </div>

        <form onSubmit={handleSignUp} className="space-y-4">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium mb-2 text-black dark:text-white">
              First Name
            </label>
            <input
              id="firstName"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-2xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#2a2a2a] text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent"
              placeholder="John"
            />
          </div>

          <div>
            <label htmlFor="lastName" className="block text-sm font-medium mb-2 text-black dark:text-white">
              Last Name
            </label>
            <input
              id="lastName"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-2xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#2a2a2a] text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent"
              placeholder="Doe"
            />
          </div>

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
              minLength={6}
              className="w-full px-4 py-3 rounded-2xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#2a2a2a] text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
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
                Creating account...
              </>
            ) : (
              'Sign Up'
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
          Already have an account?{' '}
          <a href="/login" className="text-black dark:text-white font-medium hover:underline">
            Log in
          </a>
        </p>
      </div>
    </div>
  );
}


