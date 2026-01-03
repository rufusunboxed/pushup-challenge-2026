'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { LogoutButton } from '@/components/LogoutButton';
import { Save, Loader2 } from 'lucide-react';

const PROFILE_COLORS = [
  { name: 'red', label: 'Red', bg: 'bg-red-600', darkBg: 'bg-red-500' },
  { name: 'green', label: 'Green', bg: 'bg-green-600', darkBg: 'bg-green-500' },
  { name: 'blue', label: 'Blue', bg: 'bg-blue-600', darkBg: 'bg-blue-500' },
  { name: 'purple', label: 'Purple', bg: 'bg-purple-600', darkBg: 'bg-purple-500' },
  { name: 'cyan', label: 'Cyan', bg: 'bg-cyan-600', darkBg: 'bg-cyan-500' },
  { name: 'yellow', label: 'Yellow', bg: 'bg-yellow-600', darkBg: 'bg-yellow-500' },
] as const;

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [displayNameEditing, setDisplayNameEditing] = useState(false);
  const [displayNameSaving, setDisplayNameSaving] = useState(false);
  const [email, setEmail] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailEditing, setEmailEditing] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [profileColor, setProfileColor] = useState('green');
  const [colorSaving, setColorSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  const checkUser = async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) {
      router.push('/login');
    } else {
      setUser(currentUser);
      setEmail(currentUser.email || '');
      setLoading(false);
    }
  };

  const fetchProfile = async () => {
    if (!user) return;

    try {
      // First try to get basic profile info
      const { data: basicProfile, error: basicError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .eq('id', user.id)
        .single();

      // If profile doesn't exist or has no first_name/last_name, try to get from auth metadata
      let firstName = basicProfile?.first_name;
      let lastName = basicProfile?.last_name;
      
      if (!firstName && !lastName && user.user_metadata) {
        firstName = user.user_metadata.first_name;
        lastName = user.user_metadata.last_name;
      }

      // Try to get display_name and profile_color if columns exist
      let displayName = null;
      let profileColor = 'green';
      
      const extendedResult = await supabase
        .from('profiles')
        .select('display_name, profile_color')
        .eq('id', user.id)
        .single();
      
      if (!extendedResult.error && extendedResult.data) {
        displayName = extendedResult.data.display_name;
        profileColor = extendedResult.data.profile_color || 'green';
      }

      // Set profile with available data
      setProfile({
        ...basicProfile,
        first_name: firstName,
        last_name: lastName
      });
      
      // Set display name - use display_name if exists, otherwise first_name + last_name
      const defaultDisplayName = `${firstName || ''} ${lastName || ''}`.trim();
      setDisplayName(displayName || defaultDisplayName || '');
      
      // Set profile color - default to green if not set
      setProfileColor(profileColor);
    } catch (error: any) {
      console.error('Error fetching profile:', error);
      // Don't show error if it's just missing columns - that's expected before migration
      if (!error.message?.includes('column') && !error.message?.includes('does not exist')) {
        setError('Failed to load profile. Please refresh the page.');
      }
    }
  };

  const handleSaveDisplayName = async () => {
    if (!user) return;

    setDisplayNameSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: displayName.trim() || null })
        .eq('id', user.id);

      if (error) {
        // If column doesn't exist, show helpful error
        if (error.message?.includes('column') || error.message?.includes('does not exist')) {
          setError('Display name feature requires a database update. Please run the migration SQL in Supabase.');
          return;
        }
        throw error;
      }

      setSuccess('Display name updated successfully');
      setDisplayNameEditing(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (error: any) {
      console.error('Error updating display name:', error);
      setError(error.message || 'Failed to update display name');
    } finally {
      setDisplayNameSaving(false);
    }
  };

  const handleUpdateEmail = async () => {
    if (!user || !newEmail.trim()) return;

    setEmailSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const { error } = await supabase.auth.updateUser({
        email: newEmail.trim()
      });

      if (error) throw error;

      setEmail(newEmail.trim());
      setNewEmail('');
      setEmailEditing(false);
      setSuccess('Email updated successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (error: any) {
      console.error('Error updating email:', error);
      setError(error.message || 'Failed to update email');
    } finally {
      setEmailSaving(false);
    }
  };

  const handleColorChange = async (color: string) => {
    if (!user || color === profileColor) return;

    setColorSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // First check if column exists by trying to update
      const { error } = await supabase
        .from('profiles')
        .update({ profile_color: color })
        .eq('id', user.id);

      if (error) {
        // If column doesn't exist, show helpful error
        if (error.message?.includes('column') || error.message?.includes('does not exist')) {
          setError('Profile color feature requires a database update. Please run the migration SQL in Supabase.');
          return;
        }
        throw error;
      }

      setProfileColor(color);
      setSuccess('Profile color updated successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (error: any) {
      console.error('Error updating profile color:', error);
      setError(error.message || 'Failed to update profile color');
    } finally {
      setColorSaving(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#1a1a1a]">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8 pb-24 bg-white dark:bg-[#1a1a1a]">
      <div className="max-w-md mx-auto">
        <div className="mb-8 flex items-start justify-between">
          <div className="text-left flex-1">
            <h1 className="text-3xl font-semibold mb-2 text-black dark:text-white">
              My Profile
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Manage your account settings
            </p>
          </div>
          <div className="mt-1">
            <LogoutButton />
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 rounded-2xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <p className="text-sm text-green-600 dark:text-green-400">{success}</p>
          </div>
        )}

        <div className="space-y-4">
          {/* Email */}
          <div className="bg-gray-50 dark:bg-[#2a2a2a] rounded-2xl p-4">
            <label className="block text-sm font-medium mb-2 text-gray-600 dark:text-gray-400">
              Email Address
            </label>
            {!emailEditing ? (
              <div className="flex items-center justify-between">
                <p className="text-black dark:text-white">{email}</p>
                <button
                  onClick={() => {
                    setEmailEditing(true);
                    setNewEmail(email);
                    setError(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-[#333] text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-[#404040] transition-colors text-sm font-medium"
                >
                  Update Email
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent"
                  placeholder="Enter new email"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleUpdateEmail}
                    disabled={emailSaving || !newEmail.trim()}
                    className="flex-1 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {emailSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Save
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setEmailEditing(false);
                      setNewEmail('');
                      setError(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-[#333] text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-[#404040] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* First Name */}
          <div className="bg-gray-50 dark:bg-[#2a2a2a] rounded-2xl p-4">
            <label className="block text-sm font-medium mb-2 text-gray-600 dark:text-gray-400">
              First Name
            </label>
            <p className="text-black dark:text-white">{profile?.first_name || 'Not set'}</p>
          </div>

          {/* Last Name */}
          <div className="bg-gray-50 dark:bg-[#2a2a2a] rounded-2xl p-4">
            <label className="block text-sm font-medium mb-2 text-gray-600 dark:text-gray-400">
              Last Name
            </label>
            <p className="text-black dark:text-white">{profile?.last_name || 'Not set'}</p>
          </div>

          {/* Display Name */}
          <div className="bg-gray-50 dark:bg-[#2a2a2a] rounded-2xl p-4">
            <label className="block text-sm font-medium mb-2 text-gray-600 dark:text-gray-400">
              Display Name
            </label>
            {!displayNameEditing ? (
              <div className="flex items-center justify-between">
                <p className="text-black dark:text-white">{displayName}</p>
                <button
                  onClick={() => {
                    setDisplayNameEditing(true);
                    setError(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-[#333] text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-[#404040] transition-colors text-sm font-medium"
                >
                  Edit
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent"
                  placeholder="Enter display name"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveDisplayName}
                    disabled={displayNameSaving}
                    className="flex-1 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {displayNameSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Save
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setDisplayNameEditing(false);
                      // Reset to current value
                      const defaultDisplayName = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();
                      setDisplayName(profile?.display_name || defaultDisplayName);
                      setError(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-[#333] text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-[#404040] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Profile Color */}
          <div className="bg-gray-50 dark:bg-[#2a2a2a] rounded-2xl p-4">
            <label className="block text-sm font-medium mb-3 text-gray-600 dark:text-gray-400">
              Profile Color
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Choose a color for your card in the leaderboard
            </p>
            <div className="grid grid-cols-3 gap-3">
              {PROFILE_COLORS.map((color) => (
                <button
                  key={color.name}
                  onClick={() => handleColorChange(color.name)}
                  disabled={colorSaving}
                  className={`relative p-4 rounded-xl border-2 transition-all ${
                    profileColor === color.name
                      ? 'border-black dark:border-white ring-2 ring-offset-2 ring-black dark:ring-white'
                      : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className={`w-full h-12 rounded-lg ${color.bg} dark:${color.darkBg}`} />
                  <p className="mt-2 text-xs font-medium text-black dark:text-white text-center">
                    {color.label}
                  </p>
                  {profileColor === color.name && (
                    <div className="absolute top-2 right-2">
                      <div className="w-4 h-4 rounded-full bg-black dark:bg-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

