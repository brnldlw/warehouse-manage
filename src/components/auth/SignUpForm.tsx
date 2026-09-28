import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { MIN_PASSWORD_LENGTH, checkNewPassword, explainAuthError } from '@/lib/authErrors';
import { findCompanyByName } from '@/lib/companyLookup';
import { FormAlert } from './FormAlert';

interface SignUpFormProps {
  onToggleMode: () => void;
}

export const SignUpForm: React.FC<SignUpFormProps> = ({ onToggleMode }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [step, setStep] = useState<'idle' | 'company' | 'account'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const { signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const passwordProblem = checkNewPassword(password, confirmPassword);
    if (passwordProblem) { setError(passwordProblem); return; }

    setStep('company');
    const company = await findCompanyByName(companyName);
    if ('reason' in company) {
      setError(company.reason);
      setStep('idle');
      return;
    }

    setStep('account');
    const result = await signUp(email, password, {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      company_id: company.id,
    });
    setStep('idle');

    if (result.error) {
      setError(explainAuthError(result.error, 'signup'));
    } else if (result.needsEmailConfirmation) {
      setInfo(`Account created for ${company.name}. We sent a confirmation link to ${email.trim()} — open it (check your spam folder), then come back and sign in.`);
    }
    // Otherwise Supabase signed them in straight away and the app switches screens itself.
  };

  const busy = step !== 'idle';

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Sign Up</CardTitle>
        <CardDescription>Create a new account to get started</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                className="h-12 text-base"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                autoComplete="given-name"
                placeholder="First name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                className="h-12 text-base"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                autoComplete="family-name"
                placeholder="Last name"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              className="h-12 text-base"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="Enter your email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              className="h-12 text-base"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              className="h-12 text-base"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              placeholder="Confirm your password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company">Company Name *</Label>
            <Input
              id="company"
              className="h-12 text-base"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              placeholder="Enter your company name"
              disabled={busy}
            />
            <p className="text-sm text-gray-700">
              Your company's name exactly as it was registered (capital letters don't matter).
            </p>
          </div>
          <FormAlert error={error} info={info} />
          <Button type="submit" className="w-full h-14 text-base" disabled={busy}>
            {step === 'company' ? 'Checking company…' : step === 'account' ? 'Creating account…' : 'Sign Up'}
          </Button>
          <Button type="button" variant="link" className="w-full" onClick={onToggleMode}>
            Already have an account? Sign in
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
