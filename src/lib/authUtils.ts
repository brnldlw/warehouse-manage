import { supabase } from '@/lib/supabase';
import { showErrorNotification, showSuccessNotification } from '@/lib/notificationUtils';

export interface AuthError {
  message: string;
  code?: string;
}

export const handleAuthError = (error: any): AuthError => {
  console.error('Auth error:', error);
  
  // Handle specific Supabase auth errors
  if (error?.message) {
    const message = error.message.toLowerCase();
    
    if (message.includes('invalid login credentials')) {
      return { message: 'Invalid email or password. Please try again.', code: 'INVALID_CREDENTIALS' };
    }
    
    if (message.includes('email not confirmed')) {
      return { message: 'Please check your email and click the confirmation link.', code: 'EMAIL_NOT_CONFIRMED' };
    }
    
    if (message.includes('user already registered')) {
      return { message: 'An account with this email already exists.', code: 'USER_EXISTS' };
    }
    
    if (message.includes('password')) {
      return { message: 'Password must be at least 6 characters long.', code: 'WEAK_PASSWORD' };
    }
    
    if (message.includes('rate limit')) {
      return { message: 'Too many attempts. Please wait a moment and try again.', code: 'RATE_LIMIT' };
    }
    
    return { message: error.message, code: error.code };
  }
  
  return { message: 'An unexpected error occurred. Please try again.', code: 'UNKNOWN' };
};

export const loginUser = async (email: string, password: string) => {
  try {
    const { data, error } = await supabase.functions.invoke('auth-login', {
      body: { email, password }
    });

    if (error) {
      console.error('Supabase function error:', error);
      const authError = handleAuthError(error);
      showErrorNotification(authError.message);
      throw authError;
    }

    if (!data) {
      const authError = { message: 'No response from login service', code: 'NO_RESPONSE' };
      showErrorNotification(authError.message);
      throw authError;
    }

    if (data.error) {
      const authError = handleAuthError({ message: data.error });
      showErrorNotification(authError.message);
      throw authError;
    }

    if (data.user) {
      showSuccessNotification('Login successful!');
      return data.user;
    }

    throw new Error('Login failed - invalid response format');
  } catch (error) {
    console.error('Login error:', error);
    if (error.message && error.code) {
      throw error; // Re-throw handled errors
    }
    const authError = handleAuthError(error);
    showErrorNotification(authError.message);
    throw authError;
  }
};

export const signUpUser = async (email: string, password: string, firstName: string, lastName: string, role: string = 'tech') => {
  try {
    const { data, error } = await supabase.functions.invoke('auth-signup', {
      body: { email, password, firstName, lastName, role }
    });

    if (error) {
      const authError = handleAuthError(error);
      showErrorNotification(authError.message);
      throw authError;
    }

    if (data?.error) {
      const authError = handleAuthError({ message: data.error });
      showErrorNotification(authError.message);
      throw authError;
    }

    if (data?.user) {
      showSuccessNotification('Account created successfully!');
      return data.user;
    }

    throw new Error('Sign up failed - no user data received');
  } catch (error) {
    console.error('Sign up error:', error);
    throw error;
  }
};