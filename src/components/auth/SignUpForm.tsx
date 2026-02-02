import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';

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
  const [loading, setLoading] = useState(false);
  const [validatingCompany, setValidatingCompany] = useState(false);
  const { signUp } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    // Remove the automatic company fetching since we'll validate on demand
  }, []);

  const validateCompany = async (name: string): Promise<string | null> => {
    if (!name.trim()) return null;
    
    setValidatingCompany(true);
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name')
        .ilike('name', name.trim())
        .eq('is_active', true)
        .single();
      
      if (error || !data) {
        return null;
      }
      
      return data.id;
    } catch (error) {
      console.error('Error validating company:', error);
      return null;
    } finally {
      setValidatingCompany(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({
        title: 'Error',
        description: 'Passwords do not match',
        variant: 'destructive',
      });
      return;
    }

    if (!companyName.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a company name',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      // Validate company name exists
      const companyId = await validateCompany(companyName);
      
      if (!companyId) {
        toast({
          title: 'Invalid Company',
          description: 'Company name not found. Please contact your administrator to register your company.',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      const { error } = await signUp(email, password, {
        first_name: firstName,
        last_name: lastName,
        company_id: companyId,
      });
      
      if (error) {
        toast({
          title: 'Registration Failed',
          description: error.message,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Success',
          description: 'Account created successfully! Please check your email for verification.',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

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
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                placeholder="First name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                placeholder="Last name"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Enter your email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter your password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="Confirm your password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company">Company Name *</Label>
            <Input
              id="company"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              placeholder="Enter your company name"
              disabled={loading || validatingCompany}
            />
            <p className="text-xs text-gray-500">
              Enter the exact name of your registered company
            </p>
          </div>
          <Button type="submit" className="w-full" disabled={loading || validatingCompany}>
            {loading ? 'Creating Account...' : validatingCompany ? 'Validating Company...' : 'Sign Up'}
          </Button>
          <Button type="button" variant="link" className="w-full" onClick={onToggleMode}>
            Already have an account? Sign in
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};