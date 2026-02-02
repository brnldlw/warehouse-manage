import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

export const TestLogin: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();

  const testDirectLogin = async () => {
    setLoading(true);
    try {
      console.log('Testing direct edge function call...');
      
      const { data, error } = await supabase.functions.invoke('auth-login', {
        body: { 
          email: 'admin@test.com', 
          password: 'admin123' 
        }
      });

      console.log('Response data:', data);
      console.log('Response error:', error);
      
      setResult({ data, error });
      
      if (error) {
        toast({
          title: 'Error',
          description: `Function error: ${error.message}`,
          variant: 'destructive',
        });
      } else if (data?.error) {
        toast({
          title: 'Login Error',
          description: data.error,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Success',
          description: 'Direct login test successful!',
        });
      }
    } catch (err) {
      console.error('Test error:', err);
      setResult({ error: err.message });
      toast({
        title: 'Test Failed',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto mt-4">
      <CardHeader>
        <CardTitle>Debug Login Test</CardTitle>
      </CardHeader>
      <CardContent>
        <Button 
          onClick={testDirectLogin} 
          disabled={loading}
          className="w-full mb-4"
        >
          {loading ? 'Testing...' : 'Test Direct Login'}
        </Button>
        
        {result && (
          <div className="bg-gray-100 p-3 rounded text-sm">
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
};