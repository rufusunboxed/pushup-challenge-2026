'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ChevronDown, ChevronUp, Plus, Minus, Trash2, Check, Loader2 } from 'lucide-react';
import { formatDateLabel } from '@/lib/date-utils';

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

export default function HistoryPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([]);
  const [originalDayGroups, setOriginalDayGroups] = useState<DayGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [pendingChanges, setPendingChanges] = useState<Map<string, PendingChanges>>(new Map());
  const [savingDays, setSavingDays] = useState<Set<string>>(new Set());

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchUserHistory();
    }
  }, [user]);

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
        ) : dayGroups.length === 0 ? (
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
      </div>
    </div>
  );
}

