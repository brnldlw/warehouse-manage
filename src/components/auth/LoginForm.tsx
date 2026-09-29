import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { explainAuthError, isNetworkError } from '@/lib/authErrors';
import { FormAlert } from './FormAlert';

interface LoginFormProps {
  onToggleMode: () => void;
}

const RESET_SENT_MESSAGE = 'If that email has an account, a reset link is on its way.';

export const LoginForm: React.FC<LoginFormProps> = ({ onToggleMode }) => {
  const [view, setView] = useState<'signIn' | 'forgot'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const { signIn } = useAuth();

  const switchView = (v: 'signIn' | 'forgot') => {
    setView(v);
    setError(null);
    setInfo(null);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signIn(email, password);
    // On success the app switches to the signed-in screen by itself.
    if (error) setError(explainAuthError(error, 'login'));
    setLoading(false);
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) console.error('Password reset request failed:', error);
    // Same message whether or not the address has an account, so this form can't be used
    // to find out who has one. Only problems that say nothing about the account (no
    // connection, or the app's hourly email limit) are shown, because then no email is sent.
    if (error && (isNetworkError(error) || (error as { code?: string }).code === 'over_email_send_rate_limit')) {
      setError(explainAuthError(error, 'reset'));
    } else {
      setInfo(RESET_SENT_MESSAGE);
    }
  };

  if (view === 'forgot') {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>Enter your email and we'll send you a link to choose a new password.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleForgot} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                autoComplete="email"
                className="h-12 text-base"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Enter your email"
              />
            </div>
            <FormAlert error={error} info={info} />
            <Button type="submit" className="w-full h-14 text-base" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </Button>
            <Button type="button" variant="outline" className="w-full h-14 text-base" onClick={() => switchView('signIn')}>
              Back to sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Sign In</CardTitle>
        <CardDescription>
          Enter your credentials to access your account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSignIn} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              className="h-12 text-base"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Enter your email"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <button
                type="button"
                className="text-sm font-medium text-blue-700 underline underline-offset-2 min-h-[44px] px-1"
                onClick={() => switchView('forgot')}
              >
                Forgot password?
              </button>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              className="h-12 text-base"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter your password"
            />
          </div>
          <FormAlert error={error} />
          <Button type="submit" className="w-full h-14 text-base" disabled={loading}>
            {loading ? 'Signing In...' : 'Sign In'}
          </Button>
          <Button type="button" variant="link" className="w-full" onClick={onToggleMode}>
            Don't have an account? Sign up
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
