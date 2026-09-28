import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AdminPanel from '@/components/AdminPanel';
import { TechPanel } from '@/components/TechPanel';
import { UserHeader } from '@/components/UserHeader';
import { InventoryProvider } from '@/contexts/InventoryContext';
import { Button } from '@/components/ui/button';

const Index: React.FC = () => {
  const { user, userProfile, loading, isTech, profileProblem, loadUserProfile, signOut } = useAuth();

  // Signed in, but the profile couldn't be loaded: offer Retry / Log out instead of an
  // endless "Loading..." (and never log the person out automatically).
  if (!loading && user && !userProfile && profileProblem) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full space-y-4 text-center">
          <h1 className="text-2xl font-bold text-gray-900">
            {profileProblem === 'missing' ? 'Your account isn’t set up yet' : 'Can’t load your account'}
          </h1>
          <p className="text-base text-gray-700">
            {profileProblem === 'missing'
              ? `You're signed in as ${user.email}, but there is no profile for this account yet. Ask your admin to add you to your company.`
              : 'We couldn’t reach the server to load your account details. Check your connection, then try again. You are still signed in.'}
          </p>
          <div className="flex flex-col gap-3">
            <Button className="h-14 text-base" onClick={() => loadUserProfile()}>Try again</Button>
            <Button className="h-14 text-base" variant="outline" onClick={() => signOut()}>Log out</Button>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state until we have both user data and role information
  if (loading || !userProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <UserHeader />
      <InventoryProvider>
        <div className="p-4">
          {isTech ? <TechPanel /> : <AdminPanel />}
        </div>
      </InventoryProvider>
    </div>
  );
};

export default Index;
