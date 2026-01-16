'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ChevronDown } from 'lucide-react';
import { getCurrentMonthRange, getDaysInCurrentMonth, formatMonthYear, getCurrentDayRange } from '@/lib/date-utils';

interface LeaderboardEntry {
  user_id: string;
  full_name: string;
  monthly_total: number;
  daily_total: number;
  max_set: number;
  max_set_date: Date | null; // Date when max set was achieved
}

interface DailyData {
  day: number;
  count: number;
  maxSet: number; // Highest single submission for this day
}

type LeaderboardVisibility = 'public' | 'private';

interface LeaderboardMeta {
  id: string;
  code: string;
  name: string;
  visibility: LeaderboardVisibility;
  created_by: string | null;
  created_at: string;
}

export default function LeaderboardPage() {
  const router = useRouter();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [userChartData, setUserChartData] = useState<Map<string, DailyData[]>>(new Map());
  const [sortBy, setSortBy] = useState<'monthly' | 'daily' | 'maxSet'>('monthly');
  const [userProfileColor, setUserProfileColor] = useState<string>('green');
  const [userProfileColors, setUserProfileColors] = useState<Map<string, string>>(new Map());
  const [selectedDayByUser, setSelectedDayByUser] = useState<Map<string, {day: number, count: number, date: Date}>>(new Map());
  const [userMaxDailyInMonth, setUserMaxDailyInMonth] = useState<Map<string, number>>(new Map());
  const [userLeaderboards, setUserLeaderboards] = useState<LeaderboardMeta[]>([]);
  const [publicLeaderboards, setPublicLeaderboards] = useState<LeaderboardMeta[]>([]);
  const [selectedLeaderboardId, setSelectedLeaderboardId] = useState<string | null>(null);
  const [leaderboardListLoading, setLeaderboardListLoading] = useState(true);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [newLeaderboardName, setNewLeaderboardName] = useState('');
  const [newLeaderboardVisibility, setNewLeaderboardVisibility] = useState<LeaderboardVisibility>('public');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchLeaderboardLists();
      fetchUserProfileColor();
    }
  }, [user]);

  useEffect(() => {
    if (user && selectedLeaderboardId) {
      fetchLeaderboard(selectedLeaderboardId);
    }
    if (user && !selectedLeaderboardId) {
      setLeaderboard([]);
      setLoading(false);
    }
  }, [user, selectedLeaderboardId]);

  useEffect(() => {
    if (leaderboard.length > 0) {
      fetchAllUserProfileColors();
    }
  }, [leaderboard]);

  const fetchUserProfileColor = async () => {
    if (!user) return;

    try {
      // Try to fetch profile_color, but handle if column doesn't exist
      const { data, error } = await supabase
        .from('profiles')
        .select('profile_color')
        .eq('id', user.id)
        .single();

      if (error) {
        // If column doesn't exist, use default
        if (error.message?.includes('column') || error.message?.includes('does not exist')) {
          setUserProfileColor('green');
          return;
        }
        throw error;
      }

      setUserProfileColor(data?.profile_color || 'green');
    } catch (error) {
      console.error('Error fetching user profile color:', error);
      // Default to green if there's any error
      setUserProfileColor('green');
    }
  };

  const fetchAllUserProfileColors = async () => {
    try {
      const userIds = leaderboard.map(entry => entry.user_id);
      if (userIds.length === 0) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('id, profile_color')
        .in('id', userIds);

      if (error) {
        // If column doesn't exist, set all to green
        if (error.message?.includes('column') || error.message?.includes('does not exist')) {
          const colorMap = new Map<string, string>();
          userIds.forEach(id => colorMap.set(id, 'green'));
          setUserProfileColors(colorMap);
          return;
        }
        throw error;
      }

      const colorMap = new Map<string, string>();
      data?.forEach(profile => {
        colorMap.set(profile.id, profile.profile_color || 'green');
      });
      // Set default for any missing users
      userIds.forEach(id => {
        if (!colorMap.has(id)) {
          colorMap.set(id, 'green');
        }
      });
      setUserProfileColors(colorMap);
    } catch (error) {
      console.error('Error fetching user profile colors:', error);
      // Default all to green on error
      const colorMap = new Map<string, string>();
      leaderboard.forEach(entry => colorMap.set(entry.user_id, 'green'));
      setUserProfileColors(colorMap);
    }
  };

  const fetchLeaderboardLists = async () => {
    if (!user) return;
    setLeaderboardListLoading(true);
    setActionError(null);
    try {
      const [membershipsResult, publicResult] = await Promise.all([
        supabase
          .from('leaderboard_members')
          .select(`
            leaderboard_id,
            position,
            joined_at,
            leaderboards (
              id,
              code,
              name,
              visibility,
              created_by,
              created_at
            )
          `)
          .eq('user_id', user.id)
          .order('position', { ascending: true })
          .order('joined_at', { ascending: true }),
        supabase
          .from('leaderboards')
          .select('id, code, name, visibility, created_by, created_at')
          .eq('visibility', 'public')
          .order('created_at', { ascending: false })
      ]);

      if (membershipsResult.error) throw membershipsResult.error;
      if (publicResult.error) throw publicResult.error;

      const memberships = (membershipsResult.data || [])
        .map((item: any) => item.leaderboards)
        .filter(Boolean) as LeaderboardMeta[];

      setUserLeaderboards(memberships);
      setPublicLeaderboards((publicResult.data || []) as LeaderboardMeta[]);

      if (memberships.length === 0) {
        setSelectedLeaderboardId(null);
      } else if (!selectedLeaderboardId) {
        setSelectedLeaderboardId(memberships[0].id);
      } else if (!memberships.some(board => board.id === selectedLeaderboardId)) {
        setSelectedLeaderboardId(memberships[0].id);
      }
    } catch (error) {
      console.error('Error fetching leaderboards:', error);
      setActionError('Could not load leaderboards. Please try again.');
    } finally {
      setLeaderboardListLoading(false);
    }
  };

  const generateLeaderboardCode = (): string => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i += 1) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  };

  const generateUniqueLeaderboardCode = async (): Promise<string> => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = generateLeaderboardCode();
      const { data, error } = await supabase
        .from('leaderboards')
        .select('id')
        .eq('code', candidate)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (!data) {
        return candidate;
      }
    }
    throw new Error('Unable to generate a unique code. Please try again.');
  };

  const joinLeaderboardById = async (leaderboardId: string) => {
    if (!user) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const nextPosition = userLeaderboards.length;
      const { error } = await supabase
        .from('leaderboard_members')
        .insert({ leaderboard_id: leaderboardId, user_id: user.id, position: nextPosition });

      if (error && !error.message?.includes('duplicate')) {
        throw error;
      }

      await fetchLeaderboardLists();
      setSelectedLeaderboardId(leaderboardId);
    } catch (error) {
      console.error('Error joining leaderboard:', error);
      setActionError('Unable to join leaderboard. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const joinLeaderboardByCode = async () => {
    if (!user || !joinCode.trim()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const normalized = joinCode.trim().toUpperCase();
      const { data, error } = await supabase
        .from('leaderboards')
        .select('id')
        .eq('code', normalized)
        .maybeSingle();

      if (error) throw error;
      if (!data?.id) {
        setActionError('Invalid code. Please check and try again.');
        return;
      }

      await joinLeaderboardById(data.id);
      setJoinCode('');
      setShowJoinModal(false);
    } catch (error) {
      console.error('Error joining by code:', error);
      setActionError('Unable to join with this code.');
    } finally {
      setActionLoading(false);
    }
  };

  const createLeaderboard = async () => {
    if (!user || !newLeaderboardName.trim()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const code = await generateUniqueLeaderboardCode();
      const { data, error } = await supabase
        .from('leaderboards')
        .insert({
          code,
          name: newLeaderboardName.trim(),
          visibility: newLeaderboardVisibility,
          created_by: user.id
        })
        .select('id')
        .single();

      if (error) throw error;
      if (!data?.id) throw new Error('Failed to create leaderboard.');

      const nextPosition = userLeaderboards.length;
      await supabase
        .from('leaderboard_members')
        .insert({ leaderboard_id: data.id, user_id: user.id, position: nextPosition });

      setGeneratedCode(code);
      setNewLeaderboardName('');
      await fetchLeaderboardLists();
      setSelectedLeaderboardId(data.id);
    } catch (error) {
      console.error('Error creating leaderboard:', error);
      setActionError('Unable to create leaderboard. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyCode = async (code: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      }
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1500);
    } catch (error) {
      console.error('Error copying code:', error);
    }
  };

  const handleLeaveLeaderboard = async () => {
    if (!user || !selectedLeaderboardId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const { error } = await supabase
        .from('leaderboard_members')
        .delete()
        .eq('user_id', user.id)
        .eq('leaderboard_id', selectedLeaderboardId);

      if (error) throw error;

      await fetchLeaderboardLists();
    } catch (error) {
      console.error('Error leaving leaderboard:', error);
      setActionError('Unable to leave leaderboard. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const moveLeaderboard = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setUserLeaderboards(prev => {
      const fromIndex = prev.findIndex(board => board.id === fromId);
      const toIndex = prev.findIndex(board => board.id === toId);
      if (fromIndex === -1 || toIndex === -1) return prev;

      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const persistLeaderboardOrder = async (orderedBoards: LeaderboardMeta[]) => {
    if (!user) return;
    try {
      await Promise.all(
        orderedBoards.map((board, index) =>
          supabase
            .from('leaderboard_members')
            .update({ position: index })
            .eq('user_id', user.id)
            .eq('leaderboard_id', board.id)
        )
      );
    } catch (error) {
      console.error('Error saving leaderboard order:', error);
      setActionError('Unable to save leaderboard order. Please try again.');
    }
  };

  const startLongPress = (boardId: string) => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = window.setTimeout(() => {
      setDraggingId(boardId);
      setDragActive(true);
    }, 250);
  };

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const finishDrag = async () => {
    clearLongPress();
    if (!draggingId) {
      setDragActive(false);
      return;
    }
    const currentOrder = [...userLeaderboards];
    await persistLeaderboardOrder(currentOrder);
    setDraggingId(null);
    setDragActive(false);
  };

  const checkUser = async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) {
      router.push('/login');
    } else {
      setUser(currentUser);
    }
  };


  const fetchLeaderboard = async (leaderboardId: string) => {
    try {
      setLoading(true);
      setActionError(null);

      const { data: members, error: membersError } = await supabase
        .from('leaderboard_members')
        .select('user_id')
        .eq('leaderboard_id', leaderboardId);

      if (membersError) throw membersError;

      const memberIds = (members || []).map(member => member.user_id);
      if (memberIds.length === 0) {
        setLeaderboard([]);
        return;
      }
      
      // Fetch all profiles - try with display_name, fallback to basic columns if it doesn't exist
      let profiles: any[] = [];
      
      const resultWithDisplay = await supabase
        .from('profiles')
        .select('id, first_name, last_name, display_name');
      
      if (resultWithDisplay.error) {
        // If error mentions column doesn't exist, try without display_name
        if (resultWithDisplay.error.message?.includes('column') || 
            resultWithDisplay.error.message?.includes('does not exist') ||
            resultWithDisplay.error.code === '42703') {
          const resultBasic = await supabase
            .from('profiles')
            .select('id, first_name, last_name');
          
          if (resultBasic.error) throw resultBasic.error;
          profiles = resultBasic.data || [];
        } else {
          throw resultWithDisplay.error;
        }
      } else {
        profiles = resultWithDisplay.data || [];
      }

      profiles = profiles.filter(profile => memberIds.includes(profile.id));

      const { dayStart, dayEnd } = getCurrentDayRange();
      const { monthStart, monthEnd } = getCurrentMonthRange();

      // Fetch all pushup logs
      const { data: logs, error: logsError } = await supabase
        .from('pushup_logs')
        .select('user_id, count, created_at');

      if (logsError) throw logsError;

      // Calculate stats for each user
      const entries: LeaderboardEntry[] = profiles.map((profile: any) => {
        const userLogs = logs.filter((log) => log.user_id === profile.id);
        // Use display_name if available, otherwise fall back to first_name only
        const defaultName = `${profile.first_name || ''}`.trim();
        const fullName = profile.display_name || defaultName || 'Unknown User';

        // Monthly total (current month)
        const monthlyLogs = userLogs.filter((log) => {
          const logDate = new Date(log.created_at);
          return logDate >= monthStart && logDate <= monthEnd;
        });
        const monthlyTotal = monthlyLogs.reduce((sum, log) => sum + (log.count || 0), 0);

        // Daily total (current day, UK time)
        const dailyLogs = userLogs.filter((log) => {
          const logDate = new Date(log.created_at);
          return logDate >= dayStart && logDate <= dayEnd;
        });
        const dailyTotal = dailyLogs.reduce((sum, log) => sum + (log.count || 0), 0);

        // Max set (current month only) and find the date it was achieved
        let maxSet = 0;
        let maxSetDate: Date | null = null;
        
        if (monthlyLogs.length > 0) {
          const maxSetLog = monthlyLogs.reduce((max, log) => 
            (log.count || 0) > (max.count || 0) ? log : max
          );
          maxSet = maxSetLog.count || 0;
          maxSetDate = new Date(maxSetLog.created_at);
        }

        return {
          user_id: profile.id,
          full_name: fullName,
          monthly_total: monthlyTotal,
          daily_total: dailyTotal,
          max_set: maxSet,
          max_set_date: maxSetDate,
        };
      });

      // Don't sort here - we'll sort based on sortBy state
      setLeaderboard(entries);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserDailyData = async (userId: string) => {
    // Check if we already have this user's data cached
    if (userChartData.has(userId)) {
      return;
    }

    try {
      const { monthStart, monthEnd } = getCurrentMonthRange();

      const { data: logs, error } = await supabase
        .from('pushup_logs')
        .select('count, created_at')
        .eq('user_id', userId)
        .gte('created_at', monthStart.toISOString())
        .lte('created_at', monthEnd.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Group by day - track both total count and max single submission
      const dailyMap = new Map<number, { total: number; maxSet: number }>();
      
      logs?.forEach((log) => {
        const logDate = new Date(log.created_at);
        const ukDate = new Date(logDate.toLocaleString('en-US', { timeZone: 'Europe/London' }));
        const day = ukDate.getDate();
        const count = log.count || 0;
        
        const existing = dailyMap.get(day) || { total: 0, maxSet: 0 };
        dailyMap.set(day, {
          total: existing.total + count,
          maxSet: Math.max(existing.maxSet, count),
        });
      });

      // Convert to array and fill missing days with 0
      const daysInMonth = getDaysInCurrentMonth();
      const chartData: DailyData[] = [];
      for (let day = 1; day <= daysInMonth; day++) {
        const dayData = dailyMap.get(day) || { total: 0, maxSet: 0 };
        chartData.push({
          day,
          count: dayData.total,
          maxSet: dayData.maxSet,
        });
      }

      // Calculate max daily pushups in this month for this user
      const maxDailyInMonth = Math.max(...chartData.map(d => d.count), 0);
      setUserMaxDailyInMonth(prev => new Map(prev).set(userId, maxDailyInMonth));

      // Cache the data
      setUserChartData(prev => new Map(prev).set(userId, chartData));
    } catch (error) {
      console.error('Error fetching daily chart data for user:', error);
    }
  };

  const toggleUserChart = async (userId: string) => {
    const isExpanded = expandedUsers.has(userId);
    
    if (isExpanded) {
      // Collapse
      setExpandedUsers(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    } else {
      // Expand - fetch data if not cached
      setExpandedUsers(prev => new Set(prev).add(userId));
      await fetchUserDailyData(userId);
    }
  };

  const handleSortChange = (sortType: 'monthly' | 'daily' | 'maxSet') => {
    setSortBy(sortType);
  };

  const getSortedLeaderboard = (): LeaderboardEntry[] => {
    const sorted = [...leaderboard];
    switch (sortBy) {
      case 'daily':
        sorted.sort((a, b) => b.daily_total - a.daily_total);
        break;
      case 'maxSet':
        sorted.sort((a, b) => b.max_set - a.max_set);
        break;
      case 'monthly':
      default:
        sorted.sort((a, b) => b.monthly_total - a.monthly_total);
        break;
    }
    return sorted;
  };

  const splitActiveAndInactive = (): { active: LeaderboardEntry[], inactive: LeaderboardEntry[] } => {
    const sorted = getSortedLeaderboard();
    const active: LeaderboardEntry[] = [];
    const inactive: LeaderboardEntry[] = [];

    sorted.forEach((entry) => {
      let isActive = false;
      switch (sortBy) {
        case 'daily':
          isActive = entry.daily_total > 0;
          break;
        case 'maxSet':
          isActive = entry.max_set > 0;
          break;
        case 'monthly':
        default:
          isActive = entry.monthly_total > 0;
          break;
      }

      if (isActive) {
        active.push(entry);
      } else {
        inactive.push(entry);
      }
    });

    return { active, inactive };
  };

  const getMedalEmoji = (index: number) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return null;
  };

  // Format date for tooltip display
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

  // Get heatmap color classes based on profile color and intensity (opacity-based)
  const getHeatmapColorClasses = (
    count: number,
    maxDailyInMonth: number,
    profileColor: string,
    isFuture: boolean,
    isPastEmpty: boolean
  ): string => {
    if (isFuture) {
      return 'bg-white dark:bg-gray-800';
    }
    
    if (isPastEmpty) {
      return 'bg-gray-200 dark:bg-gray-700';
    }
    
    if (maxDailyInMonth === 0) {
      return 'bg-gray-200 dark:bg-gray-700';
    }
    
    const percentage = (count / maxDailyInMonth) * 100;
    
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

  const getProfileColorClasses = (color: string) => {
    const colorMap: Record<string, { border: string; bg: string; badge: string }> = {
      red: { border: 'border-red-600 dark:border-red-500', bg: 'bg-red-50 dark:bg-red-900/20', badge: 'bg-red-600 dark:bg-red-500' },
      orange: { border: 'border-orange-600 dark:border-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20', badge: 'bg-orange-600 dark:bg-orange-500' },
      amber: { border: 'border-amber-600 dark:border-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20', badge: 'bg-amber-600 dark:bg-amber-500' },
      yellow: { border: 'border-yellow-600 dark:border-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-900/20', badge: 'bg-yellow-600 dark:bg-yellow-500' },
      lime: { border: 'border-lime-600 dark:border-lime-500', bg: 'bg-lime-50 dark:bg-lime-900/20', badge: 'bg-lime-600 dark:bg-lime-500' },
      green: { border: 'border-green-600 dark:border-green-500', bg: 'bg-green-50 dark:bg-green-900/20', badge: 'bg-green-600 dark:bg-green-500' },
      emerald: { border: 'border-emerald-600 dark:border-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20', badge: 'bg-emerald-600 dark:bg-emerald-500' },
      mint: { border: 'border-teal-400 dark:border-teal-300', bg: 'bg-teal-50 dark:bg-teal-900/20', badge: 'bg-teal-400 dark:bg-teal-300' },
      teal: { border: 'border-teal-600 dark:border-teal-500', bg: 'bg-teal-50 dark:bg-teal-900/20', badge: 'bg-teal-600 dark:bg-teal-500' },
      cyan: { border: 'border-cyan-600 dark:border-cyan-500', bg: 'bg-cyan-50 dark:bg-cyan-900/20', badge: 'bg-cyan-600 dark:bg-cyan-500' },
      sky: { border: 'border-sky-600 dark:border-sky-500', bg: 'bg-sky-50 dark:bg-sky-900/20', badge: 'bg-sky-600 dark:bg-sky-500' },
      blue: { border: 'border-blue-600 dark:border-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20', badge: 'bg-blue-600 dark:bg-blue-500' },
      indigo: { border: 'border-indigo-600 dark:border-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-900/20', badge: 'bg-indigo-600 dark:bg-indigo-500' },
      purple: { border: 'border-purple-600 dark:border-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20', badge: 'bg-purple-600 dark:bg-purple-500' },
      violet: { border: 'border-violet-600 dark:border-violet-500', bg: 'bg-violet-50 dark:bg-violet-900/20', badge: 'bg-violet-600 dark:bg-violet-500' },
      pink: { border: 'border-pink-600 dark:border-pink-500', bg: 'bg-pink-50 dark:bg-pink-900/20', badge: 'bg-pink-600 dark:bg-pink-500' },
      rose: { border: 'border-rose-600 dark:border-rose-500', bg: 'bg-rose-50 dark:bg-rose-900/20', badge: 'bg-rose-600 dark:bg-rose-500' },
      coral: { border: 'border-orange-400 dark:border-orange-300', bg: 'bg-orange-50 dark:bg-orange-900/20', badge: 'bg-orange-400 dark:bg-orange-300' },
      brown: { border: 'border-amber-800 dark:border-amber-700', bg: 'bg-amber-50 dark:bg-amber-900/20', badge: 'bg-amber-800 dark:bg-amber-700' },
      slate: { border: 'border-slate-600 dark:border-slate-500', bg: 'bg-slate-50 dark:bg-slate-900/20', badge: 'bg-slate-600 dark:bg-slate-500' },
    };

    return colorMap[color] || colorMap.green;
  };

  const memberLeaderboardIds = new Set(userLeaderboards.map(board => board.id));
  const allUsersLeaderboard = publicLeaderboards.find(board => board.code === 'ALLUSERS');
  const joinablePublicLeaderboards = publicLeaderboards.filter(board => !memberLeaderboardIds.has(board.id));
  const availablePublicLeaderboards = publicLeaderboards.filter(board =>
    board.code !== 'ALLUSERS' && !memberLeaderboardIds.has(board.id)
  );
  const selectedLeaderboardMeta = userLeaderboards.find(board => board.id === selectedLeaderboardId) || null;

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
              Leaderboard
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              {formatMonthYear()} Challenge
            </p>
          </div>
        </div>

        <div className="mb-6 space-y-4">
          {actionError && (
            <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {actionError}
            </div>
          )}

          {leaderboardListLoading ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Loading leaderboards...
            </div>
          ) : userLeaderboards.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto whitespace-nowrap pb-2 -mx-4 px-4">
              {userLeaderboards.map(board => (
                <button
                  key={board.id}
                  onClick={() => {
                    if (dragActive) return;
                    setSelectedLeaderboardId(board.id);
                  }}
                  onPointerDown={() => startLongPress(board.id)}
                  onPointerUp={finishDrag}
                  onPointerCancel={finishDrag}
                  onPointerLeave={() => {
                    if (!draggingId) {
                      clearLongPress();
                    }
                  }}
                  onPointerEnter={() => {
                    if (draggingId) {
                      moveLeaderboard(draggingId, board.id);
                    }
                  }}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all shrink-0 ${
                    selectedLeaderboardId === board.id
                      ? 'bg-black dark:bg-white text-white dark:text-black shadow-sm'
                      : 'bg-gray-100 dark:bg-[#2a2a2a] text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#333]'
                  } ${draggingId === board.id ? 'scale-105 shadow-md' : ''}`}
                >
                  {board.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {allUsersLeaderboard && (
                <div className="inline-flex flex-col items-start gap-2 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#2a2a2a] p-4">
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">
                    Join All Users
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    Opt in to see the main leaderboard.
                  </div>
                  <button
                    onClick={() => joinLeaderboardById(allUsersLeaderboard.id)}
                    disabled={actionLoading}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold bg-black dark:bg-white text-white dark:text-black"
                  >
                    Join
                  </button>
                </div>
              )}

              <div className="space-y-3">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Public leaderboards
                </div>
                {availablePublicLeaderboards.length === 0 ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    No public leaderboards available yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {availablePublicLeaderboards.map(board => (
                      <div
                        key={board.id}
                        className="flex items-center justify-between rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1f1f1f] px-4 py-3"
                      >
                        <div>
                          <div className="text-sm font-semibold text-gray-900 dark:text-white">
                            {board.name}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Public leaderboard
                          </div>
                        </div>
                        <button
                          onClick={() => joinLeaderboardById(board.id)}
                          disabled={actionLoading}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold bg-black dark:bg-white text-white dark:text-black"
                        >
                          Join
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {selectedLeaderboardId ? (
          loading ? (
            <div className="text-center py-12 text-gray-600 dark:text-gray-400">
              Loading leaderboard...
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="text-center py-12 text-gray-600 dark:text-gray-400">
              No entries yet. Be the first!
            </div>
          ) : (
            <>
              {/* Tab Filter UI */}
              <div className="mb-6 bg-gray-100 dark:bg-[#2a2a2a] rounded-2xl p-1.5 flex gap-1.5">
                <button
                  onClick={() => handleSortChange('monthly')}
                  className={`flex-1 py-2.5 px-4 rounded-xl font-medium text-sm transition-all ${
                    sortBy === 'monthly'
                      ? 'bg-black dark:bg-white text-white dark:text-black shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#333]'
                  }`}
                >
                  Monthly Total
                </button>
                <button
                  onClick={() => handleSortChange('daily')}
                  className={`flex-1 py-2.5 px-4 rounded-xl font-medium text-sm transition-all ${
                    sortBy === 'daily'
                      ? 'bg-black dark:bg-white text-white dark:text-black shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#333]'
                  }`}
                >
                  Daily Total
                </button>
                <button
                  onClick={() => handleSortChange('maxSet')}
                  className={`flex-1 py-2.5 px-4 rounded-xl font-medium text-sm transition-all ${
                    sortBy === 'maxSet'
                      ? 'bg-black dark:bg-white text-white dark:text-black shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#333]'
                  }`}
                >
                  Max Set
                </button>
              </div>

              <div className="space-y-3">
                {(() => {
                  const { active, inactive } = splitActiveAndInactive();
                  
                  return (
                    <>
                      {/* Active Users */}
                      {active.map((entry, index) => {
                        const isExpanded = expandedUsers.has(entry.user_id);
                        const chartData = userChartData.get(entry.user_id) || [];
                        const medalEmoji = getMedalEmoji(index);

                        // Check if this is the current user's card
                        const isCurrentUser = entry.user_id === user.id;
                        const colorClasses = isCurrentUser ? getProfileColorClasses(userProfileColor) : null;

                        return (
                          <div
                            key={entry.user_id}
                            className={`rounded-2xl border overflow-hidden ${
                              isCurrentUser && colorClasses
                                ? `${colorClasses.bg} ${colorClasses.border}` 
                                : 'bg-gray-50 dark:bg-[#2a2a2a] border-gray-200 dark:border-gray-800'
                            }`}
                          >
                            <div className="p-4">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-full text-white dark:text-black flex items-center justify-center font-semibold text-sm ${
                                    isCurrentUser && colorClasses
                                      ? colorClasses.badge
                                      : 'bg-black dark:bg-white'
                                  }`}>
                                    {index + 1}
                                  </div>
                                  <h3 className="font-semibold text-lg text-black dark:text-white flex items-center gap-2">
                                    {entry.full_name}
                                    {medalEmoji && <span className="text-2xl">{medalEmoji}</span>}
                                  </h3>
                                </div>
                                <button
                                  onClick={() => toggleUserChart(entry.user_id)}
                                  className="p-2 hover:bg-gray-100 dark:hover:bg-[#333] rounded-lg transition-colors"
                                  aria-label={isExpanded ? 'Collapse chart' : 'Expand chart'}
                                >
                                  <ChevronDown 
                                    className={`w-5 h-5 text-gray-600 dark:text-gray-400 transition-transform duration-300 ease-in-out ${
                                      isExpanded ? 'rotate-180' : 'rotate-0'
                                    }`}
                                  />
                                </button>
                              </div>
                              <div className="grid grid-cols-3 gap-4 text-sm">
                                <div>
                                  <p className="text-gray-600 dark:text-gray-400 mb-1">Monthly Total</p>
                                  <p className="font-semibold text-black dark:text-white text-lg">
                                    {entry.monthly_total}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-gray-600 dark:text-gray-400 mb-1">Daily Total</p>
                                  <p className="font-semibold text-black dark:text-white text-lg">
                                    {entry.daily_total}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-yellow-500 dark:text-yellow-400 mb-1">Max Set</p>
                                  <div className="flex items-baseline gap-2">
                                    <p className="font-semibold text-black dark:text-white text-lg">
                                      {entry.max_set}
                                    </p>
                                    {entry.max_set_date && (
                                      <p className="text-xs text-gray-500 dark:text-gray-500">
                                        {entry.max_set_date.toLocaleDateString('en-GB', { 
                                          day: 'numeric', 
                                          month: 'short',
                                          timeZone: 'Europe/London'
                                        })}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                          {/* Collapsible Chart Section */}
                          <div 
                            className={`overflow-hidden transition-all duration-300 ease-in-out ${
                              isExpanded && chartData.length > 0 
                                ? 'max-h-[1000px] opacity-100' 
                                : 'max-h-0 opacity-0'
                            }`}
                          >
                            {isExpanded && chartData.length > 0 && (() => {
                              const maxDailyInMonth = userMaxDailyInMonth.get(entry.user_id) || 0;
                              const selectedDay = selectedDayByUser.get(entry.user_id);
                              
                              // Get today's date in UK timezone
                              const now = new Date();
                              const ukToday = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
                              const todayDay = ukToday.getDate();
                              const todayMonth = ukToday.getMonth();
                              const todayYear = ukToday.getFullYear();
                              
                              // Get current month info
                              const { monthStart } = getCurrentMonthRange();
                              const currentMonth = monthStart.getMonth();
                              const currentYear = monthStart.getFullYear();
                              
                              return (
                                <div className="px-4 pb-3 border-t border-gray-200 dark:border-gray-700 pt-3 animate-fade-in">
                                  {/* Header with month name and selected day info - fixed height */}
                                  <div className="mb-1 flex justify-between items-start min-h-[32px]">
                                    <div className="text-left flex flex-col">
                                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                                        {formatMonthYear()} Daily Breakdown
                                      </p>
                                    </div>
                                    <div className="text-right min-w-[120px]">
                                      {selectedDay ? (
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                          {selectedDay.count > 0 
                                            ? `${selectedDay.count}, ${formatDateForTooltip(selectedDay.date)}`
                                            : formatDateForTooltip(selectedDay.date)}
                                        </span>
                                      ) : (
                                        <span className="text-xs text-transparent">Placeholder</span>
                                      )}
                                    </div>
                                  </div>
                                  
                                  {/* Heatmap grid - left aligned, 11 squares per row with same sizing as history */}
                                  <div className="flex flex-wrap gap-[2px] justify-start">
                                    {chartData.map((data) => {
                                      // Determine if this day is in the future
                                      const isFuture = currentYear === todayYear && 
                                                       currentMonth === todayMonth && 
                                                       data.day > todayDay;
                                      
                                      // Determine if this is a past empty day
                                      const isPastEmpty = !isFuture && data.count === 0;
                                      
                                      // Use the current logged-in user's profile color for all heatmaps
                                      const colorClass = getHeatmapColorClasses(
                                        data.count,
                                        maxDailyInMonth,
                                        userProfileColor,
                                        isFuture,
                                        isPastEmpty
                                      );
                                      
                                      // Create date object for this day
                                      const dayDate = new Date(currentYear, currentMonth, data.day);
                                      
                                      return (
                                        <div
                                          key={data.day}
                                          className={`w-[16px] h-[16px] sm:w-[12px] sm:h-[12px] rounded-sm ${colorClass} cursor-pointer transition-all hover:scale-110`}
                                          onMouseEnter={() => {
                                            setSelectedDayByUser(prev => {
                                              const next = new Map(prev);
                                              next.set(entry.user_id, {
                                                day: data.day,
                                                count: data.count,
                                                date: dayDate
                                              });
                                              return next;
                                            });
                                          }}
                                          onMouseLeave={() => {
                                            setSelectedDayByUser(prev => {
                                              const next = new Map(prev);
                                              next.delete(entry.user_id);
                                              return next;
                                            });
                                          }}
                                          onTouchStart={() => {
                                            setSelectedDayByUser(prev => {
                                              const next = new Map(prev);
                                              next.set(entry.user_id, {
                                                day: data.day,
                                                count: data.count,
                                                date: dayDate
                                              });
                                              return next;
                                            });
                                          }}
                                        />
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })}

                    {/* Divider between active and inactive users */}
                    {inactive.length > 0 && active.length > 0 && (
                      <div className="py-4">
                        <div className="relative">
                          <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-300 dark:border-gray-700"></div>
                          </div>
                          <div className="relative flex justify-center">
                            <span className="bg-white dark:bg-[#1a1a1a] px-4 text-sm text-gray-500 dark:text-gray-400">
                              Inactive this month
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Inactive Users - Compact Grayed Cards */}
                    {inactive.map((entry) => {
                      // Check if this is the current user's card
                      const isCurrentUser = entry.user_id === user.id;
                      const colorClasses = isCurrentUser ? getProfileColorClasses(userProfileColor) : null;

                      return (
                        <div
                          key={entry.user_id}
                          className={`rounded-2xl border overflow-hidden opacity-60 ${
                            isCurrentUser && colorClasses
                              ? `${colorClasses.bg} ${colorClasses.border}` 
                              : 'bg-gray-100 dark:bg-[#1f1f1f] border-gray-300 dark:border-gray-700'
                          }`}
                        >
                          <div className="p-3">
                            <div className="flex items-center justify-between">
                              <h3 className={`font-medium text-sm flex items-center gap-2 ${
                                isCurrentUser 
                                  ? 'text-green-700 dark:text-green-400' 
                                  : 'text-gray-400 dark:text-gray-500'
                              }`}>
                                {entry.full_name}
                              </h3>
                              <div className="flex items-center gap-3 text-xs">
                                <div className="text-gray-400 dark:text-gray-500">
                                  <span className="text-gray-500 dark:text-gray-600">Monthly: </span>
                                  <span className="font-medium">{entry.monthly_total}</span>
                                </div>
                                <div className="text-gray-400 dark:text-gray-500">
                                  <span className="text-gray-500 dark:text-gray-600">Daily: </span>
                                  <span className="font-medium">{entry.daily_total}</span>
                                </div>
                                <div className="text-gray-400 dark:text-gray-500">
                                  <span className="text-gray-500 dark:text-gray-600">Max: </span>
                                  <span className="font-medium">{entry.max_set}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    </>
                  );
                })()}
              </div>

              {selectedLeaderboardMeta && (
                <div className="mt-6 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#2a2a2a] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                      Share this code to add new users
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {selectedLeaderboardMeta.code}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopyCode(selectedLeaderboardMeta.code)}
                      className="px-3 py-2 rounded-xl text-xs font-semibold bg-black dark:bg-white text-white dark:text-black"
                    >
                      {copiedCode ? 'Copied!' : 'Copy code'}
                    </button>
                    <button
                      onClick={handleLeaveLeaderboard}
                      disabled={actionLoading}
                      className="px-3 py-2 rounded-xl text-xs font-semibold bg-red-600 text-white"
                    >
                      Leave leaderboard
                    </button>
                  </div>
                </div>
              )}
            </>
          )
        ) : (
          <div className="text-center py-12 text-gray-600 dark:text-gray-400">
            Join a leaderboard to view rankings.
          </div>
        )}

        <div className="mt-8">
          <div className="relative py-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white dark:bg-[#1a1a1a] px-4 text-sm text-gray-500 dark:text-gray-400">
                Want another leaderboard?
              </span>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => {
                setShowJoinModal(true);
                setActionError(null);
              }}
              className="flex-1 px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-800 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#2a2a2a]"
            >
              Join a leaderboard
            </button>
            <button
              onClick={() => {
                setShowCreateModal(true);
                setGeneratedCode(null);
                setActionError(null);
              }}
              className="flex-1 px-4 py-3 rounded-2xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold"
            >
              Create a leaderboard
            </button>
          </div>
        </div>

        {showJoinModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1a1a1a] p-6 shadow-lg">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Join a leaderboard
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Enter the 6-character code to join a private leaderboard.
              </p>
              {actionError && (
                <div className="mb-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                  {actionError}
                </div>
              )}
              {joinablePublicLeaderboards.length > 0 && (
                <div className="mb-4 space-y-2">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Public leaderboards
                  </div>
                  <div className="space-y-2">
                    {joinablePublicLeaderboards.map(board => (
                      <div
                        key={board.id}
                        className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#2a2a2a] px-3 py-2"
                      >
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {board.name}
                          </div>
                          <div className="text-[11px] text-gray-500 dark:text-gray-400">
                            Public
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            joinLeaderboardById(board.id);
                            setShowJoinModal(false);
                          }}
                          disabled={actionLoading}
                          className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-black dark:bg-white text-white dark:text-black"
                        >
                          Join
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                placeholder="Enter code"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111] px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none"
              />
              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => {
                    setShowJoinModal(false);
                    setJoinCode('');
                    setActionError(null);
                  }}
                  className="flex-1 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={joinLeaderboardByCode}
                  disabled={actionLoading || joinCode.trim().length === 0}
                  className="flex-1 px-4 py-2 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold"
                >
                  Join
                </button>
              </div>
            </div>
          </div>
        )}

        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1a1a1a] p-6 shadow-lg">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Create a leaderboard
              </h3>
              {actionError && (
                <div className="mb-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                  {actionError}
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">
                    Leaderboard name
                  </label>
                  <input
                    value={newLeaderboardName}
                    onChange={(event) => setNewLeaderboardName(event.target.value)}
                    placeholder="My crew"
                    className="mt-2 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111] px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">
                    Visibility
                  </label>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => setNewLeaderboardVisibility('public')}
                      className={`flex-1 px-3 py-2 rounded-xl text-sm font-semibold ${
                        newLeaderboardVisibility === 'public'
                          ? 'bg-black dark:bg-white text-white dark:text-black'
                          : 'bg-gray-100 dark:bg-[#2a2a2a] text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      Public
                    </button>
                    <button
                      onClick={() => setNewLeaderboardVisibility('private')}
                      className={`flex-1 px-3 py-2 rounded-xl text-sm font-semibold ${
                        newLeaderboardVisibility === 'private'
                          ? 'bg-black dark:bg-white text-white dark:text-black'
                          : 'bg-gray-100 dark:bg-[#2a2a2a] text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      Private
                    </button>
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#2a2a2a] px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
                  {generatedCode
                    ? `Share this code: ${generatedCode}`
                    : 'A 6-character code will be generated on create.'}
                </div>
              </div>
              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setGeneratedCode(null);
                    setActionError(null);
                  }}
                  className="flex-1 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300"
                >
                  Close
                </button>
                <button
                  onClick={createLeaderboard}
                  disabled={actionLoading || newLeaderboardName.trim().length === 0}
                  className="flex-1 px-4 py-2 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


