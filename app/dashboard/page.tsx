'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Plus, Minus, Check } from 'lucide-react';
import { getCurrentDayRange, getCurrentMonthRange } from '@/lib/date-utils';

export default function DashboardPage() {
  const router = useRouter();
  const [count, setCount] = useState(20);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [dailyTotal, setDailyTotal] = useState(0);
  const [todayMaxSet, setTodayMaxSet] = useState(0);
  const [monthlyMaxSet, setMonthlyMaxSet] = useState(0);
  const [limitError, setLimitError] = useState<string | null>(null);
  const [profileColor, setProfileColor] = useState<string>('green');
  const [profileColorLoaded, setProfileColorLoaded] = useState<boolean>(false);

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (user) {
      // Fetch profile (including color) first to avoid color flash
      fetchUserProfile();
      // Keep fetchProfileColor as fallback in case profile_color column doesn't exist in first query
      fetchProfileColor();
      fetchDailyTotal();
      fetchMaxSets();
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
        // Fetch profile color immediately to avoid flash
        fetchProfileColorForUser(currentUser.id);
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
        // Fetch profile color immediately to avoid flash
        fetchProfileColorForUser(sessionUser.id);
      } else {
        router.push('/login');
      }
    }
  };

  // Helper function to fetch profile color by user ID (called early to avoid flash)
  const fetchProfileColorForUser = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('profile_color')
        .eq('id', userId)
        .single();

      if (!error && data?.profile_color) {
        setProfileColor(data.profile_color);
        setProfileColorLoaded(true);
      } else {
        // If no color found, mark as loaded with default
        setProfileColorLoaded(true);
      }
    } catch (error) {
      // Silently fail - will be fetched again in fetchProfileColor
      console.error('Error fetching profile color early:', error);
      // Mark as loaded even on error to prevent infinite loading
      setProfileColorLoaded(true);
    }
  };

  const fetchUserProfile = async () => {
    if (!user) return;
    
    try {
      // Fetch profile data including profile_color in one query
      const { data, error } = await supabase
        .from('profiles')
        .select('first_name, last_name, display_name, profile_color')
        .eq('id', user.id)
        .single();

      if (error) {
        // If display_name or profile_color columns don't exist, try without them
        if (error.message?.includes('column') || error.message?.includes('does not exist') || error.code === '42703') {
          // Try fetching basic profile first
          const { data: basicData, error: basicError } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', user.id)
            .single();
          
          if (basicError) throw basicError;
          setUserProfile(basicData);
          
          // Try fetching profile_color separately
          const { data: colorData } = await supabase
            .from('profiles')
            .select('profile_color')
            .eq('id', user.id)
            .single();
          
          const color = colorData?.profile_color || 'green';
          setProfileColor(color);
          setProfileColorLoaded(true);
        } else {
          throw error;
        }
      } else {
        setUserProfile(data);
        // Set profile color immediately if available
        const color = data?.profile_color || 'green';
        setProfileColor(color);
        setProfileColorLoaded(true);
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      setProfileColor('green');
      setProfileColorLoaded(true);
    }
  };

  const fetchProfileColor = async () => {
    // This function is now redundant but kept for backwards compatibility
    // Profile color is fetched in fetchUserProfile
    if (!user) return;
    
    // Only fetch if not already loaded (fallback)
    if (!profileColorLoaded) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('profile_color')
          .eq('id', user.id)
          .single();

        if (!error && data?.profile_color) {
          setProfileColor(data.profile_color);
        }
        setProfileColorLoaded(true);
      } catch (error) {
        console.error('Error fetching profile color:', error);
        setProfileColorLoaded(true);
      }
    }
  };

  const fetchDailyTotal = async () => {
    if (!user) return;

    try {
      const { dayStart, dayEnd } = getCurrentDayRange();

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

  const fetchMaxSets = async () => {
    if (!user) return;

    try {
      const { dayStart, dayEnd } = getCurrentDayRange();
      const { monthStart, monthEnd } = getCurrentMonthRange();

      // Fetch today's logs
      const { data: todayLogs, error: todayError } = await supabase
        .from('pushup_logs')
        .select('count')
        .eq('user_id', user.id)
        .gte('created_at', dayStart.toISOString())
        .lte('created_at', dayEnd.toISOString());

      if (todayError) throw todayError;

      // Fetch month's logs
      const { data: monthLogs, error: monthError } = await supabase
        .from('pushup_logs')
        .select('count')
        .eq('user_id', user.id)
        .gte('created_at', monthStart.toISOString())
        .lte('created_at', monthEnd.toISOString());

      if (monthError) throw monthError;

      // Calculate max sets
      const todayMax = todayLogs?.length > 0 
        ? Math.max(...todayLogs.map(log => log.count || 0))
        : 0;
      
      const monthlyMax = monthLogs?.length > 0
        ? Math.max(...monthLogs.map(log => log.count || 0))
        : 0;

      setTodayMaxSet(todayMax);
      setMonthlyMaxSet(monthlyMax);
    } catch (error) {
      console.error('Error fetching max sets:', error);
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
      
      // Refresh daily total and max sets
      await fetchDailyTotal();
      await fetchMaxSets();
      
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

  // Use display_name if available, otherwise fall back to first_name + last_name
  const userName = userProfile 
    ? (userProfile.display_name || `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim())
    : '';

  // Helper function to get button classes based on profile color
  const getButtonColorClasses = (color: string) => {
    const colorMap: Record<string, { bg: string; hover: string; shadow: string; text: string; darkText: string }> = {
      red: {
        bg: 'bg-red-600',
        hover: 'hover:bg-red-700',
        shadow: 'shadow-red-500/20',
        text: 'text-red-600',
        darkText: 'dark:text-red-400'
      },
      green: {
        bg: 'bg-green-600',
        hover: 'hover:bg-green-700',
        shadow: 'shadow-green-500/20',
        text: 'text-green-600',
        darkText: 'dark:text-green-400'
      },
      blue: {
        bg: 'bg-blue-600',
        hover: 'hover:bg-blue-700',
        shadow: 'shadow-blue-500/20',
        text: 'text-blue-600',
        darkText: 'dark:text-blue-400'
      },
      purple: {
        bg: 'bg-purple-600',
        hover: 'hover:bg-purple-700',
        shadow: 'shadow-purple-500/20',
        text: 'text-purple-600',
        darkText: 'dark:text-purple-400'
      },
      cyan: {
        bg: 'bg-cyan-600',
        hover: 'hover:bg-cyan-700',
        shadow: 'shadow-cyan-500/20',
        text: 'text-cyan-600',
        darkText: 'dark:text-cyan-400'
      },
      yellow: {
        bg: 'bg-yellow-600',
        hover: 'hover:bg-yellow-700',
        shadow: 'shadow-yellow-500/20',
        text: 'text-yellow-600',
        darkText: 'dark:text-yellow-400'
      }
    };

    return colorMap[color] || colorMap.green;
  };

  const buttonColors = getButtonColorClasses(profileColor);

  return (
    <div className="min-h-screen px-4 py-8 pb-24 bg-white dark:bg-[#1a1a1a]">
      <div className="max-w-md mx-auto">
        <div className="mb-6">
          <div className="text-left">
            <h1 className="text-3xl font-semibold mb-2 text-black dark:text-white">
              Pushup Counter
            </h1>
            {userName && (
              <p className="text-lg text-gray-600 dark:text-gray-400">
                {userName}
              </p>
            )}
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

          {/* Submit button - uses profile color, only render after color is loaded */}
          {profileColorLoaded ? (
            <button
              onClick={handleSubmit}
              disabled={loading || count <= 0 || (dailyTotal + count > 300)}
              className={`w-full py-4 rounded-2xl ${buttonColors.bg} ${buttonColors.hover} text-white font-medium text-lg active:scale-95 transition-all duration-200 ease-out disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center min-h-[60px] shadow-lg ${buttonColors.shadow}`}
            >
              {submitted ? (
                <span className="flex items-center animate-pulse">
                  <Check className="w-5 h-5 mr-2" />
                  Submitted!
                </span>
              ) : loading ? (
                'Submitting...'
              ) : (
                'Submit'
              )}
            </button>
          ) : (
            <div className="w-full py-4 rounded-2xl bg-gray-200 dark:bg-gray-700 min-h-[60px] flex items-center justify-center">
              <span className="text-gray-400 dark:text-gray-500">Loading...</span>
            </div>
          )}

          {/* Visual feedback when submitted */}
          {submitted && submittedCount > 0 && (
            <div className="mt-4 text-center animate-fade-in">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                Added
              </p>
              <p className={`text-2xl font-bold ${buttonColors.text} ${buttonColors.darkText} animate-scale-in`}>
                +{submittedCount}
              </p>
            </div>
          )}

          {/* Statistics display */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Today's Total
                </p>
                <p className="text-2xl font-bold text-black dark:text-white">
                  {dailyTotal}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Today's Max Set
                </p>
                <p className="text-2xl font-bold text-black dark:text-white">
                  {todayMaxSet}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Max Set (Month)
                </p>
                <p className="text-2xl font-bold text-black dark:text-white">
                  {monthlyMaxSet}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


