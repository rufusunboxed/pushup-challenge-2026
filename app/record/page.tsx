'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Check, Minus } from 'lucide-react';

export default function RecordPage() {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [profileColor, setProfileColor] = useState<string>('mint');
  const [profileColorLoaded, setProfileColorLoaded] = useState<boolean>(false);
  const [tapAnimation, setTapAnimation] = useState<boolean>(false);

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchProfileColor();
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

  const fetchProfileColor = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('profile_color')
        .eq('id', user.id)
        .single();

      if (error) {
        // If column doesn't exist, use default
        if (error.message?.includes('column') || error.message?.includes('does not exist')) {
          setProfileColor('mint');
          setProfileColorLoaded(true);
          return;
        }
        throw error;
      }

      setProfileColor(data?.profile_color || 'mint');
      setProfileColorLoaded(true);
    } catch (error) {
      console.error('Error fetching profile color:', error);
      // Default to green if there's any error
      setProfileColor('green');
      setProfileColorLoaded(true);
    }
  };

  const handleAddRep = () => {
    setCount(prev => prev + 1);
    // Trigger tap animation
    setTapAnimation(true);
    setTimeout(() => setTapAnimation(false), 150);
  };

  const handleRemoveRep = () => {
    if (count > 0) {
      setCount(prev => prev - 1);
    }
  };

  const handleSubmit = async () => {
    if (!user || count <= 0) return;

    setLoading(true);
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
      const submittedCount = count;
      setCount(0); // Reset count to 0
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSubmitted(false);
      }, 3000);
    } catch (error: any) {
      console.error('Error submitting pushups:', error);
      alert('Failed to submit pushups. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Helper function to get button color classes based on profile color
  const getButtonColorClasses = (color: string) => {
    const colorMap: Record<string, { bg: string; hover: string; border: string; text: string }> = {
      'mint': { bg: 'bg-emerald-500', hover: 'hover:bg-emerald-600', border: 'border-emerald-500', text: 'text-emerald-600' },
      'sky': { bg: 'bg-sky-500', hover: 'hover:bg-sky-600', border: 'border-sky-500', text: 'text-sky-600' },
      'indigo': { bg: 'bg-indigo-500', hover: 'hover:bg-indigo-600', border: 'border-indigo-500', text: 'text-indigo-600' },
      'coral': { bg: 'bg-orange-400', hover: 'hover:bg-orange-500', border: 'border-orange-400', text: 'text-orange-600' },
      'sage': { bg: 'bg-green-600', hover: 'hover:bg-green-700', border: 'border-green-600', text: 'text-green-600' },
      'teal': { bg: 'bg-teal-600', hover: 'hover:bg-teal-700', border: 'border-teal-600', text: 'text-teal-600' },
      'grape': { bg: 'bg-purple-500', hover: 'hover:bg-purple-600', border: 'border-purple-500', text: 'text-purple-600' },
      'amber': { bg: 'bg-amber-600', hover: 'hover:bg-amber-700', border: 'border-amber-600', text: 'text-amber-600' },
      'rose': { bg: 'bg-rose-600', hover: 'hover:bg-rose-700', border: 'border-rose-600', text: 'text-rose-600' },
      'azure': { bg: 'bg-sky-500', hover: 'hover:bg-sky-600', border: 'border-sky-500', text: 'text-sky-600' },
      'emerald': { bg: 'bg-emerald-500', hover: 'hover:bg-emerald-600', border: 'border-emerald-500', text: 'text-emerald-600' },
      'mango': { bg: 'bg-amber-500', hover: 'hover:bg-amber-600', border: 'border-amber-500', text: 'text-amber-600' },
      'slate': { bg: 'bg-slate-500', hover: 'hover:bg-slate-600', border: 'border-slate-500', text: 'text-slate-600' },
      'lilac': { bg: 'bg-purple-500', hover: 'hover:bg-purple-600', border: 'border-purple-500', text: 'text-purple-600' },
      'crimson': { bg: 'bg-red-600', hover: 'hover:bg-red-700', border: 'border-red-600', text: 'text-red-600' },
      'turquoise': { bg: 'bg-cyan-500', hover: 'hover:bg-cyan-600', border: 'border-cyan-500', text: 'text-cyan-600' },
      'clay': { bg: 'bg-red-600', hover: 'hover:bg-red-700', border: 'border-red-600', text: 'text-red-600' },
      'forest': { bg: 'bg-green-700', hover: 'hover:bg-green-800', border: 'border-green-700', text: 'text-green-700' },
      'violet': { bg: 'bg-violet-600', hover: 'hover:bg-violet-700', border: 'border-violet-600', text: 'text-violet-600' },
      'ocean': { bg: 'bg-blue-600', hover: 'hover:bg-blue-700', border: 'border-blue-600', text: 'text-blue-600' },
    };

    return colorMap[color] || colorMap['mint'];
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#1a1a1a]">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  const buttonColors = getButtonColorClasses(profileColor);

  return (
    <div className="min-h-screen px-4 py-8 pb-24 bg-white dark:bg-[#1a1a1a] flex flex-col">
      <div className="max-w-md mx-auto w-full flex-1 flex flex-col">
        {/* Header */}
        <div className="mb-4 sm:mb-6">
          <div className="text-left">
            <h1 className="text-3xl font-semibold mb-2 text-black dark:text-white">
              Record
            </h1>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Touch your nose to record each rep
            </p>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col justify-center gap-4 -mt-4 sm:mt-0">
          {/* Top Row: Submit and -1 buttons */}
          <div className="flex gap-3">
            {/* Submit Button */}
            {profileColorLoaded ? (
              <button
                onClick={handleSubmit}
                disabled={loading || count <= 0}
                className={`flex-1 py-3 px-4 rounded-xl border-2 ${buttonColors.border} ${buttonColors.text} bg-transparent dark:bg-transparent font-medium text-sm transition-all duration-200 ease-out disabled:opacity-50 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400 active:scale-95`}
              >
                {submitted ? (
                  <span className="flex items-center justify-center">
                    <Check className="w-4 h-4 mr-2" />
                    Submitted!
                  </span>
                ) : loading ? (
                  'Submitting...'
                ) : (
                  'Submit'
                )}
              </button>
            ) : (
              <div className="flex-1 py-3 px-4 rounded-xl border-2 border-gray-300 bg-gray-100 dark:bg-gray-800 min-h-[44px] flex items-center justify-center">
                <span className="text-gray-400 dark:text-gray-500 text-sm">Loading...</span>
              </div>
            )}

            {/* -1 Button */}
            <button
              onClick={handleRemoveRep}
              disabled={count <= 0}
              className="py-3 px-4 rounded-xl border-2 border-red-600 text-red-600 bg-transparent dark:bg-transparent font-medium text-sm transition-all duration-200 ease-out disabled:opacity-50 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400 active:scale-95 flex items-center justify-center min-w-[60px]"
            >
              <Minus className="w-5 h-5" />
            </button>
          </div>

          {/* Large +1 Button */}
          {profileColorLoaded ? (
            <button
              onClick={handleAddRep}
              className={`w-full aspect-square rounded-2xl ${buttonColors.bg} ${buttonColors.hover} text-white font-bold transition-all duration-150 ease-out flex items-center justify-center select-none ${
                tapAnimation ? 'scale-90 brightness-110' : 'active:scale-95'
              }`}
              style={{ 
                fontSize: count === 0 ? '4rem' : count < 10 ? '6rem' : count < 100 ? '5rem' : '4rem',
                minHeight: '300px'
              }}
            >
              {count === 0 ? '+1' : count}
            </button>
          ) : (
            <div className="w-full aspect-square rounded-2xl bg-gray-200 dark:bg-gray-700 flex items-center justify-center" style={{ minHeight: '300px' }}>
              <span className="text-gray-400 dark:text-gray-500 text-4xl">Loading...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

