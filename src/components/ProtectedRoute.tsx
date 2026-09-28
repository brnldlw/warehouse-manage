import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Auth from '@/pages/Auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  // A saved login exists but the server can't be reached (offline, just woke from sleep).
  // Don't show the sign-in page: keep trying in the background.
  if (status === 'reconnecting') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-gray-900"></div>
        <p className="text-xl font-semibold text-gray-900">Reconnecting…</p>
        <p className="text-base text-gray-700 max-w-sm">
          Can't reach the server right now. You're still signed in — this page will continue by itself
          when the connection is back.
        </p>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  return <>{children}</>;
};
