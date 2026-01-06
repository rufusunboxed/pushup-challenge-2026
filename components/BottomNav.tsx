'use client';

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
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
  const [isNavigating, setIsNavigating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    checkAuth();
    
    // Load color from sessionStorage first to prevent flash
    if (typeof window !== 'undefined') {
      const cachedColor = sessionStorage.getItem('profileColor');
      if (cachedColor) {
        setProfileColor(cachedColor);
      }
    }
    
    fetchProfileColor();
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAuth();
      fetchProfileColor();
    });

    // Listen for profile color changes
    const handleColorChange = (event: CustomEvent) => {
      const newColor = event.detail?.color;
      if (newColor) {
        setProfileColor(newColor);
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('profileColor', newColor);
        }
      }
    };

    window.addEventListener('profileColorChanged', handleColorChange as EventListener);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('profileColorChanged', handleColorChange as EventListener);
    };
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
        // Store in sessionStorage for immediate access
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('profileColor', data.profile_color);
        }
      }
    } catch (error) {
      console.error('Error fetching profile color:', error);
    }
  };

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setIsAuthenticated(!!user);
    setLoading(false);
  };

  const getActiveIndex = useCallback(() => {
    if (pathname === '/dashboard') return 0;
    if (pathname === '/record') return 1;
    if (pathname === '/leaderboard') return 2;
    if (pathname === '/history') return 3;
    if (pathname === '/profile') return 4;
    return -1;
  }, [pathname]);

  const updateIndicatorPosition = useCallback(() => {
    const currentActiveIndex = getActiveIndex();
    if (currentActiveIndex !== -1 && buttonRefs.current[currentActiveIndex] && containerRef.current) {
      const button = buttonRefs.current[currentActiveIndex];
      const container = containerRef.current;
      
      if (button) {
        // Batch DOM reads together
        const buttonRect = button.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        // Calculate indicator width as 1/5 of container width (20%)
        const containerWidth = containerRect.width;
        const indicatorWidth = containerWidth / 5;
        
        // Calculate button center position
        const buttonCenter = buttonRect.left - containerRect.left + (buttonRect.width / 2);
        
        // Center indicator on button but make it wider
        const indicatorLeft = buttonCenter - (indicatorWidth / 2);
        
        setIndicatorStyle({
          left: indicatorLeft,
          width: indicatorWidth,
        });
      }
    }
  }, [getActiveIndex]);

  // Prefetch routes for faster navigation
  useEffect(() => {
    router.prefetch('/dashboard');
    router.prefetch('/record');
    router.prefetch('/leaderboard');
    router.prefetch('/history');
    router.prefetch('/profile');
  }, [router]);

  // Update position when pathname changes (navigation)
  useEffect(() => {
    // Use single requestAnimationFrame for immediate update
    requestAnimationFrame(() => {
      updateIndicatorPosition();
    });
    
    // Debounced resize handler
    const handleResize = () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = setTimeout(() => {
        updateIndicatorPosition();
      }, 150);
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [pathname, updateIndicatorPosition]);

  // Calculate initial position when component becomes visible (after auth check)
  useEffect(() => {
    if (!loading && isAuthenticated) {
      // Use single requestAnimationFrame for immediate update
      requestAnimationFrame(() => {
        updateIndicatorPosition();
      });
    }
  }, [loading, isAuthenticated, updateIndicatorPosition]);

  // Memoize activeIndex
  const activeIndex = useMemo(() => getActiveIndex(), [getActiveIndex]);

  // Helper function to get indicator color classes based on profile color
  const getIndicatorColorClasses = useCallback((color: string) => {
    const colorMap: Record<string, { bg: string; text: string }> = {
      red: { bg: 'bg-red-600', text: 'text-white' },
      orange: { bg: 'bg-orange-600', text: 'text-white' },
      amber: { bg: 'bg-amber-600', text: 'text-white' },
      yellow: { bg: 'bg-yellow-600', text: 'text-white' },
      lime: { bg: 'bg-lime-600', text: 'text-white' },
      green: { bg: 'bg-green-600', text: 'text-white' },
      emerald: { bg: 'bg-emerald-600', text: 'text-white' },
      mint: { bg: 'bg-teal-400', text: 'text-white' },
      teal: { bg: 'bg-teal-600', text: 'text-white' },
      cyan: { bg: 'bg-cyan-600', text: 'text-white' },
      sky: { bg: 'bg-sky-600', text: 'text-white' },
      blue: { bg: 'bg-blue-600', text: 'text-white' },
      indigo: { bg: 'bg-indigo-600', text: 'text-white' },
      purple: { bg: 'bg-purple-600', text: 'text-white' },
      violet: { bg: 'bg-violet-600', text: 'text-white' },
      pink: { bg: 'bg-pink-600', text: 'text-white' },
      rose: { bg: 'bg-rose-600', text: 'text-white' },
      coral: { bg: 'bg-orange-400', text: 'text-white' },
      brown: { bg: 'bg-amber-800', text: 'text-white' },
      slate: { bg: 'bg-slate-600', text: 'text-white' },
    };

    return colorMap[color] || colorMap.green;
  }, []);

  // Memoize indicatorColors
  const indicatorColors = useMemo(() => getIndicatorColorClasses(profileColor), [getIndicatorColorClasses, profileColor]);

  // Navigation handler with immediate feedback
  const handleNavigation = useCallback((path: string) => {
    if (isNavigating) return; // Prevent double-taps
    
    setIsNavigating(true);
    router.push(path);
    
    // Reset navigating state after a short delay
    setTimeout(() => {
      setIsNavigating(false);
    }, 300);
  }, [router, isNavigating]);

  // Touch handler for immediate visual feedback
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLButtonElement>, path: string) => {
    // Immediate visual feedback
    const button = e.currentTarget;
    button.style.opacity = '0.7';
    
    // Navigate
    handleNavigation(path);
    
    // Reset opacity after touch ends
    setTimeout(() => {
      button.style.opacity = '';
    }, 150);
  }, [handleNavigation]);

  const isActive = useCallback((path: string) => pathname === path, [pathname]);

  // Don't show nav on auth pages or if not authenticated
  if (loading || !isAuthenticated || pathname?.startsWith('/login') || pathname?.startsWith('/signup')) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[#1a1a1a] border-t border-gray-200 dark:border-gray-800 pb-4 safe-area-inset-bottom">
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
          onClick={() => handleNavigation('/dashboard')}
          onTouchStart={(e) => handleTouchStart(e, '/dashboard')}
          disabled={isNavigating}
          className={`relative z-10 flex items-center justify-center py-3 px-4 rounded-2xl transition-all duration-200 ease-out min-h-[48px] min-w-[48px] active:scale-95 ${
            isActive('/dashboard')
              ? indicatorColors.text
              : 'text-gray-600 dark:text-gray-400 hover:opacity-80'
          } ${isNavigating ? 'opacity-50' : ''}`}
          style={{ touchAction: 'manipulation' }}
        >
          <span className="text-2xl">🏠</span>
        </button>

        <button
          ref={(el) => { buttonRefs.current[1] = el; }}
          onClick={() => handleNavigation('/record')}
          onTouchStart={(e) => handleTouchStart(e, '/record')}
          disabled={isNavigating}
          className={`relative z-10 flex items-center justify-center py-3 px-4 rounded-2xl transition-all duration-200 ease-out min-h-[48px] min-w-[48px] active:scale-95 ${
            isActive('/record')
              ? indicatorColors.text
              : 'text-gray-600 dark:text-gray-400 hover:opacity-80'
          } ${isNavigating ? 'opacity-50' : ''}`}
          style={{ touchAction: 'manipulation' }}
        >
          <span className="text-2xl">➕</span>
        </button>

        <button
          ref={(el) => { buttonRefs.current[2] = el; }}
          onClick={() => handleNavigation('/leaderboard')}
          onTouchStart={(e) => handleTouchStart(e, '/leaderboard')}
          disabled={isNavigating}
          className={`relative z-10 flex items-center justify-center py-3 px-4 rounded-2xl transition-all duration-200 ease-out min-h-[48px] min-w-[48px] active:scale-95 ${
            isActive('/leaderboard')
              ? indicatorColors.text
              : 'text-gray-600 dark:text-gray-400 hover:opacity-80'
          } ${isNavigating ? 'opacity-50' : ''}`}
          style={{ touchAction: 'manipulation' }}
        >
          <span className="text-2xl">🏆</span>
        </button>

        <button
          ref={(el) => { buttonRefs.current[3] = el; }}
          onClick={() => handleNavigation('/history')}
          onTouchStart={(e) => handleTouchStart(e, '/history')}
          disabled={isNavigating}
          className={`relative z-10 flex items-center justify-center py-3 px-4 rounded-2xl transition-all duration-200 ease-out min-h-[48px] min-w-[48px] active:scale-95 ${
            isActive('/history')
              ? indicatorColors.text
              : 'text-gray-600 dark:text-gray-400 hover:opacity-80'
          } ${isNavigating ? 'opacity-50' : ''}`}
          style={{ touchAction: 'manipulation' }}
        >
          <span className="text-2xl">🕐</span>
        </button>

        <button
          ref={(el) => { buttonRefs.current[4] = el; }}
          onClick={() => handleNavigation('/profile')}
          onTouchStart={(e) => handleTouchStart(e, '/profile')}
          disabled={isNavigating}
          className={`relative z-10 flex items-center justify-center py-3 px-4 rounded-2xl transition-all duration-200 ease-out min-h-[48px] min-w-[48px] active:scale-95 ${
            isActive('/profile')
              ? indicatorColors.text
              : 'text-gray-600 dark:text-gray-400 hover:opacity-80'
          } ${isNavigating ? 'opacity-50' : ''}`}
          style={{ touchAction: 'manipulation' }}
        >
          <span className="text-2xl">👤</span>
        </button>
      </div>
    </nav>
  );
}


