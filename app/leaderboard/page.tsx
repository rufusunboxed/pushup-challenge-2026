'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { LogoutButton } from '@/components/LogoutButton';
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

export default function LeaderboardPage() {
  const router = useRouter();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [userChartData, setUserChartData] = useState<Map<string, DailyData[]>>(new Map());
  const [sortBy, setSortBy] = useState<'monthly' | 'daily' | 'maxSet'>('monthly');

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchLeaderboard();
    }
  }, [user]);

  const checkUser = async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) {
      router.push('/login');
    } else {
      setUser(currentUser);
    }
  };


  const fetchLeaderboard = async () => {
    try {
      setLoading(true);
      
      // Fetch all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name');

      if (profilesError) throw profilesError;

      const { dayStart, dayEnd } = getCurrentDayRange();
      const { monthStart, monthEnd } = getCurrentMonthRange();

      // Fetch all pushup logs
      const { data: logs, error: logsError } = await supabase
        .from('pushup_logs')
        .select('user_id, count, created_at');

      if (logsError) throw logsError;

      // Calculate stats for each user
      const entries: LeaderboardEntry[] = profiles.map((profile) => {
        const userLogs = logs.filter((log) => log.user_id === profile.id);
        const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown User';

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
        <div className="mb-8 flex items-start justify-between">
          <div className="text-left flex-1">
            <h1 className="text-3xl font-semibold mb-2 text-black dark:text-white">
              Leaderboard
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              {formatMonthYear()} Challenge
            </p>
          </div>
          <div className="mt-1">
            <LogoutButton />
          </div>
        </div>

        {loading ? (
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
                      // Scale bars to 300 max (not actual max count)
                      const maxScale = 300;
                      const medalEmoji = getMedalEmoji(index);
                      
                      // Find the day with the highest max set
                      const maxSetDay = chartData.length > 0
                        ? chartData.reduce((max, day) => day.maxSet > max.maxSet ? day : max, chartData[0])
                        : null;

                      // Check if this is the current user's card
                      const isCurrentUser = entry.user_id === user.id;

                      return (
                        <div
                          key={entry.user_id}
                          className={`rounded-2xl border overflow-hidden ${
                            isCurrentUser 
                              ? 'bg-green-50 dark:bg-green-900/20 border-green-600 dark:border-green-500' 
                              : 'bg-gray-50 dark:bg-[#2a2a2a] border-gray-200 dark:border-gray-800'
                          }`}
                        >
                          <div className="p-4">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full text-white dark:text-black flex items-center justify-center font-semibold text-sm ${
                                  isCurrentUser 
                                    ? 'bg-green-600 dark:bg-green-500' 
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
                            {isExpanded && chartData.length > 0 && (
                              <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700 pt-4 animate-fade-in">
                              <div className="mb-5">
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                                  {formatMonthYear()} Daily Breakdown
                                </p>
                              </div>
                              <div className="overflow-x-auto -mx-4 px-4" style={{ WebkitOverflowScrolling: 'touch' }}>
                                <div className="flex items-end gap-1 relative" style={{ minWidth: `${chartData.length * 9}px`, width: '100%', paddingTop: '18px', paddingBottom: '4px', minHeight: '70px' }}>
                                  {chartData.map((data, dayIndex) => {
                                    // Scale to 300 max
                                    const height = maxScale > 0 ? Math.min((data.count / maxScale) * 100, 100) : 0;
                                    const isMaxSetDay = maxSetDay && data.day === maxSetDay.day && maxSetDay.maxSet > 0;
                                    
                                    return (
                                      <div
                                        key={dayIndex}
                                        className="flex flex-col items-center group relative"
                                        style={{ 
                                          minWidth: '8px',
                                          flex: '1 1 0%'
                                        }}
                                        title={`Day ${data.day}: ${data.count} pushups${isMaxSetDay ? ` (Max set: ${maxSetDay.maxSet})` : ''}`}
                                      >
                                        {/* Pushup count at top on hover */}
                                        <div className="absolute -top-7 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                          <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap bg-white dark:bg-[#2a2a2a] px-1.5 py-0.5 rounded shadow-sm">
                                            {data.count}
                                          </span>
                                        </div>
                                        
                                        <div className="w-full relative" style={{ height: '48px', minHeight: '48px' }}>
                                          {/* Placeholder bar (always shown - white background) */}
                                          <div
                                            className={`absolute w-full rounded-t bg-white dark:bg-gray-700 bottom-0 ${
                                              isMaxSetDay 
                                                ? 'border-2 border-yellow-500 dark:border-yellow-400' 
                                                : 'border border-gray-300 dark:border-gray-600'
                                            }`}
                                            style={{ height: '100%', width: '100%' }}
                                          />
                                          
                                          {/* Green fill bar (overlay from bottom) */}
                                          {data.count > 0 && (
                                            <div
                                              className={`absolute w-full rounded-t bg-green-600 dark:bg-green-500 group-hover:bg-green-700 dark:group-hover:bg-green-400 transition-all bottom-0 left-0 z-10 ${
                                                isMaxSetDay 
                                                  ? 'border-2 border-yellow-500 dark:border-yellow-400' 
                                                  : ''
                                              }`}
                                              style={{ height: `${Math.max(height, 2)}%`, width: '100%' }}
                                            />
                                          )}
                                        </div>
                                        <span className="text-[9px] text-gray-500 dark:text-gray-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                          {data.day}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="mt-1 text-left">
                                <p className="text-xs text-gray-600 dark:text-gray-400">
                                  Hover over bars to see day and count
                                </p>
                              </div>
                              </div>
                            )}
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

                      return (
                        <div
                          key={entry.user_id}
                          className={`rounded-2xl border overflow-hidden opacity-60 ${
                            isCurrentUser 
                              ? 'bg-green-50 dark:bg-green-900/20 border-green-600 dark:border-green-500' 
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
          </>
        )}
      </div>
    </div>
  );
}


