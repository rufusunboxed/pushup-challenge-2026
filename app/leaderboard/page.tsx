'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ChevronDown, MoreVertical, X, Share2 } from 'lucide-react';
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
  const [userProfileColor, setUserProfileColor] = useState<string>('mint');
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
  const [showReorderMenu, setShowReorderMenu] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const reorderMenuRef = useRef<HTMLDivElement>(null);
  const reorderButtonRef = useRef<HTMLButtonElement>(null);
  const [reorderMenuPosition, setReorderMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const [pendingReorder, setPendingReorder] = useState<LeaderboardMeta[] | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  useEffect(() => {
    checkUser();
    // Try to restore last selected leaderboard from localStorage
    if (typeof window !== 'undefined') {
      const lastSelected = localStorage.getItem('lastSelectedLeaderboardId');
      if (lastSelected) {
        setSelectedLeaderboardId(lastSelected);
      }
    }
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

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const reorderMenu = reorderMenuRef.current;
      const reorderButton = reorderButtonRef.current;
      const sortDropdown = document.querySelector('[data-sort-dropdown]');
      
      if (showReorderMenu) {
        const isClickInMenu = target.closest('[data-reorder-menu]');
        const isClickOnButton = reorderButton && reorderButton.contains(target);
        if (!isClickInMenu && !isClickOnButton) {
          setShowReorderMenu(false);
          setReorderMenuPosition(null);
          setPendingReorder(null); // Reset pending changes when closing menu
        }
      }
      if (showSortDropdown && sortDropdown && !sortDropdown.contains(target)) {
        setShowSortDropdown(false);
      }
    };

    if (showReorderMenu || showSortDropdown) {
      // Use a small delay to avoid immediate closure
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showReorderMenu, showSortDropdown]);

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

      setUserProfileColor(data?.profile_color || 'mint');
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
        colorMap.set(profile.id, profile.profile_color || 'mint');
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
      const publicRequest = supabase
        .from('leaderboards')
        .select('id, code, name, visibility, created_by, created_at')
        .eq('visibility', 'public')
        .order('created_at', { ascending: false });

      const membershipsResult = await supabase
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
        .order('position', { ascending: true, nullsFirst: false });

      const publicResult = await publicRequest;

      if (publicResult.error) throw publicResult.error;

      // Check if position column exists
      const missingColumn = membershipsResult.error && (
        membershipsResult.error.message?.includes('column') ||
        membershipsResult.error.message?.includes('does not exist') ||
        membershipsResult.error.code === '42703'
      );

      if (missingColumn) {
        console.error('Position column does not exist in leaderboard_members table. Please run the migration SQL.');
        setActionError('Database migration required. Please run the position column migration SQL in Supabase.');
        setUserLeaderboards([]);
        setLeaderboardListLoading(false);
        return;
      }

      if (membershipsResult.error) {
        throw membershipsResult.error;
      }

      const resolvedMemberships = membershipsResult.data || [];
      console.log('[FETCH] Raw memberships from database (ordered by position):', resolvedMemberships.map((item: any) => ({
        leaderboard: item.leaderboards?.name,
        position: item.position,
        joined_at: item.joined_at
      })));
      
      // Check for NULL positions and backfill if needed
      const hasNullPositions = resolvedMemberships.some((item: any) => item.position == null);
      if (hasNullPositions) {
        console.log('[FETCH] Found NULL positions, backfilling...');
        await backfillLeaderboardPositions(resolvedMemberships);
        // Refetch to get updated positions (with ordering)
        const { data: refetchedData, error: refetchError } = await supabase
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
          .order('position', { ascending: true, nullsFirst: false });
        
        if (refetchError) {
          console.error('[FETCH] Error refetching after backfill:', refetchError);
        } else {
          console.log('[FETCH] Refetched after backfill:', refetchedData?.map((item: any) => ({
            leaderboard: item.leaderboards?.name,
            position: item.position
          })));
          resolvedMemberships.splice(0, resolvedMemberships.length, ...(refetchedData || []));
        }
      }
      
      // Get all leaderboards first
      const allLeaderboards = (resolvedMemberships as any[])
        .map((item: any) => item.leaderboards)
        .filter((lb: any) => lb != null) as LeaderboardMeta[];
      
      // Try to load order from localStorage first (most reliable)
      const localStorageOrder = loadOrderFromLocalStorage();
      let finalOrder: LeaderboardMeta[] = [];
      
      if (localStorageOrder && localStorageOrder.length > 0) {
        // Use localStorage order if available
        console.log('[FETCH] Using localStorage order');
        const orderMap = new Map(allLeaderboards.map(lb => [lb.id, lb]));
        finalOrder = localStorageOrder
          .map(id => orderMap.get(id))
          .filter((lb): lb is LeaderboardMeta => lb != null);
        
        // Add any new leaderboards that aren't in localStorage order (newly joined)
        const existingIds = new Set(finalOrder.map(lb => lb.id));
        const newLeaderboards = allLeaderboards.filter(lb => !existingIds.has(lb.id));
        finalOrder = [...finalOrder, ...newLeaderboards];
        
        // Update localStorage with complete order (including new ones)
        saveOrderToLocalStorage(finalOrder);
      } else {
        // Fallback to database position order
        console.log('[FETCH] Using database position order (no localStorage)');
        const membershipsWithPosition = (resolvedMemberships as any[])
          .map((item: any) => ({
            leaderboard: item.leaderboards,
            position: item.position != null ? Number(item.position) : 999999,
            joined_at: item.joined_at,
            leaderboard_id: item.leaderboard_id
          }))
          .filter((item: any) => item.leaderboard)
          .sort((a: any, b: any) => {
            const posA = a.position === 999999 ? null : a.position;
            const posB = b.position === 999999 ? null : b.position;
            
            if (posA == null && posB == null) {
              const dateA = a.joined_at ? new Date(a.joined_at).getTime() : 0;
              const dateB = b.joined_at ? new Date(b.joined_at).getTime() : 0;
              return dateA - dateB;
            } else if (posA == null) {
              return 1;
            } else if (posB == null) {
              return -1;
            } else {
              return posA - posB;
            }
          })
          .map((item: any) => item.leaderboard) as LeaderboardMeta[];
        
        finalOrder = membershipsWithPosition;
        // Save to localStorage for next time
        saveOrderToLocalStorage(finalOrder);
      }
      
      // Debug: Log the final order
      if (finalOrder.length > 0) {
        console.log('[FETCH] Final order:', finalOrder.map((b, idx) => `${idx}: ${b.name}`));
      } else {
        console.log('[FETCH] No leaderboards found');
      }

      const membershipError = membershipsResult.error;
      if (membershipError) {
        console.error('Error fetching memberships:', membershipError);
        setUserLeaderboards([]);
        setActionError('Could not load your memberships. Please try again.');
      } else {
        setUserLeaderboards(finalOrder);
      }
      setPublicLeaderboards((publicResult.data || []) as LeaderboardMeta[]);

      // Handle selected leaderboard - preserve current selection if it still exists
      // Priority: 1) Current selection (if exists), 2) localStorage, 3) First in list
      if (finalOrder.length === 0) {
        setSelectedLeaderboardId(null);
        if (typeof window !== 'undefined') {
          localStorage.removeItem('lastSelectedLeaderboardId');
        }
      } else {
        // Check if current selection still exists in the new ordered list
        const currentSelectionExists = selectedLeaderboardId && 
          finalOrder.some(board => board.id === selectedLeaderboardId);
        
        if (currentSelectionExists) {
          // Current selection exists, keep it - don't update state unnecessarily
          // Just update localStorage to ensure it's saved
          if (typeof window !== 'undefined') {
            localStorage.setItem('lastSelectedLeaderboardId', selectedLeaderboardId);
          }
          console.log('Preserved current selection:', selectedLeaderboardId);
        } else {
          // Current selection doesn't exist, need to pick a new one
          let leaderboardToSelect: string | null = null;
          
          // Try localStorage first
          if (typeof window !== 'undefined') {
            const lastSelected = localStorage.getItem('lastSelectedLeaderboardId');
            if (lastSelected && finalOrder.some(board => board.id === lastSelected)) {
              leaderboardToSelect = lastSelected;
              console.log('Restored selection from localStorage:', lastSelected);
            }
          }
          
          // If no valid selection from localStorage, use first one
          if (!leaderboardToSelect) {
            leaderboardToSelect = finalOrder[0].id;
            console.log('Selected first leaderboard:', leaderboardToSelect);
          }
          
          setSelectedLeaderboardId(leaderboardToSelect);
          if (typeof window !== 'undefined') {
            localStorage.setItem('lastSelectedLeaderboardId', leaderboardToSelect);
          }
        }
      }
    } catch (error: any) {
      console.error('Error fetching leaderboards:', error);
      const message = error?.message || 'Could not load leaderboards. Please try again.';
      setActionError(message);
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
      console.log('Inserting membership - leaderboardId:', leaderboardId, 'userId:', user.id, 'position:', nextPosition);
      
      const { error } = await supabase
        .from('leaderboard_members')
        .insert({ leaderboard_id: leaderboardId, user_id: user.id, position: nextPosition });

      if (error) {
        console.error('INSERT error:', error);
        if (!error.message?.includes('duplicate')) {
          throw error;
        }
        // If duplicate, user is already a member - that's okay
        console.log('User is already a member, continuing...');
      }

      await fetchLeaderboardLists();
      // fetchLeaderboardLists will update localStorage automatically
      setSelectedLeaderboardId(leaderboardId);
      setShowJoinModal(false);
      setJoinCode('');
    } catch (error: any) {
      console.error('Error joining leaderboard:', error);
      const errorMessage = error?.message || 'Unable to join leaderboard. Please try again.';
      setActionError(errorMessage);
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
      console.log('Attempting to join leaderboard with code:', normalized);
      
      const nextPosition = userLeaderboards.length;
      
      // Use the combined RPC function that handles the entire join process
      const { data, error } = await supabase
        .rpc('join_leaderboard_by_code', { 
          code_input: normalized,
          position_input: nextPosition
        });

      console.log('RPC response - data:', data, 'error:', error);
      console.log('Full RPC response:', JSON.stringify({ data, error }, null, 2));

      if (error) {
        console.error('RPC error:', error);
        throw error;
      }
      
      // RPC returns JSON with success and leaderboard_id
      if (!data || !data.success) {
        const errorMsg = data?.error || 'Invalid code. Please check and try again.';
        console.error('Join failed - debug info:', data);
        console.error('Code searched:', normalized);
        console.error('Debug codes in DB:', data?.debug_all_codes);
        console.error('Total leaderboards:', data?.debug_total_leaderboards);
        setActionError(errorMsg);
        return;
      }

      const leaderboardId = data.leaderboard_id;
      console.log('Successfully joined leaderboard ID:', leaderboardId);
      
      await fetchLeaderboardLists();
      setSelectedLeaderboardId(leaderboardId);
      setShowJoinModal(false);
      setJoinCode('');
    } catch (error: any) {
      console.error('Error joining by code:', error);
      const errorMessage = error?.message || 'Unable to join with this code.';
      setActionError(errorMessage);
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
      const visibility = newLeaderboardVisibility === 'private' ? 'private' : 'public';
      const { data, error } = await supabase
        .from('leaderboards')
        .insert({
          code,
          name: newLeaderboardName.trim(),
          visibility,
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
      setShowCreateModal(false);
      setGeneratedCode(null);
    } catch (error: any) {
      console.error('Error creating leaderboard:', error);
      const message = error?.message || 'Unable to create leaderboard. Please try again.';
      setActionError(message);
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

  const handleShareLeaderboard = async (code: string) => {
    const message = `Join my leaderboard on Pushup Challenge! Use the code ${code} to join my leaderboard.`;
    const url = typeof window !== 'undefined' ? window.location.origin : '';
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join my leaderboard',
          text: message,
          url: url,
        });
      } catch (error) {
        // User cancelled or error occurred
        if ((error as Error).name !== 'AbortError') {
          console.error('Error sharing:', error);
        }
      }
    } else {
      // Fallback to copy
      handleCopyCode(code);
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

  const backfillLeaderboardPositions = async (memberships: any[]) => {
    if (!user) return;
    
    // Find memberships with NULL positions
    const nullPositionMemberships = memberships.filter((item: any) => item.position == null);
    
    if (nullPositionMemberships.length === 0) {
      return; // No backfilling needed
    }
    
    // Find the highest existing position
    const existingPositions = memberships
      .map((item: any) => item.position)
      .filter((pos: any) => pos != null)
      .map((pos: any) => Number(pos));
    
    const maxPosition = existingPositions.length > 0 ? Math.max(...existingPositions) : -1;
    let nextPosition = maxPosition + 1;
    
    // Sort NULL position memberships by joined_at
    const sortedNullPositions = [...nullPositionMemberships].sort((a: any, b: any) => {
      const dateA = a.joined_at ? new Date(a.joined_at).getTime() : 0;
      const dateB = b.joined_at ? new Date(b.joined_at).getTime() : 0;
      return dateA - dateB;
    });
    
    // Backfill positions sequentially
    const backfillPromises = sortedNullPositions.map((item: any) => {
      const position = nextPosition++;
      console.log(`Backfilling position for leaderboard ${item.leaderboards?.name || item.leaderboard_id} to ${position}`);
      return supabase
        .from('leaderboard_members')
        .update({ position })
        .eq('user_id', user.id)
        .eq('leaderboard_id', item.leaderboard_id);
    });
    
    const results = await Promise.all(backfillPromises);
    const errors = results.filter(result => result.error);
    
    if (errors.length > 0) {
      console.error('Error backfilling positions:', errors);
    } else {
      console.log(`Successfully backfilled ${sortedNullPositions.length} positions`);
    }
  };

  const persistLeaderboardOrder = async (orderedBoards: LeaderboardMeta[]) => {
    if (!user) {
      console.error('persistLeaderboardOrder: No user found');
      return false;
    }
    
    console.log('[PERSIST] Starting to save leaderboard order:', orderedBoards.map((b, i) => `${b.name}:${i}`).join(', '));
    
    try {
      // Ensure positions are sequential (0, 1, 2, 3...)
      const updatePromises = orderedBoards.map((board, index) => {
        console.log(`[PERSIST] Updating position for ${board.name} (${board.id}) to ${index}`);
        return supabase
          .from('leaderboard_members')
          .update({ position: index })
          .eq('user_id', user.id)
          .eq('leaderboard_id', board.id);
      });
      
      const results = await Promise.all(updatePromises);
      
      // Check for errors
      const errors = results.filter(result => result.error);
      if (errors.length > 0) {
        console.error('[PERSIST] Error saving leaderboard order:', errors);
        setActionError('Unable to save leaderboard order. Please try again.');
        return false;
      }
      
      console.log('[PERSIST] All updates completed, verifying positions...');
      
      // Verify positions were saved correctly by checking all positions
      const verificationPromises = orderedBoards.map((board, expectedIndex) => 
        supabase
          .from('leaderboard_members')
          .select('position')
          .eq('user_id', user.id)
          .eq('leaderboard_id', board.id)
          .single()
      );
      
      const verificationResults = await Promise.all(verificationPromises);
      const verificationErrors = verificationResults.filter(r => r.error);
      const verifiedPositions = verificationResults
        .filter(r => !r.error && r.data)
        .map((r, idx) => ({ board: orderedBoards[idx].name, expected: idx, actual: r.data?.position }));
      
      if (verificationErrors.length > 0) {
        console.warn('[PERSIST] Some positions could not be verified:', verificationErrors);
      }
      
      const mismatches = verifiedPositions.filter(v => v.expected !== v.actual);
      if (mismatches.length > 0) {
        console.error('[PERSIST] Position verification failed:', mismatches);
      } else {
        console.log('[PERSIST] Position verification successful:', verifiedPositions);
      }
      
      console.log('[PERSIST] Successfully saved leaderboard order');
      return true;
    } catch (error) {
      console.error('[PERSIST] Exception saving leaderboard order:', error);
      setActionError('Unable to save leaderboard order. Please try again.');
      return false;
    }
  };

  // Get the current order to work with (pendingReorder if exists, otherwise userLeaderboards)
  const getCurrentReorderList = () => {
    return pendingReorder || userLeaderboards;
  };

  // Save order to localStorage immediately
  const saveOrderToLocalStorage = (order: LeaderboardMeta[]) => {
    if (typeof window !== 'undefined' && user) {
      const orderIds = order.map(b => b.id);
      localStorage.setItem(`leaderboard_order_${user.id}`, JSON.stringify(orderIds));
      console.log('[LOCALSTORAGE] Saved order:', orderIds);
    }
  };

  // Load order from localStorage
  const loadOrderFromLocalStorage = (): string[] | null => {
    if (typeof window !== 'undefined' && user) {
      const stored = localStorage.getItem(`leaderboard_order_${user.id}`);
      if (stored) {
        try {
          const orderIds = JSON.parse(stored);
          console.log('[LOCALSTORAGE] Loaded order:', orderIds);
          return orderIds;
        } catch (e) {
          console.error('[LOCALSTORAGE] Failed to parse stored order:', e);
        }
      }
    }
    return null;
  };

  const handleMoveLeaderboardLeft = (boardId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const currentList = getCurrentReorderList();
    const currentIndex = currentList.findIndex(board => board.id === boardId);
    if (currentIndex <= 0) {
      console.log('[REORDER] Cannot move left - already at start');
      return;
    }

    console.log('[REORDER] Moving left - current order:', currentList.map((b, i) => `${i}: ${b.name}`));
    
    const newOrder = [...currentList];
    [newOrder[currentIndex - 1], newOrder[currentIndex]] = [newOrder[currentIndex], newOrder[currentIndex - 1]];
    
    console.log('[REORDER] New order after swap:', newOrder.map((b, i) => `${i}: ${b.name}`));
    
    // Update both pendingReorder AND userLeaderboards for immediate visual feedback
    setPendingReorder(newOrder);
    setUserLeaderboards(newOrder); // Update tabs at top immediately
    // Save to localStorage immediately
    saveOrderToLocalStorage(newOrder);
  };

  const handleMoveLeaderboardRight = (boardId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const currentList = getCurrentReorderList();
    const currentIndex = currentList.findIndex(board => board.id === boardId);
    if (currentIndex < 0 || currentIndex >= currentList.length - 1) {
      console.log('[REORDER] Cannot move right - already at end');
      return;
    }

    console.log('[REORDER] Moving right - current order:', currentList.map((b, i) => `${i}: ${b.name}`));
    
    const newOrder = [...currentList];
    [newOrder[currentIndex], newOrder[currentIndex + 1]] = [newOrder[currentIndex + 1], newOrder[currentIndex]];
    
    console.log('[REORDER] New order after swap:', newOrder.map((b, i) => `${i}: ${b.name}`));
    
    // Update both pendingReorder AND userLeaderboards for immediate visual feedback
    setPendingReorder(newOrder);
    setUserLeaderboards(newOrder); // Update tabs at top immediately
    // Save to localStorage immediately
    saveOrderToLocalStorage(newOrder);
  };

  const handleSaveReorder = async () => {
    // Always use userLeaderboards since it's already updated in real-time when arrows are clicked
    // This is the source of truth for what's displayed in the UI
    const orderToSave = userLeaderboards;
    
    if (!orderToSave || orderToSave.length === 0) {
      console.log('[REORDER] No order to save');
      return;
    }

    setSavingOrder(true);
    console.log('[REORDER] Saving current UI order to database and localStorage:', orderToSave.map((b, i) => `${i}: ${b.name} (${b.id})`).join(', '));
    
    // Save to localStorage first (immediate, always works)
    saveOrderToLocalStorage(orderToSave);
    
    // Also save to database (for cross-device sync, but localStorage is primary)
    const success = await persistLeaderboardOrder(orderToSave);
    if (success) {
      setPendingReorder(null);
      setShowReorderMenu(false);
      console.log('[REORDER] Order saved successfully to both localStorage and database.');
    } else {
      // Even if DB save fails, localStorage is saved, so order is preserved
      console.warn('[REORDER] Database save failed, but localStorage is saved. Order will persist.');
      setPendingReorder(null);
      setShowReorderMenu(false);
      setActionError('Order saved locally. Database sync may have failed.');
    }
    setSavingOrder(false);
  };

  const handleCancelReorder = async () => {
    // Revert to original order from database
    console.log('[REORDER] Cancelling reorder changes, reverting to saved order...');
    setPendingReorder(null);
    setShowReorderMenu(false);
    // Refetch to get the correct order from database
    await fetchLeaderboardLists();
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
      'mint': 'bg-emerald-500',
      'sky': 'bg-sky-500',
      'indigo': 'bg-indigo-500',
      'coral': 'bg-orange-400',
      'sage': 'bg-green-600',
      'teal': 'bg-teal-600',
      'grape': 'bg-purple-500',
      'amber': 'bg-amber-600',
      'rose': 'bg-rose-600',
      'azure': 'bg-sky-500',
      'emerald': 'bg-emerald-500',
      'mango': 'bg-amber-500',
      'slate': 'bg-slate-500',
      'lilac': 'bg-purple-500',
      'crimson': 'bg-red-600',
      'turquoise': 'bg-cyan-500',
      'clay': 'bg-red-600',
      'forest': 'bg-green-700',
      'violet': 'bg-violet-600',
      'ocean': 'bg-blue-600',
    };
    
    const baseColor = baseColorMap[profileColor] || baseColorMap['mint'];
    
    return `${baseColor} ${opacityClass}`;
  };

  const getProfileColorClasses = (color: string) => {
    const colorMap: Record<string, { border: string; bg: string; badge: string }> = {
      'mint': { border: 'border-emerald-500 dark:border-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', badge: 'bg-emerald-500 dark:bg-emerald-400' },
      'sky': { border: 'border-sky-500 dark:border-sky-400', bg: 'bg-sky-50 dark:bg-sky-900/20', badge: 'bg-sky-500 dark:bg-sky-400' },
      'indigo': { border: 'border-indigo-500 dark:border-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/20', badge: 'bg-indigo-500 dark:bg-indigo-400' },
      'coral': { border: 'border-orange-400 dark:border-orange-300', bg: 'bg-orange-50 dark:bg-orange-900/20', badge: 'bg-orange-400 dark:bg-orange-300' },
      'sage': { border: 'border-green-600 dark:border-green-500', bg: 'bg-green-50 dark:bg-green-900/20', badge: 'bg-green-600 dark:bg-green-500' },
      'teal': { border: 'border-teal-600 dark:border-teal-500', bg: 'bg-teal-50 dark:bg-teal-900/20', badge: 'bg-teal-600 dark:bg-teal-500' },
      'grape': { border: 'border-purple-500 dark:border-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20', badge: 'bg-purple-500 dark:bg-purple-400' },
      'amber': { border: 'border-amber-600 dark:border-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20', badge: 'bg-amber-600 dark:bg-amber-500' },
      'rose': { border: 'border-rose-600 dark:border-rose-500', bg: 'bg-rose-50 dark:bg-rose-900/20', badge: 'bg-rose-600 dark:bg-rose-500' },
      'azure': { border: 'border-sky-500 dark:border-sky-400', bg: 'bg-sky-50 dark:bg-sky-900/20', badge: 'bg-sky-500 dark:bg-sky-400' },
      'emerald': { border: 'border-emerald-500 dark:border-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', badge: 'bg-emerald-500 dark:bg-emerald-400' },
      'mango': { border: 'border-amber-500 dark:border-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20', badge: 'bg-amber-500 dark:bg-amber-400' },
      'slate': { border: 'border-slate-500 dark:border-slate-400', bg: 'bg-slate-50 dark:bg-slate-900/20', badge: 'bg-slate-500 dark:bg-slate-400' },
      'lilac': { border: 'border-purple-500 dark:border-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20', badge: 'bg-purple-500 dark:bg-purple-400' },
      'crimson': { border: 'border-red-600 dark:border-red-500', bg: 'bg-red-50 dark:bg-red-900/20', badge: 'bg-red-600 dark:bg-red-500' },
      'turquoise': { border: 'border-cyan-500 dark:border-cyan-400', bg: 'bg-cyan-50 dark:bg-cyan-900/20', badge: 'bg-cyan-500 dark:bg-cyan-400' },
      'clay': { border: 'border-red-600 dark:border-red-500', bg: 'bg-red-50 dark:bg-red-900/20', badge: 'bg-red-600 dark:bg-red-500' },
      'forest': { border: 'border-green-700 dark:border-green-600', bg: 'bg-green-50 dark:bg-green-900/20', badge: 'bg-green-700 dark:bg-green-600' },
      'violet': { border: 'border-violet-600 dark:border-violet-500', bg: 'bg-violet-50 dark:bg-violet-900/20', badge: 'bg-violet-600 dark:bg-violet-500' },
      'ocean': { border: 'border-blue-600 dark:border-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20', badge: 'bg-blue-600 dark:bg-blue-500' },
    };

    return colorMap[color] || colorMap['mint'];
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
            <h1 className="text-3xl font-semibold text-black dark:text-white">
              Leaderboards
            </h1>
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
            <div className="flex gap-2 overflow-x-auto whitespace-nowrap pb-2 -mx-4 px-4 items-center">
                {userLeaderboards.map(board => (
                  <button
                    key={board.id}
                    onClick={() => {
                      setSelectedLeaderboardId(board.id);
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('lastSelectedLeaderboardId', board.id);
                      }
                    }}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all shrink-0 ${
                      selectedLeaderboardId === board.id
                        ? 'bg-black dark:bg-white text-white dark:text-black shadow-sm'
                        : 'bg-gray-100 dark:bg-[#2a2a2a] text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#333]'
                    }`}
                  >
                    {board.name}
                  </button>
                ))}
              {userLeaderboards.length >= 2 && (
                <div className="relative shrink-0" data-dropdown ref={reorderMenuRef}>
                  <button
                    ref={reorderButtonRef}
                    onClick={(e) => {
                      e.stopPropagation();
                      const willShow = !showReorderMenu;
                      setShowReorderMenu(willShow);
                      if (willShow && reorderButtonRef.current) {
                        // Initialize pendingReorder with current order when opening menu
                        setPendingReorder(null);
                        const rect = reorderButtonRef.current.getBoundingClientRect();
                        setReorderMenuPosition({
                          top: rect.bottom + 4,
                          right: window.innerWidth - rect.right
                        });
                      } else {
                        // Reset pending changes when closing menu
                        setPendingReorder(null);
                        setReorderMenuPosition(null);
                      }
                    }}
                    className="p-2 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#333] transition-colors"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </div>
              )}
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

        {/* Reorder menu portal - rendered outside scrollable container */}
        {showReorderMenu && userLeaderboards.length >= 2 && reorderMenuPosition && (
          <div 
            data-reorder-menu
            className="fixed bg-white dark:bg-[#1a1a1a] rounded-lg shadow-xl border border-gray-200 dark:border-gray-800 py-1.5 min-w-[220px] z-[9999]"
            onClick={(e) => e.stopPropagation()}
            style={{ 
              top: `${reorderMenuPosition.top}px`,
              right: `${reorderMenuPosition.right}px`
            }}
          >
            {userLeaderboards.map((board, index) => {
              return (
                <div key={board.id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-[#2a2a2a]">
                  <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1 mr-2">{board.name}</span>
                  <div className="flex gap-0.5 shrink-0">
                    <button
                      onClick={(e) => handleMoveLeaderboardLeft(board.id, e)}
                      disabled={index === 0}
                      className="px-2 py-1 rounded text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#333] transition-colors"
                    >
                      ←
                    </button>
                    <button
                      onClick={(e) => handleMoveLeaderboardRight(board.id, e)}
                      disabled={index === userLeaderboards.length - 1}
                      className="px-2 py-1 rounded text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#333] transition-colors"
                    >
                      →
                    </button>
                  </div>
                </div>
              );
            })}
            {/* Save and Cancel buttons */}
            <div className="border-t border-gray-200 dark:border-gray-800 mt-1.5 pt-1.5 px-3 space-y-1.5">
              <button
                onClick={handleSaveReorder}
                disabled={!pendingReorder || savingOrder}
                className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {savingOrder ? 'Saving...' : 'Save Order'}
              </button>
              {pendingReorder && (
                <button
                  onClick={handleCancelReorder}
                  disabled={savingOrder}
                  className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-[#2a2a2a] text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#333] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

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
              {/* Sort Dropdown */}
              <div className="mb-6 flex justify-end">
                <div className="relative" data-sort-dropdown>
                  <button
                    onClick={() => setShowSortDropdown(!showSortDropdown)}
                    className="px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-[#2a2a2a] hover:bg-gray-200 dark:hover:bg-[#333] flex items-center gap-2 transition-colors"
                  >
                    {sortBy === 'monthly' ? 'Monthly Total' : sortBy === 'daily' ? 'Daily Total' : 'Max Set'}
                    <ChevronDown className={`w-4 h-4 transition-transform ${showSortDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showSortDropdown && (
                    <div className="absolute right-0 top-full mt-2 bg-white dark:bg-[#1a1a1a] rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 p-1 min-w-[150px] z-50">
                      <button
                        onClick={() => {
                          handleSortChange('monthly');
                          setShowSortDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          sortBy === 'monthly'
                            ? 'bg-gray-100 dark:bg-[#2a2a2a] text-gray-900 dark:text-white font-medium'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#2a2a2a]'
                        }`}
                      >
                        Monthly Total
                      </button>
                      <button
                        onClick={() => {
                          handleSortChange('daily');
                          setShowSortDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          sortBy === 'daily'
                            ? 'bg-gray-100 dark:bg-[#2a2a2a] text-gray-900 dark:text-white font-medium'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#2a2a2a]'
                        }`}
                      >
                        Daily Total
                      </button>
                      <button
                        onClick={() => {
                          handleSortChange('maxSet');
                          setShowSortDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          sortBy === 'maxSet'
                            ? 'bg-gray-100 dark:bg-[#2a2a2a] text-gray-900 dark:text-white font-medium'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#2a2a2a]'
                        }`}
                      >
                        Max Set
                      </button>
                    </div>
                  )}
                </div>
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

              {/* All Users leave button - only show for All Users leaderboard */}
              {selectedLeaderboardMeta?.code === 'ALLUSERS' && (
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={handleLeaveLeaderboard}
                    disabled={actionLoading}
                    className="px-3 py-1.5 rounded-lg text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    Leave
                  </button>
                </div>
              )}

              {/* Share code card - hide for All Users leaderboard */}
              {selectedLeaderboardMeta && selectedLeaderboardMeta.code !== 'ALLUSERS' && (
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
                      onClick={() => handleShareLeaderboard(selectedLeaderboardMeta.code)}
                      className="px-3 py-2 rounded-xl text-xs font-semibold bg-gray-200 dark:bg-[#333] text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-[#404040] flex items-center gap-1.5"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      Share
                    </button>
                    <button
                      onClick={() => handleCopyCode(selectedLeaderboardMeta.code)}
                      className="px-3 py-2 rounded-xl text-xs font-semibold bg-black dark:bg-white text-white dark:text-black"
                    >
                      {copiedCode ? 'Copied!' : 'Copy code'}
                    </button>
                    <button
                      onClick={handleLeaveLeaderboard}
                      disabled={actionLoading}
                      className="px-3 py-1.5 rounded-lg text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                      Leave
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
              className="flex-1 px-4 py-3 rounded-xl bg-gray-200 dark:bg-[#333] text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-[#404040] text-sm font-semibold transition-colors"
            >
              Join a leaderboard
            </button>
            <button
              onClick={() => {
                setShowCreateModal(true);
                setGeneratedCode(null);
                setActionError(null);
              }}
              className="flex-1 px-4 py-3 rounded-xl bg-gray-200 dark:bg-[#333] text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-[#404040] text-sm font-semibold transition-colors"
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


