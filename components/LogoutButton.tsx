'use client';

import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { LogOut } from 'lucide-react';
import { useState } from 'react';

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.push('/login');
    } catch (error) {
      console.error('Error logging out:', error);
      alert('Failed to log out. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-[#2a2a2a] text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#333] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
    >
      <LogOut className="w-4 h-4" />
      {loading ? 'Logging out...' : 'Logout'}
    </button>
  );
}

