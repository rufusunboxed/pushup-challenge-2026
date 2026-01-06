'use client';

import { useEffect, useState, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
// Icons removed - using emojis instead

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const [profileColor, setProfileColor] = useState<string>('green');
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    checkAuth();
    fetchProfileColor();
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAuth();
      fetchProfileColor();
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfileColor = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('profile_color')
        .eq('id', user.id)
        .single();

      if (!error && data?.profile_color) {
        setProfileColor(data.profile_color);
      }
    } catch (error) {
      console.error('Error fetching profile color:', error);
    }
  };

  // Update position when pathname changes (navigation)
  useEffect(() => {
    // Use double requestAnimationFrame to ensure DOM is fully laid out
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        updateIndicatorPosition();
      });
    });
    
    // Also update on window resize
    const handleResize = () => {
      requestAnimationFrame(() => {
        updateIndicatorPosition();
      });
    };
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [pathname]);

  // Calculate initial position when component becomes visible (after auth check)
  useEffect(() => {
    if (!loading && isAuthenticated) {
      // Use double requestAnimationFrame to ensure DOM is fully laid out
      let rafId1: number;
      let rafId2: number;
      let retryTimer: NodeJS.Timeout;
      
      rafId1 = requestAnimationFrame(() => {
        rafId2 = requestAnimationFrame(() => {
          updateIndicatorPosition();
          
          // Fallback retry if buttons might not be ready yet
          retryTimer = setTimeout(() => {
            updateIndicatorPosition();
          }, 100);
        });
      });
      
      return () => {
        if (rafId1) cancelAnimationFrame(rafId1);
        if (rafId2) cancelAnimationFrame(rafId2);
        if (retryTimer) clearTimeout(retryTimer);
      };
    }
  }, [loading, isAuthenticated, pathname]);

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
    if (pathname === '/record') return 1;
    if (pathname === '/leaderboard') return 2;
    if (pathname === '/history') return 3;
    if (pathname === '/profile') return 4;
    return -1;
  };

  // Helper function to get indicator color classes based on profile color
  const getIndicatorColorClasses = (color: string) => {
    const colorMap: Record<string, { bg: string; text: string }> = {
      red: {
        bg: 'bg-red-600',
        text: 'text-white'
      },
      green: {
        bg: 'bg-green-600',
        text: 'text-white'
      },
      blue: {
        bg: 'bg-blue-600',
        text: 'text-white'
      },
      purple: {
        bg: 'bg-purple-600',
        text: 'text-white'
      },
      cyan: {
        bg: 'bg-cyan-600',
        text: 'text-white'
      },
      yellow: {
        bg: 'bg-yellow-600',
        text: 'text-white'
      }
    };

    return colorMap[color] || colorMap.green;
  };

  // Don't show nav on auth pages or if not authenticated
  if (loading || !isAuthenticated || pathname?.startsWith('/login') || pathname?.startsWith('/signup')) {
    return null;
  }

  const isActive = (path: string) => pathname === path;
  const activeIndex = getActiveIndex();
  const indicatorColors = getIndicatorColorClasses(profileColor);

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[#1a1a1a] border-t border-gray-200 dark:border-gray-800 safe-area-inset-bottom">
      <div 
        ref={containerRef}
        className="max-w-md mx-auto relative flex items-center justify-between px-2 py-2"
      >
        {/* Sliding indicator background */}
        {activeIndex !== -1 && (
          <div
            className={`absolute top-2 bottom-2 ${indicatorColors.bg} rounded-2xl ease-out pointer-events-none`}
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
          className={`relative z-10 flex items-center justify-center py-2 px-2 rounded-2xl transition-colors duration-200 ease-out min-h-[44px] min-w-[44px] active:scale-95 ${
            isActive('/dashboard')
              ? indicatorColors.text
              : 'text-gray-600 dark:text-gray-400 hover:opacity-80'
          }`}
        >
          <span className="text-2xl">🏠</span>
        </button>

        <button
          ref={(el) => { buttonRefs.current[1] = el; }}
          onClick={() => router.push('/record')}
          className={`relative z-10 flex items-center justify-center py-2 px-2 rounded-2xl transition-colors duration-200 ease-out min-h-[44px] min-w-[44px] active:scale-95 ${
            isActive('/record')
              ? indicatorColors.text
              : 'text-gray-600 dark:text-gray-400 hover:opacity-80'
          }`}
        >
          <span className="text-2xl">➕</span>
        </button>

        <button
          ref={(el) => { buttonRefs.current[2] = el; }}
          onClick={() => router.push('/leaderboard')}
          className={`relative z-10 flex items-center justify-center py-2 px-2 rounded-2xl transition-colors duration-200 ease-out min-h-[44px] min-w-[44px] active:scale-95 ${
            isActive('/leaderboard')
              ? indicatorColors.text
              : 'text-gray-600 dark:text-gray-400 hover:opacity-80'
          }`}
        >
          <span className="text-2xl">🏆</span>
        </button>

        <button
          ref={(el) => { buttonRefs.current[3] = el; }}
          onClick={() => router.push('/history')}
          className={`relative z-10 flex items-center justify-center py-2 px-2 rounded-2xl transition-colors duration-200 ease-out min-h-[44px] min-w-[44px] active:scale-95 ${
            isActive('/history')
              ? indicatorColors.text
              : 'text-gray-600 dark:text-gray-400 hover:opacity-80'
          }`}
        >
          <span className="text-2xl">🕐</span>
        </button>

        <button
          ref={(el) => { buttonRefs.current[4] = el; }}
          onClick={() => router.push('/profile')}
          className={`relative z-10 flex items-center justify-center py-2 px-2 rounded-2xl transition-colors duration-200 ease-out min-h-[44px] min-w-[44px] active:scale-95 ${
            isActive('/profile')
              ? indicatorColors.text
              : 'text-gray-600 dark:text-gray-400 hover:opacity-80'
          }`}
        >
          <span className="text-2xl">👤</span>
        </button>
      </div>
    </nav>
  );
}


