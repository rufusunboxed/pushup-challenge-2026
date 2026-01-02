'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Plus, Minus, Check } from 'lucide-react';
import { LogoutButton } from '@/components/LogoutButton';

export default function DashboardPage() {
  const router = useRouter();
  const [count, setCount] = useState(20);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [dailyTotal, setDailyTotal] = useState(0);
  const [limitError, setLimitError] = useState<string | null>(null);

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchUserProfile();
      fetchDailyTotal();
    }
  }, [user]);

  const checkUser = async () => {
    // Try multiple times in case session is still being set
    let attempts = 0;
    const maxAttempts = 5;
    
    while (attempts < maxAttempts) {
      const { data: { user: currentUser }, error } = await supabase.auth.getUser();
      
      if (currentUser) {
        console.log('User found:', currentUser.id);
        setUser(currentUser);
        return;
      }
      
      // If we get an auth error, user is definitely not logged in
      if (error && error.message.includes('JWT')) {
        console.log('Auth error, redirecting to login');
        router.push('/login');
        return;
      }
      
      attempts++;
      if (attempts < maxAttempts) {
        console.log(`User check attempt ${attempts} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    // If we've exhausted attempts, check session one more time
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.log('No session found after retries, redirecting to login');
      router.push('/login');
    } else {
      console.log('Session found but no user, this is unusual');
      // Try to get user from session
      const { data: { user: sessionUser } } = await supabase.auth.getUser();
      if (sessionUser) {
        setUser(sessionUser);
      } else {
        router.push('/login');
      }
    }
  };

  const fetchUserProfile = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      setUserProfile(data);
    } catch (error) {
      console.error('Error fetching user profile:', error);
    }
  };

  const fetchDailyTotal = async () => {
    if (!user) return;

    try {
      const now = new Date();
      const ukDate = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
      const dayStart = new Date(ukDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(ukDate);
      dayEnd.setHours(23, 59, 59, 999);

      const { data: logs, error } = await supabase
        .from('pushup_logs')
        .select('count')
        .eq('user_id', user.id)
        .gte('created_at', dayStart.toISOString())
        .lte('created_at', dayEnd.toISOString());

      if (error) throw error;

      const total = logs?.reduce((sum, log) => sum + (log.count || 0), 0) || 0;
      setDailyTotal(total);
    } catch (error) {
      console.error('Error fetching daily total:', error);
    }
  };

  const adjustCount = (delta: number) => {
    setCount((prev) => {
      const newCount = Math.max(0, prev + delta);
      checkLimit(newCount);
      return newCount;
    });
    setSubmitted(false);
  };

  const checkLimit = (newCount: number) => {
    if (dailyTotal + newCount > 300) {
      setLimitError('You can only record up to 300 push-ups a day. This would put you over the limit.');
    } else {
      setLimitError(null);
    }
  };

  const handleSubmit = async () => {
    if (!user || count <= 0) return;

    // Check daily limit
    if (dailyTotal + count > 300) {
      setLimitError('You can only record up to 300 push-ups a day. This would put you over the limit.');
      return;
    }

    setLoading(true);
    setLimitError(null);
    try {
      const { error } = await supabase
        .from('pushup_logs')
        .insert([
          {
            user_id: user.id,
            count: count,
            created_at: new Date().toISOString(),
          },
        ]);

      if (error) throw error;

      setSubmitted(true);
      setSubmittedCount(count);
      setCount(20); // Reset to default after successful submission
      
      // Refresh daily total
      await fetchDailyTotal();
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSubmitted(false);
        setSubmittedCount(0);
      }, 3000);
    } catch (error: any) {
      console.error('Error submitting pushups:', error);
      alert('Failed to submit pushups. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#1a1a1a]">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  const userName = userProfile 
    ? `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim() 
    : '';

  return (
    <div className="min-h-screen px-4 py-8 pb-24 bg-white dark:bg-[#1a1a1a]">
      <div className="max-w-md mx-auto">
        <div className="mb-6 flex items-start justify-between">
          <div className="text-left flex-1">
            <h1 className="text-3xl font-semibold mb-2 text-black dark:text-white">
              Pushup Counter
            </h1>
            {userName && (
              <p className="text-lg text-gray-600 dark:text-gray-400">
                {userName}
              </p>
            )}
          </div>
          <div className="mt-1">
            <LogoutButton />
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-[#2a2a2a] rounded-2xl p-6 mb-6">
          {/* Counter with buttons on sides */}
          <div className="flex items-center justify-center gap-3 mb-6">
            {/* -5 button */}
            <button
              onClick={() => adjustCount(-5)}
              className="w-12 h-12 rounded-xl bg-white dark:bg-[#1a1a1a] border-2 border-gray-300 dark:border-gray-700 text-black dark:text-white font-medium hover:opacity-80 active:opacity-60 transition-opacity flex items-center justify-center flex-shrink-0"
            >
              <Minus className="w-4 h-4" />
              <span className="text-xs ml-0.5">5</span>
            </button>

            {/* -1 button */}
            <button
              onClick={() => adjustCount(-1)}
              className="w-12 h-12 rounded-xl bg-white dark:bg-[#1a1a1a] border-2 border-gray-300 dark:border-gray-700 text-black dark:text-white font-medium hover:opacity-80 active:opacity-60 transition-opacity flex items-center justify-center flex-shrink-0"
            >
              <Minus className="w-4 h-4" />
              <span className="text-xs ml-0.5">1</span>
            </button>

            {/* Number input */}
            <input
              type="number"
              value={count}
              onChange={(e) => {
                const value = parseInt(e.target.value) || 0;
                const newValue = Math.max(0, value);
                setCount(newValue);
                checkLimit(newValue);
                setSubmitted(false);
              }}
              onClick={(e) => e.currentTarget.select()}
              inputMode="numeric"
              className="text-6xl font-bold text-center bg-transparent border-none outline-none text-black dark:text-white w-28 focus:ring-0 cursor-pointer mx-auto"
              style={{ WebkitAppearance: 'none', MozAppearance: 'textfield' }}
            />

            {/* +1 button */}
            <button
              onClick={() => adjustCount(1)}
              className="w-12 h-12 rounded-xl bg-white dark:bg-[#1a1a1a] border-2 border-gray-300 dark:border-gray-700 text-black dark:text-white font-medium hover:opacity-80 active:opacity-60 transition-opacity flex items-center justify-center flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span className="text-xs ml-0.5">1</span>
            </button>

            {/* +5 button */}
            <button
              onClick={() => adjustCount(5)}
              className="w-12 h-12 rounded-xl bg-white dark:bg-[#1a1a1a] border-2 border-gray-300 dark:border-gray-700 text-black dark:text-white font-medium hover:opacity-80 active:opacity-60 transition-opacity flex items-center justify-center flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span className="text-xs ml-0.5">5</span>
            </button>
          </div>

          {/* Limit error message */}
          {limitError && (
            <div className="mb-4 p-3 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400">{limitError}</p>
            </div>
          )}

          {/* Submit button - green */}
          <button
            onClick={handleSubmit}
            disabled={loading || count <= 0 || (dailyTotal + count > 300)}
            className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-700 text-white font-medium text-lg active:opacity-80 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-h-[60px] shadow-lg shadow-green-500/20"
          >
            {submitted ? (
              <>
                <Check className="w-5 h-5 mr-2" />
                Submitted!
              </>
            ) : loading ? (
              'Submitting...'
            ) : (
              'Submit'
            )}
          </button>

          {/* Visual feedback when submitted */}
          {submitted && submittedCount > 0 && (
            <div className="mt-4 text-center animate-pulse">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                Added
              </p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                +{submittedCount}
              </p>
            </div>
          )}

          {/* Daily total display */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                Today's Total
              </p>
              <p className="text-3xl font-bold text-black dark:text-white">
                {dailyTotal}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


