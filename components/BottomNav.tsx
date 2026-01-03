'use client';

import { useEffect, useState, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Home, Trophy, Clock } from 'lucide-react';

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    checkAuth();
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAuth();
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // Small delay to ensure buttons are rendered
    const timer = setTimeout(() => {
      updateIndicatorPosition();
    }, 10);
    
    // Also update on window resize
    const handleResize = () => {
      setTimeout(() => updateIndicatorPosition(), 10);
    };
    window.addEventListener('resize', handleResize);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [pathname]);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setIsAuthenticated(!!user);
    setLoading(false);
  };

  const updateIndicatorPosition = () => {
    const activeIndex = getActiveIndex();
    if (activeIndex !== -1 && buttonRefs.current[activeIndex] && containerRef.current) {
      const button = buttonRefs.current[activeIndex];
      const container = containerRef.current;
      
      if (button) {
        const buttonRect = button.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        setIndicatorStyle({
          left: buttonRect.left - containerRect.left,
          width: buttonRect.width,
        });
      }
    }
  };

  const getActiveIndex = () => {
    if (pathname === '/dashboard') return 0;
    if (pathname === '/leaderboard') return 1;
    if (pathname === '/history') return 2;
    return -1;
  };

  // Don't show nav on auth pages or if not authenticated
  if (loading || !isAuthenticated || pathname?.startsWith('/login') || pathname?.startsWith('/signup')) {
    return null;
  }

  const isActive = (path: string) => pathname === path;
  const activeIndex = getActiveIndex();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[#1a1a1a] border-t border-gray-200 dark:border-gray-800 safe-area-inset-bottom">
      <div 
        ref={containerRef}
        className="max-w-md mx-auto relative flex items-center justify-around px-4 py-2"
      >
        {/* Sliding indicator background */}
        {activeIndex !== -1 && (
          <div
            className="absolute top-2 bottom-2 bg-black dark:bg-white rounded-2xl ease-out pointer-events-none"
            style={{
              left: `${indicatorStyle.left}px`,
              width: `${indicatorStyle.width}px`,
              transition: 'left 250ms ease-out, width 250ms ease-out',
            }}
          />
        )}

        <button
          ref={(el) => { buttonRefs.current[0] = el; }}
          onClick={() => router.push('/dashboard')}
          className={`relative z-10 flex flex-col items-center justify-center gap-1 py-2 px-4 rounded-2xl transition-colors duration-200 ease-out min-h-[44px] active:scale-95 ${
            isActive('/dashboard')
              ? 'text-white dark:text-black'
              : 'text-gray-600 dark:text-gray-400 hover:opacity-80'
          }`}
        >
          <Home className="w-6 h-6" />
          <span className="text-xs font-medium">Dashboard</span>
        </button>

        <button
          ref={(el) => { buttonRefs.current[1] = el; }}
          onClick={() => router.push('/leaderboard')}
          className={`relative z-10 flex flex-col items-center justify-center gap-1 py-2 px-4 rounded-2xl transition-colors duration-200 ease-out min-h-[44px] active:scale-95 ${
            isActive('/leaderboard')
              ? 'text-white dark:text-black'
              : 'text-gray-600 dark:text-gray-400 hover:opacity-80'
          }`}
        >
          <Trophy className="w-6 h-6" />
          <span className="text-xs font-medium">Leaderboard</span>
        </button>

        <button
          ref={(el) => { buttonRefs.current[2] = el; }}
          onClick={() => router.push('/history')}
          className={`relative z-10 flex flex-col items-center justify-center gap-1 py-2 px-4 rounded-2xl transition-colors duration-200 ease-out min-h-[44px] active:scale-95 ${
            isActive('/history')
              ? 'text-white dark:text-black'
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


