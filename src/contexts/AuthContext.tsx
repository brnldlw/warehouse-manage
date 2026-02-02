import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

interface UserProfile {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role: string;
  company_id?: string;
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: any }>;
  signUp: (email: string, password: string, userData?: any) => Promise<{ error?: any }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isTech: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        throw error;
      }
      
      if (data) {
        setUserProfile(data);
      }
      setLoading(false);
    } catch (error) {
      console.error('Failed to load user profile:', error);
      // Show user-friendly notification
      const { showErrorNotification } = await import('@/lib/notificationUtils');
      showErrorNotification('Failed to load user profile. Please try refreshing the page.');
      setLoading(false);
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserProfile(session.user.id);
      } else {
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      // Use Supabase auth directly
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Supabase login error:', error);
        return { error };
      }

      return { error: null };
    } catch (error) {
      console.error('Login error:', error);
      return { error };
    }
  };

  const signUp = async (email: string, password: string, userData?: any) => {
    try {
      console.log('Starting signup process with data:', { email, userData });

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        console.error('Supabase signup error:', error);
        return { error: { message: error.message } };
      }

      // Create user profile if signup successful
      if (data.user && !error) {
        try {
          const profileData = {
            id: data.user.id,
            email: email,
            first_name: userData?.first_name || '',
            last_name: userData?.last_name || '',
            role: userData?.role || 'tech',
            company_id: userData?.company_id,
            phone: userData?.phone || '',
            specialty: userData?.specialty || '',
            is_active: true
          };

          console.log('Creating user profile with data:', profileData);

          const { error: profileError } = await supabase
            .from('user_profiles')
            .upsert(profileData);

          if (profileError) {
            console.error('Profile creation error:', profileError);
            // Try to get more detailed error information
            const { data: errorData, error: checkError } = await supabase
              .from('user_profiles')
              .select()
              .eq('id', data.user.id);
            console.log('Profile check after error:', { errorData, checkError });
            return { error: { message: 'Failed to create user profile: ' + profileError.message } };
          }

          // Verify the profile was created
          const { data: checkData, error: checkError } = await supabase
            .from('user_profiles')
            .select()
            .eq('id', data.user.id)
            .single();
          
          console.log('Profile creation verification:', { checkData, checkError });
        } catch (profileError) {
          console.error('Failed to create user profile:', profileError);
          return { error: { message: 'Failed to create user profile' } };
        }
      }

      return { error: null };
    } catch (error) {
      console.error('Signup error:', error);
      return { error: { message: 'Signup failed' } };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setUserProfile(null);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };



  // Only set role flags when we have a user profile
  const isAdmin = loading ? false : userProfile?.role === 'admin';
  const isTech = loading ? false : userProfile?.role === 'tech';

  return (
    <AuthContext.Provider value={{ 
      user, 
      userProfile, 
      loading, 
      signIn, 
      signUp, 
      signOut, 
      isAdmin, 
      isTech 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};