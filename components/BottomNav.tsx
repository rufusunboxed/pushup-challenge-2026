'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Home, Trophy, Clock } from 'lucide-react';

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAuth();
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setIsAuthenticated(!!user);
    setLoading(false);
  };

  // Don't show nav on auth pages or if not authenticated
  if (loading || !isAuthenticated || pathname?.startsWith('/login') || pathname?.startsWith('/signup')) {
    return null;
  }

  const isActive = (path: string) => pathname === path;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[#1a1a1a] border-t border-gray-200 dark:border-gray-800 safe-area-inset-bottom">
      <div className="max-w-md mx-auto flex items-center justify-around px-4 py-2">
        <button
          onClick={() => router.push('/dashboard')}
          className={`flex flex-col items-center justify-center gap-1 py-2 px-4 rounded-2xl transition-opacity min-h-[44px] ${
            isActive('/dashboard')
              ? 'bg-black dark:bg-white text-white dark:text-black'
              : 'text-gray-600 dark:text-gray-400 hover:opacity-80'
          }`}
        >
          <Home className="w-6 h-6" />
          <span className="text-xs font-medium">Dashboard</span>
        </button>

        <button
          onClick={() => router.push('/leaderboard')}
          className={`flex flex-col items-center justify-center gap-1 py-2 px-4 rounded-2xl transition-opacity min-h-[44px] ${
            isActive('/leaderboard')
              ? 'bg-black dark:bg-white text-white dark:text-black'
              : 'text-gray-600 dark:text-gray-400 hover:opacity-80'
          }`}
        >
          <Trophy className="w-6 h-6" />
          <span className="text-xs font-medium">Leaderboard</span>
        </button>

        <button
          onClick={() => router.push('/history')}
          className={`flex flex-col items-center justify-center gap-1 py-2 px-4 rounded-2xl transition-opacity min-h-[44px] ${
            isActive('/history')
              ? 'bg-black dark:bg-white text-white dark:text-black'
              : 'text-gray-600 dark:text-gray-400 hover:opacity-80'
          }`}
        >
          <Clock className="w-6 h-6" />
          <span className="text-xs font-medium">History</span>
        </button>
      </div>
    </nav>
  );
}


