import React, { useState } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';
import { SignUpForm } from '@/components/auth/SignUpForm';
import { TechSignUpForm } from '@/components/auth/TechSignUpForm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
export const Auth: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'signup' | 'tech'>('login');

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        {mode === 'login' && (
          <LoginForm onToggleMode={() => setMode('signup')} />
        )}
        {mode === 'signup' && (
          <SignUpForm onToggleMode={() => setMode('login')} />
        )}
        {mode === 'tech' && (
          <TechSignUpForm onToggleMode={() => setMode('login')} />
        )}
        
        <Card>
          <CardContent className="p-4">
            <div className="flex gap-2 justify-center">
              <Button 
                variant={mode === 'login' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setMode('login')}
              >
                Login
              </Button>
              <Button 
                variant={mode === 'signup' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setMode('signup')}
              >
                Admin Sign Up
              </Button>
              <Button 
                variant={mode === 'tech' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setMode('tech')}
              >
                Tech Sign Up
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;