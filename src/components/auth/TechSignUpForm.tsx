import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';

interface TechSignUpFormProps {
  onToggleMode: () => void;
}

export const TechSignUpForm: React.FC<TechSignUpFormProps> = ({ onToggleMode }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phone: '',
    specialty: '',
    companyName: ''
  });
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

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.companyName.trim()) {
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
      const companyId = await validateCompany(formData.companyName);
      
      if (!companyId) {
        toast({
          title: 'Invalid Company',
          description: 'Company name not found. Please contact your administrator to register your company.',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      console.log('Submitting tech registration with data:', {
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        companyId: companyId,
        phone: formData.phone,
        specialty: formData.specialty
      });

      // Sign up the user with all profile data
      const { error: signUpError } = await signUp(formData.email, formData.password, {
        first_name: formData.firstName,
        last_name: formData.lastName,
        role: 'tech',
        company_id: companyId,
        phone: formData.phone,
        specialty: formData.specialty,
        email: formData.email // ensure email is included
      });

      if (signUpError) {
        console.error('SignUp Error:', signUpError);
        throw signUpError;
      }

      toast({
        title: 'Success',
        description: 'Tech account created successfully! Please check your email to verify your account.',
      });

    } catch (error: any) {
      toast({
        title: 'Sign Up Failed',
        description: error.message || 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

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
                value={formData.firstName}
                onChange={(e) => handleInputChange('firstName', e.target.value)}
                required
                placeholder="John"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => handleInputChange('lastName', e.target.value)}
                required
                placeholder="Doe"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              required
              placeholder="john.doe@company.com"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => handleInputChange('password', e.target.value)}
              required
              placeholder="Enter password"
              minLength={6}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => handleInputChange('phone', e.target.value)}
              placeholder="(555) 123-4567"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="specialty">Specialty</Label>
            <Select value={formData.specialty} onValueChange={(value) => handleInputChange('specialty', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select your specialty" />
              </SelectTrigger>
              <SelectContent>
                {specialties.map((specialty) => (
                  <SelectItem key={specialty} value={specialty}>
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
              value={formData.companyName}
              onChange={(e) => handleInputChange('companyName', e.target.value)}
              required
              placeholder="Enter your company name"
              disabled={loading || validatingCompany}
            />
            <p className="text-xs text-gray-500">
              Enter the exact name of your registered company
            </p>
          </div>
          
          <Button type="submit" className="w-full" disabled={loading || validatingCompany}>
            {loading ? 'Creating Account...' : validatingCompany ? 'Validating Company...' : 'Sign Up as Tech'}
          </Button>
          
          <Button type="button" variant="link" className="w-full" onClick={onToggleMode}>
            Already have an account? Sign in
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};