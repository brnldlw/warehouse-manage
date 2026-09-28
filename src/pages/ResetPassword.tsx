import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormAlert } from '@/components/auth/FormAlert';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { emailLinkError } from '@/lib/authRedirect';
import { MIN_PASSWORD_LENGTH, checkNewPassword, explainAuthError } from '@/lib/authErrors';

/**
 * Opened from the password-reset email. Supabase signs the user in with a short-lived
 * "recovery" session from the link; here they choose a new password and carry on
 * signed in.
 */
const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const { status, user } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = checkNewPassword(password, confirm);
    if (problem) { setError(problem); return; }
    setError(null);
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) { setError(explainAuthError(error, 'newPassword')); return; }
    setDone(true);
  };

  let body: React.ReactNode;
  if (done) {
    body = (
      <div className="space-y-4">
        <FormAlert info="Your password has been changed and you're signed in." />
        <Button className="w-full h-14 text-base" onClick={() => navigate('/', { replace: true })}>Continue to the app</Button>
      </div>
    );
  } else if (user) {
    body = (
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-700">Signed in as <strong>{user.email}</strong></p>
        <div className="space-y-2">
          <Label htmlFor="new-password">New password</Label>
          <Input id="new-password" type="password" autoComplete="new-password" className="h-12 text-base"
            value={password} onChange={(e) => setPassword(e.target.value)} required minLength={MIN_PASSWORD_LENGTH}
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input id="confirm-password" type="password" autoComplete="new-password" className="h-12 text-base"
            value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={MIN_PASSWORD_LENGTH}
            placeholder="Type it again" />
        </div>
        <FormAlert error={error} />
        <Button type="submit" className="w-full h-14 text-base" disabled={saving}>
          {saving ? 'Saving…' : 'Save new password'}
        </Button>
      </form>
    );
  } else if (status === 'loading' || status === 'reconnecting') {
    body = <p className="text-base text-gray-700">{status === 'loading' ? 'Checking your reset link…' : 'Reconnecting… waiting for the internet connection.'}</p>;
  } else {
    // Signed out: the link was bad, expired (they last about an hour) or already used.
    body = (
      <div className="space-y-4">
        <FormAlert error={
          emailLinkError
            ? `This reset link can't be used: ${emailLinkError.description.replace(/\+/g, ' ')}. Links expire after a while and work only once.`
            : 'This reset link is invalid, has expired, or was already used.'
        } />
        <p className="text-base text-gray-700">Go back to the sign-in page and click “Forgot password?” to get a new link.</p>
        <Button className="w-full h-14 text-base" onClick={() => navigate('/', { replace: true })}>Back to sign in</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Choose a new password</CardTitle>
          <CardDescription>Use at least {MIN_PASSWORD_LENGTH} characters.</CardDescription>
        </CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
