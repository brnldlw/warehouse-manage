import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

const AuthDebug: React.FC = () => {
  const { user, userProfile, signIn } = useAuth();
  const [email, setEmail] = useState('brian@caplingerco.com');
  const [password, setPassword] = useState('password123');
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setSession(session);
  };

  const handleLogin = async () => {
    setLoading(true);
    try {
      const result = await signIn(email, password);
      if (result.error) {
        console.error('Login failed:', result.error);
      } else {
        console.log('Login successful');
        await checkSession();
      }
    } catch (error) {
      console.error('Login error:', error);
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    await checkSession();
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Authentication Debug</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button onClick={handleLogin} disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </Button>
          <Button onClick={handleLogout} variant="outline">
            Logout
          </Button>
          <Button onClick={checkSession} variant="outline">
            Check Session
          </Button>
        </div>

        <div className="space-y-2">
          <h3 className="font-semibold">Auth State:</h3>
          <div className="bg-gray-100 p-3 rounded text-sm">
            <p><strong>User:</strong> {user?.email || 'Not logged in'}</p>
            <p><strong>User ID:</strong> {user?.id || 'None'}</p>
            <p><strong>Profile Role:</strong> {userProfile?.role || 'None'}</p>
            <p><strong>Session:</strong> {session ? 'Active' : 'None'}</p>
            <p><strong>Session User:</strong> {session?.user?.email || 'None'}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AuthDebug;