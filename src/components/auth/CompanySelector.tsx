import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface Company {
  id: string;
  name: string;
  domain?: string;
}

export const CompanySelector: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const { toast } = useToast();
  const { user, userProfile, loadUserProfile } = useAuth();

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      setLoadingCompanies(true);
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, domain')
        .eq('is_active', true)
        .order('name');
      
      if (error) {
        console.error('Error fetching companies:', error);
        toast({
          title: 'Error',
          description: 'Failed to load companies. Please try again.',
          variant: 'destructive',
        });
        return;
      }

      setCompanies(data || []);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setLoadingCompanies(false);
    }
  };

  const handleCompanySelect = async (companyId: string) => {
    try {
      setLoading(true);
      setSelectedCompany(companyId);

      if (!user) {
        toast({
          title: 'Error',
          description: 'User session not found.',
          variant: 'destructive',
        });
        return;
      }

      const { error } = await supabase
        .from('user_profiles')
        .update({ company_id: companyId })
        .eq('id', user.id);

      if (error) {
        console.error('Error updating user profile:', error);
        toast({
          title: 'Error',
          description: 'Failed to update company. Please try again.',
          variant: 'destructive',
        });
        return;
      }

      // Reload user profile to get updated data
      await loadUserProfile(user.id);

      toast({
        title: 'Success',
        description: 'Company updated successfully.',
      });
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // If user already has a company_id, don't show the selector
  if (userProfile?.company_id) {
    return null;
  }

  return (
    <Card className="w-full max-w-md mx-auto mt-8">
      <CardHeader>
        <CardTitle>Select Your Company</CardTitle>
        <CardDescription>
          As a previous user, please select your company to continue.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Select
            disabled={loadingCompanies}
            value={selectedCompany}
            onValueChange={handleCompanySelect}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a company" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((company) => (
                <SelectItem key={company.id} value={company.id}>
                  {company.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {loadingCompanies && (
            <div className="text-center text-sm text-gray-500">
              Loading companies...
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};