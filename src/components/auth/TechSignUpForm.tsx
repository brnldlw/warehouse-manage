import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { MIN_PASSWORD_LENGTH, checkNewPassword, explainAuthError } from '@/lib/authErrors';
import { findCompanyByName } from '@/lib/companyLookup';
import { FormAlert } from './FormAlert';

interface TechSignUpFormProps {
  onToggleMode: () => void;
}

const specialties = [
  'Electrician',
  'Plumber',
  'HVAC Technician',
  'Carpenter',
  'Mechanic',
  'Welder',
  'General Maintenance',
  'Other'
];

export const TechSignUpForm: React.FC<TechSignUpFormProps> = ({ onToggleMode }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    phone: '',
    specialty: '',
    companyName: ''
  });
  const [step, setStep] = useState<'idle' | 'company' | 'account'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const { signUp } = useAuth();

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const passwordProblem = checkNewPassword(formData.password, formData.confirmPassword);
    if (passwordProblem) { setError(passwordProblem); return; }

    setStep('company');
    const company = await findCompanyByName(formData.companyName);
    if ('reason' in company) {
      setError(company.reason);
      setStep('idle');
      return;
    }

    setStep('account');
    const result = await signUp(formData.email, formData.password, {
      first_name: formData.firstName.trim(),
      last_name: formData.lastName.trim(),
      company_id: company.id,
      phone: formData.phone.trim(),
      specialty: formData.specialty,
    });
    setStep('idle');

    if (result.error) {
      setError(explainAuthError(result.error, 'signup'));
    } else if (result.needsEmailConfirmation) {
      setInfo(`Account created for ${company.name}. We sent a confirmation link to ${formData.email.trim()} — open it (check your spam folder), then come back and sign in.`);
    }
    // Otherwise Supabase signed them in straight away and the app switches screens itself.
  };

  const busy = step !== 'idle';

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Tech Sign Up</CardTitle>
        <CardDescription>Create your technician account</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                className="h-12 text-base"
                value={formData.firstName}
                onChange={(e) => handleInputChange('firstName', e.target.value)}
                required
                autoComplete="given-name"
                placeholder="John"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                className="h-12 text-base"
                value={formData.lastName}
                onChange={(e) => handleInputChange('lastName', e.target.value)}
                required
                autoComplete="family-name"
                placeholder="Doe"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              className="h-12 text-base"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              required
              autoComplete="email"
              placeholder="john.doe@company.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              className="h-12 text-base"
              value={formData.password}
              onChange={(e) => handleInputChange('password', e.target.value)}
              required
              autoComplete="new-password"
              placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              minLength={MIN_PASSWORD_LENGTH}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              className="h-12 text-base"
              value={formData.confirmPassword}
              onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
              required
              autoComplete="new-password"
              placeholder="Type it again"
              minLength={MIN_PASSWORD_LENGTH}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              className="h-12 text-base"
              value={formData.phone}
              onChange={(e) => handleInputChange('phone', e.target.value)}
              autoComplete="tel"
              placeholder="(555) 123-4567"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="specialty">Specialty</Label>
            <Select value={formData.specialty} onValueChange={(value) => handleInputChange('specialty', value)}>
              <SelectTrigger className="h-12 text-base">
                <SelectValue placeholder="Select your specialty" />
              </SelectTrigger>
              <SelectContent>
                {specialties.map((specialty) => (
                  <SelectItem key={specialty} value={specialty} className="py-3 text-base">
                    {specialty}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="company">Company Name *</Label>
            <Input
              id="company"
              className="h-12 text-base"
              value={formData.companyName}
              onChange={(e) => handleInputChange('companyName', e.target.value)}
              required
              placeholder="Enter your company name"
              disabled={busy}
            />
            <p className="text-sm text-gray-700">
              Your company's name exactly as your manager registered it (capital letters don't matter).
            </p>
          </div>

          <FormAlert error={error} info={info} />

          <Button type="submit" className="w-full h-14 text-base" disabled={busy}>
            {step === 'company' ? 'Checking company…' : step === 'account' ? 'Creating account…' : 'Sign Up as Tech'}
          </Button>

          <Button type="button" variant="link" className="w-full" onClick={onToggleMode}>
            Already have an account? Sign in
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
