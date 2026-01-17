'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ChevronDown, ChevronUp, Plus, Minus, Trash2, Check, Loader2, Share2, Download, X } from 'lucide-react';
import { formatDateLabel } from '@/lib/date-utils';
import html2canvas from 'html2canvas';

interface Submission {
  id: string;
  count: number;
  created_at: string;
}

interface DayGroup {
  date: Date;
  dateLabel: string;
  total: number;
  submissions: Submission[];
}

interface PendingChanges {
  updates: Map<string, number>; // submissionId -> newCount
  deletes: Set<string>; // submissionIds to delete
}

interface HeatmapDay {
  date: Date;
  count: number;
  isFuture: boolean;
  isToday: boolean;
}

interface MonthlyStats {
  total: number;
  maxSet: number;
}

export default function HistoryPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([]);
  const [originalDayGroups, setOriginalDayGroups] = useState<DayGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [pendingChanges, setPendingChanges] = useState<Map<string, PendingChanges>>(new Map());
  const [savingDays, setSavingDays] = useState<Set<string>>(new Set());
  
  // Heatmap state
  const [profileColor, setProfileColor] = useState<string>('green');
  const [heatmapDays, setHeatmapDays] = useState<HeatmapDay[]>([]);
  const [maxDailyPushups, setMaxDailyPushups] = useState<number>(0);
  const [monthlyStats, setMonthlyStats] = useState<Map<string, MonthlyStats>>(new Map());
  const [lifetimeTotal, setLifetimeTotal] = useState<number>(0);
  const [visibleMonth, setVisibleMonth] = useState<string>('');
  const [weekGrid, setWeekGrid] = useState<(HeatmapDay | null)[][]>([]);
  const [totalWeeks, setTotalWeeks] = useState<number>(0);
  const [daysBeforeMonday, setDaysBeforeMonday] = useState<number>(0);
  const [selectedDay, setSelectedDay] = useState<HeatmapDay | null>(null);
  const heatmapContainerRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  
  // Recap state
  const [selectedRecapMonth, setSelectedRecapMonth] = useState<string | null>(null);
  const [userDisplayName, setUserDisplayName] = useState<string>('');
  const recapCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchUserHistory();
      fetchUserProfileColor();
      fetchUserDisplayName();
    }
  }, [user]);

  // Refresh data periodically to add new weeks as time passes
  // This ensures the heatmap always shows 18 months into the future
  useEffect(() => {
    if (!user) return;

    // Refresh data every hour to catch new weeks
    const refreshInterval = setInterval(() => {
      fetchUserHistory();
    }, 60 * 60 * 1000); // 1 hour

    return () => clearInterval(refreshInterval);
  }, [user]);

  // Generate all days from first Monday of 2026 to 18 months into future from today
  const generateYearRange = (): { days: Date[]; firstMonday: Date; daysBeforeMonday: number } => {
    const jan1_2026 = new Date('2026-01-01');
    jan1_2026.setHours(0, 0, 0, 0);
    
    // Find first Monday of 2026 (Monday = 1)
    const dayOfWeek = jan1_2026.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const daysToMonday = dayOfWeek === 0 ? 1 : (dayOfWeek === 1 ? 0 : 8 - dayOfWeek);
    const firstMonday = new Date(jan1_2026);
    firstMonday.setDate(jan1_2026.getDate() + daysToMonday);
    
    const now = new Date();
    const ukDate = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
    
    // End at 18 months into future from today
    const endDate = new Date(ukDate);
    endDate.setMonth(endDate.getMonth() + 18);
    // Get last day of that month
    // setDate(0) gets the last day of the previous month, so we need to go to next month first
    const targetMonth = endDate.getMonth();
    endDate.setMonth(targetMonth + 1);
    endDate.setDate(0); // This gives us the last day of targetMonth
    endDate.setHours(23, 59, 59, 999);
    
    const days: Date[] = [];
    const current = new Date(firstMonday);
    
    while (current <= endDate) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    
    return {
      days,
      firstMonday: new Date(firstMonday),
      daysBeforeMonday: daysToMonday
    };
  };

  // Process heatmap data when dayGroups change
  const processedHeatmapData = useMemo(() => {
    if (dayGroups.length === 0) return null;
    
    const { days: allDays, firstMonday, daysBeforeMonday } = generateYearRange();
    const now = new Date();
    const ukToday = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
    ukToday.setHours(0, 0, 0, 0);
    
    // Create a map of date strings to pushup counts
    // Use UK date components to create consistent date keys
    const pushupMap = new Map<string, number>();
    let maxDaily = 0;
    let lifetime = 0;
    
    dayGroups.forEach(dayGroup => {
      // Convert dayGroup.date to UK timezone and format as YYYY-MM-DD
      const ukDate = new Date(dayGroup.date.toLocaleString('en-US', { timeZone: 'Europe/London' }));
      ukDate.setHours(0, 0, 0, 0);
      const year = ukDate.getFullYear();
      const month = String(ukDate.getMonth() + 1).padStart(2, '0');
      const day = String(ukDate.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;
      pushupMap.set(dateKey, dayGroup.total);
      if (dayGroup.total > maxDaily) {
        maxDaily = dayGroup.total;
      }
      lifetime += dayGroup.total;
    });
    
    // Also check individual submissions for max daily calculation
    dayGroups.forEach(dayGroup => {
      dayGroup.submissions.forEach(sub => {
        if (sub.count > maxDaily) {
          maxDaily = sub.count;
        }
      });
    });
    
    // Process heatmap days
    const heatmapData: HeatmapDay[] = allDays.map(date => {
      // Convert to UK timezone first, then create dateKey to match dayGroups
      const ukDate = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/London' }));
      ukDate.setHours(0, 0, 0, 0);
      
      // Create dateKey using UK date components (YYYY-MM-DD) to match dayGroups
      const year = ukDate.getFullYear();
      const month = String(ukDate.getMonth() + 1).padStart(2, '0');
      const day = String(ukDate.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;
      
      const isFuture = ukDate > ukToday;
      const isToday = ukDate.getTime() === ukToday.getTime();
      const count = pushupMap.get(dateKey) || 0;
      
      return {
        date: ukDate,
        count,
        isFuture,
        isToday,
      };
    });
    
    // Create week-based grid structure: grid[dayOfWeek][weekIndex]
    // Calculate total weeks needed - ensure we have complete weeks
    // Since we start from first Monday, we need to ensure all weeks are complete
    const totalWeeks = Math.ceil(heatmapData.length / 7);
    const weekGrid: (HeatmapDay | null)[][] = [];
    
    // Initialize grid: 7 rows (days of week) × totalWeeks columns
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      weekGrid[dayOfWeek] = [];
      for (let weekIndex = 0; weekIndex < totalWeeks; weekIndex++) {
        weekGrid[dayOfWeek][weekIndex] = null;
      }
    }
    
    // Fill grid with days - each day goes to its correct dayOfWeek row and weekIndex column
    // Days are sequential, so we assign them to weeks based on their index
    heatmapData.forEach((day, index) => {
      const dayOfWeek = day.date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      const weekIndex = Math.floor(index / 7); // Which week this day belongs to (0-based)
      
      // Ensure weekIndex is within bounds
      if (weekIndex < totalWeeks) {
        weekGrid[dayOfWeek][weekIndex] = day;
      }
    });
    
    // Verify grid completeness - ensure all expected weeks have at least some days
    for (let weekIndex = 0; weekIndex < totalWeeks; weekIndex++) {
      let hasDays = false;
      for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
        if (weekGrid[dayOfWeek]?.[weekIndex]) {
          hasDays = true;
          break;
        }
      }
      // Only warn if this week should have data (within the range of heatmapData)
      if (!hasDays && weekIndex < Math.floor(heatmapData.length / 7)) {
        console.warn(`Week ${weekIndex} has no days but should have data`);
      }
    }
    
    // Calculate monthly stats directly from dayGroups (database data)
    // This ensures we're using the actual recorded data, not processed heatmap data
    const monthlyMap = new Map<string, MonthlyStats>();
    
    // First, calculate stats from actual dayGroups (past data)
    dayGroups.forEach(dayGroup => {
      // Convert to UK timezone to get correct month
      const ukDate = new Date(dayGroup.date.toLocaleString('en-US', { timeZone: 'Europe/London' }));
      ukDate.setHours(0, 0, 0, 0);
      const monthKey = `${ukDate.getFullYear()}-${ukDate.getMonth()}`;
      
      const existing = monthlyMap.get(monthKey) || { total: 0, maxSet: 0 };
      
      // Calculate max set from individual submissions
      const maxSetForDay = Math.max(...dayGroup.submissions.map(sub => sub.count), 0);
      
      monthlyMap.set(monthKey, {
        total: existing.total + dayGroup.total,
        maxSet: Math.max(existing.maxSet, maxSetForDay),
      });
    });
    
    // Now ensure all months in the heatmap range have entries (including future months with zeros)
    heatmapData.forEach(day => {
      const monthKey = `${day.date.getFullYear()}-${day.date.getMonth()}`;
      if (!monthlyMap.has(monthKey)) {
        // Future month or month with no data - ensure entry exists
        monthlyMap.set(monthKey, { total: 0, maxSet: 0 });
      }
    });
    
    return {
      weekGrid,
      heatmapDays: heatmapData,
      maxDailyPushups: maxDaily,
      lifetimeTotal: lifetime,
      monthlyStats: monthlyMap,
      totalWeeks,
      daysBeforeMonday,
    };
  }, [dayGroups]);

  useEffect(() => {
    if (processedHeatmapData) {
      setWeekGrid(processedHeatmapData.weekGrid);
      setHeatmapDays(processedHeatmapData.heatmapDays);
      setMaxDailyPushups(processedHeatmapData.maxDailyPushups);
      setLifetimeTotal(processedHeatmapData.lifetimeTotal);
      setMonthlyStats(processedHeatmapData.monthlyStats);
      setTotalWeeks(processedHeatmapData.totalWeeks);
      setDaysBeforeMonday(processedHeatmapData.daysBeforeMonday);
      
      // Set initial visible month to current month (ensure it's always set)
      const now = new Date();
      const ukToday = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
      const currentMonthKey = `${ukToday.getFullYear()}-${ukToday.getMonth()}`;
      // Only set if not already set or if current month is valid
      if (!visibleMonth || processedHeatmapData.monthlyStats.has(currentMonthKey)) {
        setVisibleMonth(currentMonthKey);
      }
    }
  }, [processedHeatmapData]);

  useEffect(() => {
    if (todayRef.current && heatmapContainerRef.current) {
      // Scroll to today on mount and detect initial visible month
      setTimeout(() => {
        todayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        // Detect initial visible month after scroll
        setTimeout(() => {
          handleHeatmapScroll();
        }, 300);
      }, 100);
    }
  }, [heatmapDays, weekGrid, totalWeeks]);


  // Refresh data when page regains focus (e.g., when navigating back from another page)
  useEffect(() => {
    const handleFocus = () => {
      if (user) {
        fetchUserHistory();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user]);

  const checkUser = async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) {
      router.push('/login');
    } else {
      setUser(currentUser);
    }
  };

  const fetchUserProfileColor = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('profile_color')
        .eq('id', user.id)
        .single();

      if (error) {
        if (error.message?.includes('column') || error.message?.includes('does not exist')) {
          setProfileColor('green');
          return;
        }
        throw error;
      }

      setProfileColor(data?.profile_color || 'green');
    } catch (error) {
      console.error('Error fetching user profile color:', error);
      setProfileColor('green');
    }
  };

  const fetchUserDisplayName = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, first_name')
        .eq('id', user.id)
        .single();
      
      if (error) {
        console.error('Error fetching user display name:', error);
        setUserDisplayName('User');
        return;
      }
      
      setUserDisplayName(data?.display_name || data?.first_name || 'User');
    } catch (error) {
      console.error('Error fetching user display name:', error);
      setUserDisplayName('User');
    }
  };


  // Get heatmap color classes based on profile color and intensity (opacity-based)
  const getHeatmapColorClasses = (count: number, isFuture: boolean, isPastEmpty: boolean): string => {
    if (isFuture) {
      return 'bg-white dark:bg-gray-800';
    }
    
    if (isPastEmpty) {
      return 'bg-gray-200 dark:bg-gray-700';
    }
    
    if (maxDailyPushups === 0) {
      return 'bg-gray-200 dark:bg-gray-700';
    }
    
    const percentage = (count / maxDailyPushups) * 100;
    
    // 5 intensity levels mapped to opacity
    let opacityClass: string;
    if (percentage <= 20) opacityClass = 'opacity-20';
    else if (percentage <= 40) opacityClass = 'opacity-40';
    else if (percentage <= 60) opacityClass = 'opacity-60';
    else if (percentage <= 80) opacityClass = 'opacity-80';
    else opacityClass = 'opacity-100';
    
    // Base color map (single color per profile color)
    const baseColorMap: Record<string, string> = {
      red: 'bg-red-600',
      orange: 'bg-orange-600',
      amber: 'bg-amber-600',
      yellow: 'bg-yellow-600',
      lime: 'bg-lime-600',
      green: 'bg-green-600',
      emerald: 'bg-emerald-600',
      mint: 'bg-teal-400',
      teal: 'bg-teal-600',
      cyan: 'bg-cyan-600',
      sky: 'bg-sky-600',
      blue: 'bg-blue-600',
      indigo: 'bg-indigo-600',
      purple: 'bg-purple-600',
      violet: 'bg-violet-600',
      pink: 'bg-pink-600',
      rose: 'bg-rose-600',
      coral: 'bg-orange-400',
      brown: 'bg-amber-800',
      slate: 'bg-slate-600',
    };
    
    const baseColor = baseColorMap[profileColor] || baseColorMap.green;
    
    return `${baseColor} ${opacityClass}`;
  };

  // Throttle scroll handler
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle scroll to track visible month (leftmost visible column)
  const handleHeatmapScroll = useCallback(() => {
    if (!heatmapContainerRef.current || weekGrid.length === 0 || totalWeeks === 0) return;
    
    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    // Throttle scroll events for performance (reduced throttle for better responsiveness)
    scrollTimeoutRef.current = setTimeout(() => {
      const container = heatmapContainerRef.current;
      if (!container || weekGrid.length === 0 || totalWeeks === 0) return;
      
      const scrollLeft = container.scrollLeft;
      const containerRect = container.getBoundingClientRect();
      
      // Find the leftmost visible square by checking DOM positions
      // Check all squares, including those partially visible
      const squares = container.querySelectorAll<HTMLElement>('[data-date-key]');
      let leftmostSquare: HTMLElement | null = null;
      let leftmostScrollPosition = Infinity;
      
      squares.forEach(square => {
        const rect = square.getBoundingClientRect();
        // Check if square is visible (right edge is past container left, left edge is before container right)
        // This includes partially visible squares
        if (rect.right >= containerRect.left && rect.left <= containerRect.right) {
          // Use scrollLeft position relative to the square's position in the document
          // Calculate the square's position relative to scroll container
          const squareScrollLeft = rect.left - containerRect.left + scrollLeft;
          if (squareScrollLeft < leftmostScrollPosition) {
            leftmostScrollPosition = squareScrollLeft;
            leftmostSquare = square;
          }
        }
      });
      
      // If we found a square, get its date and determine month
      if (leftmostSquare !== null) {
        const dateKey = (leftmostSquare as HTMLElement).getAttribute('data-date-key');
        if (dateKey) {
          try {
            const date = new Date(dateKey);
            const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
            setVisibleMonth(monthKey);
            return;
          } catch (e) {
            console.error('Error parsing date:', e);
          }
        }
      }
      
      // Fallback: Calculate based on scroll position using weekGrid
      // Account for container padding: -mx-4 px-4 means content starts 16px in
      const containerPadding = 16; // px-4 = 16px
      const adjustedScrollLeft = Math.max(0, scrollLeft - containerPadding);
      
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
      const squareSize = isMobile ? 16 : 12;
      const gapSize = 2;
      const weekWidth = (squareSize * 7) + (gapSize * 6);
      
      // Calculate which week is at the leftmost visible position
      const leftmostWeekIndex = Math.floor(adjustedScrollLeft / weekWidth);
      const validWeekIndex = Math.max(0, Math.min(leftmostWeekIndex, totalWeeks - 1));
      
      // Try all 7 days of week to find a valid day (start from Monday for better accuracy)
      let foundMonth = false;
      for (let dayOfWeek = 1; dayOfWeek < 7; dayOfWeek++) {
        const day = weekGrid[dayOfWeek]?.[validWeekIndex];
        if (day) {
          const monthKey = `${day.date.getFullYear()}-${day.date.getMonth()}`;
          setVisibleMonth(monthKey);
          foundMonth = true;
          break;
        }
      }
      // Try Sunday if not found yet
      if (!foundMonth) {
        const day = weekGrid[0]?.[validWeekIndex];
        if (day) {
          const monthKey = `${day.date.getFullYear()}-${day.date.getMonth()}`;
          setVisibleMonth(monthKey);
          foundMonth = true;
        }
      }
      
      // If still no month found, try adjacent weeks
      if (!foundMonth) {
        // Try week before (left)
        for (let offset = 1; offset <= 2 && validWeekIndex - offset >= 0; offset++) {
          for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
            const day = weekGrid[dayOfWeek]?.[validWeekIndex - offset];
            if (day) {
              const monthKey = `${day.date.getFullYear()}-${day.date.getMonth()}`;
              setVisibleMonth(monthKey);
              return;
            }
          }
        }
        // Try week after (right)
        for (let offset = 1; offset <= 2 && validWeekIndex + offset < totalWeeks; offset++) {
          for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
            const day = weekGrid[dayOfWeek]?.[validWeekIndex + offset];
            if (day) {
              const monthKey = `${day.date.getFullYear()}-${day.date.getMonth()}`;
              setVisibleMonth(monthKey);
              return;
            }
          }
        }
        // Final fallback: Use current month if no day found
        const now = new Date();
        const ukDate = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
        const currentMonthKey = `${ukDate.getFullYear()}-${ukDate.getMonth()}`;
        setVisibleMonth(currentMonthKey);
      }
    }, 16); // Throttle to ~60fps for smoother updates
  }, [weekGrid, totalWeeks]);

  // Attach scroll listener directly to ensure it works
  useEffect(() => {
    const container = heatmapContainerRef.current;
    if (!container) return;

    // Add scroll event listener
    container.addEventListener('scroll', handleHeatmapScroll, { passive: true });
    
    // Initial detection
    handleHeatmapScroll();

    return () => {
      container.removeEventListener('scroll', handleHeatmapScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [handleHeatmapScroll]);

  // Also detect initial month when weekGrid is ready
  useEffect(() => {
    if (weekGrid.length > 0 && totalWeeks > 0 && heatmapContainerRef.current) {
      handleHeatmapScroll();
    }
  }, [weekGrid, totalWeeks, handleHeatmapScroll]);

  // Format month name for display (full format like "January 2026")
  const formatMonthName = (monthKey: string): string => {
    const [year, month] = monthKey.split('-').map(Number);
    const date = new Date(year, month, 1);
    return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  };

  // Get months with data (sorted newest first)
  // Only show months that actually have data (total > 0)
  const monthsWithData = useMemo(() => {
    return Array.from(monthlyStats.entries())
      .filter(([_, stats]) => stats.total > 0)
      .sort(([a], [b]) => {
        const [yearA, monthA] = a.split('-').map(Number);
        const [yearB, monthB] = b.split('-').map(Number);
        return yearB * 12 + monthB - (yearA * 12 + monthA);
      });
  }, [monthlyStats]);

  // Generate month-specific heatmap grid (7 columns, variable rows)
  // Day 1 is always in the top-left corner, then fills left-to-right, top-to-bottom
  // Returns grid and total days count
  const getMonthHeatmap = useCallback((monthKey: string): { grid: (HeatmapDay | null)[][], totalDays: number } => {
    const [year, month] = monthKey.split('-').map(Number);
    
    // Create a map of date strings to heatmap days for quick lookup
    const dayMap = new Map<string, HeatmapDay>();
    heatmapDays.forEach(day => {
      const dayYear = day.date.getFullYear();
      const dayMonth = day.date.getMonth();
      if (dayYear === year && dayMonth === month) {
        // Use the actual date from the day object, converted to UK timezone
        const ukDate = new Date(day.date.toLocaleString('en-US', { timeZone: 'Europe/London' }));
        ukDate.setHours(0, 0, 0, 0);
        const dateKey = `${ukDate.getFullYear()}-${String(ukDate.getMonth() + 1).padStart(2, '0')}-${String(ukDate.getDate()).padStart(2, '0')}`;
        dayMap.set(dateKey, day);
      }
    });
    
    // Get total days in month
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    // Calculate number of rows needed (7 columns, always start day 1 at top-left)
    const rows = Math.ceil(totalDays / 7);
    
    // Create grid: 7 columns, variable rows
    // Day 1 goes at (0, 0), Day 2 at (0, 1), etc.
    const grid: (HeatmapDay | null)[][] = [];
    
    // Initialize grid with nulls
    for (let row = 0; row < rows; row++) {
      grid[row] = [];
      for (let col = 0; col < 7; col++) {
        grid[row][col] = null;
      }
    }
    
    // Fill grid with ALL days of the month (not just days with data)
    // Day 1 is at (0, 0), Day 2 at (0, 1), ..., Day 8 at (1, 0), etc.
    const now = new Date();
    const ukToday = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
    ukToday.setHours(0, 0, 0, 0);
    
    for (let dayOfMonth = 1; dayOfMonth <= totalDays; dayOfMonth++) {
      // Create date for this day
      const currentDate = new Date(year, month, dayOfMonth);
      const ukDate = new Date(currentDate.toLocaleString('en-US', { timeZone: 'Europe/London' }));
      ukDate.setHours(0, 0, 0, 0);
      
      // Calculate position in grid: simple sequential placement
      // Day 1 (index 0) -> row 0, col 0
      // Day 2 (index 1) -> row 0, col 1
      // Day 8 (index 7) -> row 1, col 0
      const dayIndex = dayOfMonth - 1; // 0-based index (0 for day 1, 1 for day 2, etc.)
      const row = Math.floor(dayIndex / 7);
      const col = dayIndex % 7;
      
      // Ensure we're within bounds
      if (row >= rows || col >= 7) {
        console.warn(`[RECAP] Day ${dayOfMonth} out of bounds: row=${row}, col=${col}, rows=${rows}`);
        continue;
      }
      
      // Create date key for lookup (using UK timezone)
      const dateKey = `${ukDate.getFullYear()}-${String(ukDate.getMonth() + 1).padStart(2, '0')}-${String(ukDate.getDate()).padStart(2, '0')}`;
      
      // Check if we have data for this day, otherwise create a placeholder
      const existingDay = dayMap.get(dateKey);
      
      if (existingDay) {
        // Use existing day data
        grid[row][col] = existingDay;
      } else {
        // Create a placeholder day for days without data
        const isFuture = ukDate > ukToday;
        const isToday = ukDate.getTime() === ukToday.getTime();
        grid[row][col] = {
          date: ukDate,
          count: 0,
          isFuture,
          isToday,
        };
      }
    }
    
    // Verify grid has all days
    let nonNullCount = 0;
    grid.forEach((row, rowIdx) => {
      const rowDays = row.filter(cell => cell !== null).length;
      nonNullCount += rowDays;
      console.log(`[RECAP] Row ${rowIdx}: ${rowDays} days, ${row.length} total cells`);
    });
    
    console.log(`[RECAP] Grid summary: ${rows} rows, ${nonNullCount} days placed, expected ${totalDays} days`);
    
    if (nonNullCount !== totalDays) {
      console.warn(`[RECAP] Grid mismatch: expected ${totalDays} days, found ${nonNullCount} cells`);
    }
    
    return { grid, totalDays };
  }, [heatmapDays]);

  // Get max daily count for a specific month (for heatmap intensity)
  const getMonthMaxDaily = useCallback((monthKey: string): number => {
    const [year, month] = monthKey.split('-').map(Number);
    const monthDays = heatmapDays.filter(day => {
      const dayYear = day.date.getFullYear();
      const dayMonth = day.date.getMonth();
      return dayYear === year && dayMonth === month;
    });
    
    if (monthDays.length === 0) return 0;
    return Math.max(...monthDays.map(day => day.count));
  }, [heatmapDays]);

  // Format date for tooltip (e.g., "20th Jan 2026")
  const formatDateForTooltip = (date: Date): string => {
    const day = date.getDate();
    const month = date.toLocaleDateString('en-GB', { month: 'short' });
    const year = date.getFullYear();
    
    // Add ordinal suffix (st, nd, rd, th)
    const getOrdinalSuffix = (n: number): string => {
      const j = n % 10;
      const k = n % 100;
      if (j === 1 && k !== 11) return 'st';
      if (j === 2 && k !== 12) return 'nd';
      if (j === 3 && k !== 13) return 'rd';
      return 'th';
    };
    
    return `${day}${getOrdinalSuffix(day)} ${month} ${year}`;
  };


  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    const ukDate = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/London' }));
    
    const hours = ukDate.getHours();
    const minutes = ukDate.getMinutes();
    const ampm = hours >= 12 ? 'p.m.' : 'a.m.';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    
    return `${displayHours}:${displayMinutes} ${ampm}`;
  };

  const groupByDay = (submissions: Submission[]): DayGroup[] => {
    const groups = new Map<string, Submission[]>();
    
    submissions.forEach((submission) => {
      const date = new Date(submission.created_at);
      const ukDate = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/London' }));
      const dayKey = `${ukDate.getFullYear()}-${ukDate.getMonth()}-${ukDate.getDate()}`;
      
      if (!groups.has(dayKey)) {
        groups.set(dayKey, []);
      }
      groups.get(dayKey)!.push(submission);
    });

    const dayGroups: DayGroup[] = Array.from(groups.entries()).map(([dayKey, subs]) => {
      // Get the date from first submission
      const firstDate = new Date(subs[0].created_at);
      const ukDate = new Date(firstDate.toLocaleString('en-US', { timeZone: 'Europe/London' }));
      
      // Reset to start of day for consistent grouping
      const date = new Date(ukDate);
      date.setHours(0, 0, 0, 0);
      
      const total = subs.reduce((sum, sub) => sum + sub.count, 0);
      
      // Sort submissions by time (earliest first)
      subs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      
      return {
        date,
        dateLabel: formatDateLabel(date),
        total,
        submissions: subs,
      };
    });

    // Sort by date (newest first)
    dayGroups.sort((a, b) => b.date.getTime() - a.date.getTime());
    
    return dayGroups;
  };

  const fetchUserHistory = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Fetch all user submissions (no date filter)
      const { data: logs, error } = await supabase
        .from('pushup_logs')
        .select('id, count, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const submissions: Submission[] = (logs || []).map(log => ({
        id: log.id,
        count: log.count,
        created_at: log.created_at,
      }));

      const grouped = groupByDay(submissions);
      setDayGroups(grouped);
      setOriginalDayGroups(grouped);
      // Reset pending changes when fresh data is loaded
      setPendingChanges(new Map());
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleDay = (dateLabel: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(dateLabel)) {
        next.delete(dateLabel);
      } else {
        next.add(dateLabel);
      }
      return next;
    });
  };

  const hasUnsavedChanges = (dateLabel: string): boolean => {
    const changes = pendingChanges.get(dateLabel);
    if (!changes) return false;
    return changes.updates.size > 0 || changes.deletes.size > 0;
  };

  const getSubmissionOriginalCount = (submissionId: string, dateLabel: string): number | null => {
    const originalGroup = originalDayGroups.find(g => g.dateLabel === dateLabel);
    if (!originalGroup) return null;
    const originalSubmission = originalGroup.submissions.find(s => s.id === submissionId);
    return originalSubmission ? originalSubmission.count : null;
  };

  const isSubmissionDeleted = (submissionId: string, dateLabel: string): boolean => {
    const changes = pendingChanges.get(dateLabel);
    return changes?.deletes.has(submissionId) ?? false;
  };

  const isSubmissionModified = (submissionId: string, dateLabel: string): boolean => {
    const changes = pendingChanges.get(dateLabel);
    return changes?.updates.has(submissionId) ?? false;
  };

  const updateSubmission = (submissionId: string, newCount: number, dateLabel: string) => {
    if (newCount < 0) {
      alert('Count cannot be negative');
      return;
    }

    // Find the day group to update
    const dayGroup = dayGroups.find(g => g.dateLabel === dateLabel);
    if (!dayGroup) return;

    // Update local state immediately
    setDayGroups(prev => prev.map(dayGroup => {
      if (dayGroup.dateLabel !== dateLabel) return dayGroup;
      
      const changes = pendingChanges.get(dateLabel) || { updates: new Map(), deletes: new Set() };
      const updatedSubmissions = dayGroup.submissions.map(sub => 
        sub.id === submissionId ? { ...sub, count: newCount } : sub
      );
      
      // Calculate total excluding deleted items
      const total = updatedSubmissions.reduce((sum, sub) => {
        if (changes.deletes.has(sub.id)) return sum;
        return sum + (sub.id === submissionId ? newCount : sub.count);
      }, 0);
      
      return {
        ...dayGroup,
        submissions: updatedSubmissions,
        total,
      };
    }));

    // Track change in pendingChanges
    setPendingChanges(prev => {
      const next = new Map(prev);
      const changes = next.get(dateLabel) || { updates: new Map(), deletes: new Set() };
      
      // Get original count
      const originalCount = getSubmissionOriginalCount(submissionId, dateLabel);
      
      // If new count matches original, remove from pending updates
      if (originalCount !== null && newCount === originalCount) {
        changes.updates.delete(submissionId);
      } else {
        changes.updates.set(submissionId, newCount);
      }
      
      // If it was marked for deletion, remove from deletes
      changes.deletes.delete(submissionId);
      
      if (changes.updates.size === 0 && changes.deletes.size === 0) {
        next.delete(dateLabel);
      } else {
        next.set(dateLabel, changes);
      }
      
      return next;
    });
  };

  const deleteSubmission = (submissionId: string, dateLabel: string) => {
    // Track deletion in pendingChanges
    setPendingChanges(prev => {
      const next = new Map(prev);
      const changes = next.get(dateLabel) || { updates: new Map(), deletes: new Set() };
      
      // Remove from updates if it was modified
      changes.updates.delete(submissionId);
      // Add to deletes
      changes.deletes.add(submissionId);
      
      if (changes.updates.size === 0 && changes.deletes.size === 0) {
        next.delete(dateLabel);
      } else {
        next.set(dateLabel, changes);
      }
      
      return next;
    });
  };

  const saveDayChanges = async (dateLabel: string) => {
    const changes = pendingChanges.get(dateLabel);
    if (!changes || (changes.updates.size === 0 && changes.deletes.size === 0)) {
      return;
    }

    setSavingDays(prev => new Set(prev).add(dateLabel));

    try {
      console.log('💾 Saving changes for', dateLabel, {
        updates: Array.from(changes.updates.entries()),
        deletes: Array.from(changes.deletes),
      });
      
      // NOTE: If updates fail with "No rows were updated", check:
      // 1. RLS policies - Run supabase-rls-fix.sql in Supabase SQL Editor
      // 2. If RLS can't be modified, use fallback - Run supabase-fallback-function.sql
      //    and replace update/delete calls with RPC calls (see that file for details)

      // Batch update all modified submissions
      const updatePromises = Array.from(changes.updates.entries()).map(async ([submissionId, newCount]) => {
        console.log(`🔄 Updating ${submissionId} to ${newCount}...`);
        
        // First, get the current value for comparison and verify ownership
        const beforeResult = await supabase
          .from('pushup_logs')
          .select('count, user_id')
          .eq('id', submissionId)
          .single();
        
        if (beforeResult.error) {
          console.error(`❌ Cannot fetch record ${submissionId} before update:`, beforeResult.error);
          return { error: beforeResult.error, submissionId, newCount };
        }
        
        // Verify this record belongs to the current user
        if (beforeResult.data?.user_id !== user.id) {
          console.error(`❌ Record ${submissionId} does not belong to current user:`, {
            recordUserId: beforeResult.data?.user_id,
            currentUserId: user.id,
          });
          return { error: new Error('Record does not belong to current user'), submissionId, newCount };
        }
        
        console.log(`📊 Before update - ${submissionId}:`, {
          currentCount: beforeResult.data?.count,
          userId: beforeResult.data?.user_id,
          currentUserId: user.id,
          updatingTo: newCount,
        });
        
        // Perform the update - RLS should automatically filter by user_id
        // Removing redundant .eq('user_id', user.id) as RLS handles this
        const updateResult = await supabase
          .from('pushup_logs')
          .update({ count: newCount })
          .eq('id', submissionId);
        
        // Log full result for diagnostics
        console.log(`🔍 Update result for ${submissionId}:`, {
          error: updateResult.error,
          count: updateResult.count,
          data: updateResult.data,
          status: updateResult.status,
          statusText: updateResult.statusText,
        });
        
        if (updateResult.error) {
          console.error(`❌ Update query failed for ${submissionId}:`, updateResult.error);
          console.error(`   Error details:`, {
            message: updateResult.error.message,
            details: updateResult.error.details,
            hint: updateResult.error.hint,
            code: updateResult.error.code,
          });
          return { error: updateResult.error, submissionId, newCount };
        }
        
        // Note: Supabase's update() may not return count reliably with RLS
        // Instead of relying on count, we'll verify by fetching the record
        // Wait a moment for database to commit
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Verify the update by fetching the record
        const checkResult = await supabase
          .from('pushup_logs')
          .select('count, user_id')
          .eq('id', submissionId)
          .single();
        
        console.log(`🔍 Post-update verification for ${submissionId}:`, {
          error: checkResult.error,
          data: checkResult.data,
          expectedCount: newCount,
          actualCount: checkResult.data?.count,
          countMatches: checkResult.data?.count === newCount,
        });
        
        // If we can't fetch the record, that's an error
        if (checkResult.error) {
          console.error(`❌ Cannot verify update for ${submissionId}:`, checkResult.error);
          return { error: checkResult.error, submissionId, newCount };
        }
        
        // If the count doesn't match, the update didn't work
        if (checkResult.data?.count !== newCount) {
          console.error(`❌ Update verification failed for ${submissionId}:`, {
            expected: newCount,
            got: checkResult.data?.count,
            updateResultCount: updateResult.count,
          });
          return { error: new Error('Update verification failed - count mismatch'), submissionId, newCount };
        }
        
        // Update succeeded! (even if count was 0/null, the verification confirms it worked)
        console.log(`✅ Update verified for ${submissionId}:`, {
          updateResultCount: updateResult.count,
          verifiedCount: checkResult.data.count,
        });
        
        return { success: true, submissionId, newCount };
      });

      // Batch delete all marked submissions
      const deletePromises = Array.from(changes.deletes).map(async (submissionId) => {
        console.log(`🗑️ Deleting ${submissionId}...`);
        
        // First verify the record exists and belongs to user
        const { data: existingRecord, error: checkError } = await supabase
          .from('pushup_logs')
          .select('id, user_id')
          .eq('id', submissionId)
          .single();
        
        if (checkError && checkError.code !== 'PGRST116') {
          console.error(`❌ Cannot check record ${submissionId} before delete:`, checkError);
          return { error: checkError, submissionId };
        }
        
        if (!existingRecord) {
          console.warn(`⚠️ Record ${submissionId} already deleted or doesn't exist`);
          return { success: true, submissionId }; // Already deleted, consider success
        }
        
        // Verify ownership
        if (existingRecord.user_id !== user.id) {
          console.error(`❌ Record ${submissionId} does not belong to current user`);
          return { error: new Error('Record does not belong to current user'), submissionId };
        }
        
        // Delete the record - RLS should handle user filtering
        const result = await supabase
          .from('pushup_logs')
          .delete()
          .eq('id', submissionId);
        
        // Log full result for diagnostics
        console.log(`🔍 Delete result for ${submissionId}:`, {
          error: result.error,
          count: result.count,
          data: result.data,
          status: result.status,
        });
        
        if (result.error) {
          console.error(`❌ Delete failed for ${submissionId}:`, result.error);
          console.error(`   Error details:`, {
            message: result.error.message,
            details: result.error.details,
            hint: result.error.hint,
            code: result.error.code,
          });
          return { error: result.error, submissionId };
        }
        
        // Note: Supabase's delete() may not return count reliably with RLS
        // Instead of relying on count, we'll verify by trying to fetch the record
        // Wait a moment for database to commit
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Verify the delete by trying to fetch the record (should fail with PGRST116)
        const checkResult = await supabase
          .from('pushup_logs')
          .select('id')
          .eq('id', submissionId)
          .single();
        
        console.log(`🔍 Post-delete verification for ${submissionId}:`, {
          error: checkResult.error,
          errorCode: checkResult.error?.code,
          data: checkResult.data,
          stillExists: !!checkResult.data,
          deleteResultCount: result.count,
        });
        
        // If we get PGRST116 error, that means the record doesn't exist (delete succeeded)
        if (checkResult.error && checkResult.error.code === 'PGRST116') {
          console.log(`✅ Delete verified for ${submissionId} - record no longer exists`);
          return { success: true, submissionId };
        }
        
        // If we can fetch the record, it still exists (delete failed)
        if (checkResult.data) {
          console.error(`❌ Delete verification failed for ${submissionId}: record still exists`);
          return { error: new Error('Delete verification failed - record still exists'), submissionId };
        }
        
        // If there's an unexpected error, log it but assume success if no data returned
        if (checkResult.error) {
          console.warn(`⚠️ Unexpected error during delete verification for ${submissionId}:`, checkResult.error);
          // If we can't verify but delete query didn't error, assume success
          console.log(`✅ Delete assumed successful for ${submissionId} (verification had unexpected error)`);
          return { success: true, submissionId };
        }
        
        // No error and no data means delete succeeded
        console.log(`✅ Delete verified for ${submissionId}`);
        return { success: true, submissionId };
      });

      // Execute all updates and deletes
      const updateResults = await Promise.all(updatePromises);
      const deleteResults = await Promise.all(deletePromises);

      // Check for errors
      const updateErrors = updateResults.filter(r => r.error);
      const deleteErrors = deleteResults.filter(r => r.error);
      
      if (updateErrors.length > 0 || deleteErrors.length > 0) {
        const errorMessages = [
          ...updateErrors.map(e => `Update failed for ${e.submissionId}: ${e.error?.message}`),
          ...deleteErrors.map(e => `Delete failed for ${e.submissionId}: ${e.error?.message}`),
        ];
        throw new Error(`Failed to save some changes:\n${errorMessages.join('\n')}`);
      }

      console.log('✅ All changes saved and verified for', dateLabel);

      // Store the changes we just saved for final verification
      const savedUpdates = new Map(changes.updates);
      const savedDeletes = new Set(changes.deletes);

      // Wait a moment for database to fully commit
      await new Promise(resolve => setTimeout(resolve, 500));

      // Clear pending changes for this day BEFORE refresh
      setPendingChanges(prev => {
        const next = new Map(prev);
        next.delete(dateLabel);
        return next;
      });

      // Refresh data to ensure consistency across the app
      await fetchUserHistory();
      
      // Verify the refresh shows our changes
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Final verification - check that our changes are reflected
      const verifyPromises: Promise<void>[] = [];
      
      for (const [submissionId, expectedCount] of Array.from(savedUpdates.entries())) {
        verifyPromises.push(
          supabase
            .from('pushup_logs')
            .select('count')
            .eq('id', submissionId)
            .single()
            .then(({ data, error }) => {
              if (error) {
                console.error(`❌ Final verification failed for ${submissionId}:`, error);
              } else if (data?.count !== expectedCount) {
                console.error(`❌ Final verification mismatch for ${submissionId}:`, {
                  expected: expectedCount,
                  got: data?.count,
                });
              } else {
                console.log(`✅ Final verification passed for ${submissionId}:`, data.count);
              }
            }) as Promise<void>
        );
      }
      
      for (const submissionId of Array.from(savedDeletes)) {
        verifyPromises.push(
          supabase
            .from('pushup_logs')
            .select('id')
            .eq('id', submissionId)
            .single()
            .then(({ data, error }) => {
              if (error && error.code === 'PGRST116') {
                console.log(`✅ Final verification passed for deleted ${submissionId}`);
              } else if (data) {
                console.error(`❌ Final verification failed: ${submissionId} still exists`);
              } else {
                console.log(`✅ Final verification passed for deleted ${submissionId}`);
              }
            }) as Promise<void>
        );
      }
      
      await Promise.all(verifyPromises);
      
      console.log('✅ All final verifications complete');
    } catch (error: any) {
      console.error('❌ Error saving changes:', error);
      alert(`Failed to save changes: ${error.message || 'Please try again.'}`);
    } finally {
      setSavingDays(prev => {
        const next = new Set(prev);
        next.delete(dateLabel);
        return next;
      });
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#1a1a1a]">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8 pb-24 bg-white dark:bg-[#1a1a1a]">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <div className="text-left">
            <h1 className="text-3xl font-semibold mb-2 text-black dark:text-white">
              History
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Your submission history
            </p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-600 dark:text-gray-400">
            Loading history...
          </div>
        ) : (
          <>
            {/* Heatmap Section */}
            {heatmapDays.length > 0 && (
              <div className="mb-8">
                {/* Heatmap Grid */}
                <div className="mb-4 bg-gray-50 dark:bg-[#2a2a2a] rounded-2xl border border-gray-200 dark:border-gray-800 p-4 relative overflow-visible">
                  {/* Month Header - Fixed position inside card, updates based on scroll */}
                  {weekGrid.length > 0 && totalWeeks > 0 && (() => {
                    // Ensure we always have a valid month
                    let displayMonth = visibleMonth;
                    
                    // Fallback to current month if visibleMonth is invalid or missing
                    if (!displayMonth || !monthlyStats.has(displayMonth)) {
                      const now = new Date();
                      const ukDate = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
                      displayMonth = `${ukDate.getFullYear()}-${ukDate.getMonth()}`;
                    }
                    
                    // Get stats (create with zeros if missing)
                    const stats = monthlyStats.get(displayMonth) || { total: 0, maxSet: 0 };
                    
                    return (
                      <div className="mb-2 flex justify-between items-start">
                        <div className="text-left flex flex-col">
                          <strong className="font-semibold text-lg text-black dark:text-white">
                            {formatMonthName(displayMonth)}
                          </strong>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            Total: {stats.total} Max Set: {stats.maxSet}
                          </span>
                        </div>
                        {selectedDay && (
                          <div className="text-right">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {selectedDay.count > 0 
                                ? `${selectedDay.count}, ${formatDateForTooltip(selectedDay.date)}`
                                : formatDateForTooltip(selectedDay.date)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Minimal spacer between month title and grid */}
                  <div className="h-2"></div>

                  <div
                    ref={heatmapContainerRef}
                    onScroll={handleHeatmapScroll}
                    onMouseMove={handleHeatmapScroll}
                    className="overflow-x-auto -mx-4 px-4 overflow-y-visible"
                    style={{ WebkitOverflowScrolling: 'touch', overflowY: 'visible' }}
                  >
                    <div className="inline-block">

                      {/* Grid: 7 rows for days of week, columns for weeks */}
                      {weekGrid.length > 0 && totalWeeks > 0 && (
                        <div className="flex flex-col gap-[2px] pb-2" style={{ position: 'relative' }}>
                          {[1, 2, 3, 4, 5, 6, 0].map((dayOfWeek) => (
                            <div key={dayOfWeek} className="flex gap-[2px]" style={{ position: 'relative' }}>
                              {Array.from({ length: totalWeeks }, (_, weekIndex) => {
                                const day = weekGrid[dayOfWeek]?.[weekIndex];
                                
                                if (!day) {
                                  // Empty square - determine if it's before first Monday or after last day
                                  // Calculate the expected sequential index for this position
                                  const expectedDayIndex = weekIndex * 7 + dayOfWeek;
                                  
                                  // Check if this position is before the first Monday (should be transparent)
                                  // The first day in heatmapDays is always a Monday (dayOfWeek = 1)
                                  const firstDay = heatmapDays[0];
                                  const isBeforeFirstMonday = firstDay && weekIndex === 0 && dayOfWeek < firstDay.date.getDay();
                                  
                                  // Check if this position is after the last day (future empty square)
                                  const totalDaysGenerated = heatmapDays.length;
                                  const isAfterLastDay = expectedDayIndex >= totalDaysGenerated;
                                  
                                  // If it's after the last day, it's a future empty square (white)
                                  // If it's before first Monday, it should be transparent (no background)
                                  const isFutureEmpty = isAfterLastDay && !isBeforeFirstMonday;
                                  
                                  return (
                                    <div 
                                      key={`empty-${dayOfWeek}-${weekIndex}`} 
                                      className={`w-[16px] h-[16px] sm:w-[12px] sm:h-[12px] ${
                                        isFutureEmpty ? 'bg-white dark:bg-gray-800' : ''
                                      }`}
                                    />
                                  );
                                }
                                
                                const dateKey = day.date.toISOString().split('T')[0];
                                const isPastEmpty = !day.isFuture && day.count === 0;
                                const colorClass = getHeatmapColorClasses(day.count, day.isFuture, isPastEmpty);
                                
                                return (
                                  <div
                                    key={dateKey}
                                    ref={day.isToday ? todayRef : null}
                                    data-date-key={dateKey}
                                    className={`w-[16px] h-[16px] sm:w-[12px] sm:h-[12px] rounded-sm ${colorClass} ${
                                      day.isToday ? 'border-2 border-black dark:border-white box-border' : ''
                                    } group relative cursor-pointer transition-all hover:scale-110`}
                                    style={{ position: 'relative' }}
                                    onMouseEnter={() => setSelectedDay(day)}
                                    onMouseLeave={() => setSelectedDay(null)}
                                    onTouchStart={() => setSelectedDay(day)}
                                  >
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Lifetime Total */}
                <div className="mb-6 text-left">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Lifetime Total: <span className="font-semibold">{lifetimeTotal.toLocaleString()}</span> pushups
                  </p>
                </div>

                {/* Divider */}
                <div className="pt-4 pb-0">
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-300 dark:border-gray-700"></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Monthly Recap Buttons */}
            {monthsWithData.length > 0 && (
              <>
                <div className="-mt-2 mb-0">
                  <h2 className="text-lg font-semibold text-black dark:text-white m-0">
                    Your Recaps
                  </h2>
                </div>
                <div className="mb-3 overflow-x-auto -mx-4 px-4">
                  <div className="flex gap-2 pb-2">
                    {monthsWithData.map(([monthKey, stats]) => (
                      <button
                        key={monthKey}
                        onClick={() => setSelectedRecapMonth(monthKey)}
                        className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-[#2a2a2a] text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#333] text-sm font-medium whitespace-nowrap shrink-0 transition-colors"
                      >
                        {formatMonthName(monthKey)} Recap
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mb-3 border-t border-gray-200 dark:border-gray-800"></div>
              </>
            )}

            {/* Existing History List */}
            {dayGroups.length === 0 ? (
              <div className="text-center py-12 text-gray-600 dark:text-gray-400">
                No submissions yet. Start tracking your pushups on the Dashboard!
              </div>
            ) : (
              <div className="space-y-3">
            {dayGroups.map((dayGroup) => {
              const isExpanded = expandedDays.has(dayGroup.dateLabel);

              return (
                <div
                  key={dayGroup.dateLabel}
                  className="bg-gray-50 dark:bg-[#2a2a2a] rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden"
                >
                  <div className="p-4 flex items-center justify-between">
                    <button
                      onClick={() => toggleDay(dayGroup.dateLabel)}
                      className="flex-1 flex items-center justify-between text-left hover:bg-gray-100 dark:hover:bg-[#333] transition-colors -m-4 p-4 rounded-lg"
                    >
                      <div>
                        <h3 className="font-semibold text-lg text-black dark:text-white">
                          {dayGroup.dateLabel}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Total: {
                            (() => {
                              const changes = pendingChanges.get(dayGroup.dateLabel);
                              if (changes) {
                                // Calculate total excluding deleted items
                                return dayGroup.submissions.reduce((sum, sub) => {
                                  if (changes.deletes.has(sub.id)) return sum;
                                  return sum + sub.count;
                                }, 0);
                              }
                              return dayGroup.total;
                            })()
                          } pushups
                        </p>
                      </div>
                      <ChevronDown 
                        className={`w-5 h-5 text-gray-600 dark:text-gray-400 transition-transform duration-300 ease-in-out ${
                          isExpanded ? 'rotate-180' : 'rotate-0'
                        }`}
                      />
                    </button>
                    {hasUnsavedChanges(dayGroup.dateLabel) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          saveDayChanges(dayGroup.dateLabel);
                        }}
                        disabled={savingDays.has(dayGroup.dateLabel)}
                        className="ml-3 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white font-medium text-sm active:opacity-80 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-green-500/20"
                      >
                        {savingDays.has(dayGroup.dateLabel) ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            Save
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  <div 
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      isExpanded 
                        ? 'max-h-[2000px] opacity-100' 
                        : 'max-h-0 opacity-0'
                    }`}
                  >
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700 animate-fade-in">
                      <div className="pt-4 space-y-2">
                        {dayGroup.submissions.map((submission) => {
                          const isDeleted = isSubmissionDeleted(submission.id, dayGroup.dateLabel);
                          const isModified = isSubmissionModified(submission.id, dayGroup.dateLabel);
                          const isSaving = savingDays.has(dayGroup.dateLabel);
                          
                          // Don't render deleted items, but show them with strikethrough if needed
                          // Actually, let's show them with visual indicator so user can see what will be deleted
                          
                          return (
                            <div
                              key={submission.id}
                              className={`flex items-center justify-between p-3 bg-white dark:bg-[#1a1a1a] rounded-xl border ${
                                isDeleted 
                                  ? 'border-red-300 dark:border-red-800 opacity-60' 
                                  : isModified
                                  ? 'border-orange-300 dark:border-orange-700'
                                  : 'border-gray-200 dark:border-gray-700'
                              }`}
                            >
                              <div className="flex-1">
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                  {formatTime(submission.created_at)}
                                </p>
                                <div className="flex items-center gap-2">
                                  <p className={`text-lg font-semibold ${
                                    isDeleted
                                      ? 'text-red-600 dark:text-red-400 line-through'
                                      : isModified
                                      ? 'text-orange-600 dark:text-orange-400'
                                      : 'text-black dark:text-white'
                                  }`}>
                                    {submission.count} pushups
                                  </p>
                                  {isModified && !isDeleted && (
                                    <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                                      *
                                    </span>
                                  )}
                                  {isDeleted && (
                                    <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                                      (will be deleted)
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateSubmission(submission.id, submission.count - 1, dayGroup.dateLabel);
                                  }}
                                  disabled={isSaving || submission.count <= 0 || isDeleted}
                                  className="p-2 rounded-lg bg-gray-100 dark:bg-[#2a2a2a] hover:bg-gray-200 dark:hover:bg-[#333] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  aria-label="Decrease count"
                                >
                                  <Minus className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateSubmission(submission.id, submission.count + 1, dayGroup.dateLabel);
                                  }}
                                  disabled={isSaving || isDeleted}
                                  className="p-2 rounded-lg bg-gray-100 dark:bg-[#2a2a2a] hover:bg-gray-200 dark:hover:bg-[#333] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  aria-label="Increase count"
                                >
                                  <Plus className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isDeleted) {
                                      // Undo delete
                                      setPendingChanges(prev => {
                                        const next = new Map(prev);
                                        const changes = next.get(dayGroup.dateLabel) || { updates: new Map(), deletes: new Set() };
                                        changes.deletes.delete(submission.id);
                                        if (changes.updates.size === 0 && changes.deletes.size === 0) {
                                          next.delete(dayGroup.dateLabel);
                                        } else {
                                          next.set(dayGroup.dateLabel, changes);
                                        }
                                        return next;
                                      });
                                    } else {
                                      deleteSubmission(submission.id, dayGroup.dateLabel);
                                    }
                                  }}
                                  disabled={isSaving}
                                  className={`p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                    isDeleted
                                      ? 'bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30'
                                      : 'bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30'
                                  }`}
                                  aria-label={isDeleted ? "Undo delete" : "Delete submission"}
                                >
                                  <Trash2 className={`w-4 h-4 ${
                                    isDeleted 
                                      ? 'text-green-600 dark:text-green-400' 
                                      : 'text-red-600 dark:text-red-400'
                                  }`} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
              </div>
            )}
          </>
        )}

        {/* Recap Modal */}
        {selectedRecapMonth && (() => {
          const monthStats = monthlyStats.get(selectedRecapMonth) || { total: 0, maxSet: 0 };
          const { grid: monthHeatmap, totalDays: monthTotalDays } = getMonthHeatmap(selectedRecapMonth);
          const monthMaxDaily = getMonthMaxDaily(selectedRecapMonth);
          
          return (
            <div 
              className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setSelectedRecapMonth(null);
                }
              }}
            >
              <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
                <div 
                  ref={recapCardRef}
                  className="bg-white dark:bg-[#1a1a1a] rounded-xl p-6 space-y-4"
                  style={{ minWidth: '300px' }}
                >
                  {/* Month Title */}
                  <h2 className="text-2xl font-bold text-black dark:text-white text-center">
                    {formatMonthName(selectedRecapMonth)}
                  </h2>
                  
                  {/* User Name */}
                  <p className="text-center text-gray-600 dark:text-gray-400 text-sm">
                    {userDisplayName}
                  </p>
                  
                  {/* Stats */}
                  <div className="flex justify-center gap-6">
                    <div className="text-center">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total</p>
                      <p className="text-2xl font-bold text-black dark:text-white">
                        {monthStats.total.toLocaleString()}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Max Set</p>
                      <p className="text-2xl font-bold text-black dark:text-white">
                        {monthStats.maxSet}
                      </p>
                    </div>
                  </div>
                  
                  {/* Month Heatmap */}
                  <div className="flex justify-center">
                    <div className="flex flex-col gap-[2px]">
                      {monthHeatmap.map((row, rowIndex) => {
                        // Calculate how many cells to render in this row
                        // Only render cells that are part of the month (not trailing empty cells)
                        const cellsInRow = rowIndex === monthHeatmap.length - 1 
                          ? monthTotalDays % 7 || 7  // Last row: render only the days that exist
                          : 7;  // Other rows: render all 7 cells
                        
                        return (
                          <div key={rowIndex} className="flex gap-[2px]">
                            {Array.from({ length: cellsInRow }, (_, colIndex) => {
                              const day = row[colIndex];
                              
                              if (!day) {
                                // This shouldn't happen for valid month days, but handle it
                                return (
                                  <div 
                                    key={`empty-${rowIndex}-${colIndex}`}
                                    className="w-[12px] h-[12px] bg-white dark:bg-[#1a1a1a] rounded-sm"
                                  />
                                );
                              }
                              
                              const isPastEmpty = !day.isFuture && day.count === 0;
                              // Use month-specific max daily for intensity calculation
                              let colorClass: string;
                              if (day.isFuture) {
                                // Future days: very light gray (lighter than empty days, but visible)
                                colorClass = 'bg-gray-100 dark:bg-gray-800';
                              } else if (isPastEmpty) {
                                // Past days with no pushups: medium gray
                                colorClass = 'bg-gray-200 dark:bg-gray-700';
                              } else if (monthMaxDaily === 0) {
                                colorClass = 'bg-gray-200 dark:bg-gray-700';
                              } else {
                                const percentage = (day.count / monthMaxDaily) * 100;
                                let opacityClass: string;
                                if (percentage <= 20) opacityClass = 'opacity-20';
                                else if (percentage <= 40) opacityClass = 'opacity-40';
                                else if (percentage <= 60) opacityClass = 'opacity-60';
                                else if (percentage <= 80) opacityClass = 'opacity-80';
                                else opacityClass = 'opacity-100';
                                
                                const baseColorMap: Record<string, string> = {
                                  red: 'bg-red-600', orange: 'bg-orange-600', amber: 'bg-amber-600',
                                  yellow: 'bg-yellow-600', lime: 'bg-lime-600', green: 'bg-green-600',
                                  emerald: 'bg-emerald-600', mint: 'bg-teal-400', teal: 'bg-teal-600',
                                  cyan: 'bg-cyan-600', sky: 'bg-sky-600', blue: 'bg-blue-600',
                                  indigo: 'bg-indigo-600', purple: 'bg-purple-600', violet: 'bg-violet-600',
                                  pink: 'bg-pink-600', rose: 'bg-rose-600', coral: 'bg-orange-400',
                                  brown: 'bg-amber-800', slate: 'bg-slate-600',
                                };
                                
                                const baseColor = baseColorMap[profileColor] || baseColorMap.green;
                                colorClass = `${baseColor} ${opacityClass}`;
                              }
                              
                              return (
                                <div
                                  key={`recap-${day.date.getFullYear()}-${day.date.getMonth()}-${day.date.getDate()}-${rowIndex}-${colIndex}`}
                                  className={`w-[12px] h-[12px] rounded-sm ${colorClass}`}
                                  title={`${day.date.toLocaleDateString()}: ${day.count} pushups`}
                                />
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                
                {/* Action Buttons */}
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={async () => {
                      if (!recapCardRef.current) return;
                      
                      try {
                        const canvas = await html2canvas(recapCardRef.current, {
                          background: '#ffffff',
                          scale: 2,
                        } as any);
                        
                        canvas.toBlob(async (blob) => {
                          if (!blob) return;
                          
                          const file = new File([blob], `pushup-recap-${selectedRecapMonth}.png`, { type: 'image/png' });
                          
                          if (navigator.share && navigator.canShare({ files: [file] })) {
                            await navigator.share({
                              title: `${formatMonthName(selectedRecapMonth)} Recap`,
                              files: [file],
                            });
                          } else {
                            // Fallback: download image
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `pushup-recap-${selectedRecapMonth}.png`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }
                        });
                      } catch (error) {
                        console.error('Error generating image:', error);
                      }
                    }}
                    className="flex-1 px-4 py-2 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-black text-sm font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
                  >
                    <Share2 className="w-4 h-4" />
                    Share
                  </button>
                  <button
                    onClick={() => setSelectedRecapMonth(null)}
                    className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-[#2a2a2a] text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#333] text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    Close
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

