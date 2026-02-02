import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Mail, Send, Settings } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface EmailNotificationsProps {
  onSettingsChange?: (settings: any) => void;
}

export const EmailNotifications: React.FC<EmailNotificationsProps> = ({ onSettingsChange }) => {
  const { userProfile } = useAuth();
  const [emailSettings, setEmailSettings] = useState({
    enablePurchaseNotifications: true,
    enableLowStockAlerts: true,
    enableUserActivityAlerts: false,
    enableStockRequestNotifications: true,
    adminEmail: '',
    companyName: ''
  });
  
  const [testEmail, setTestEmail] = useState({
    to: '',
    subject: 'Test Notification',
    message: 'This is a test email from your inventory system.'
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Load email settings from database
  useEffect(() => {
    const loadSettings = async () => {
      if (!userProfile?.company_id) return;

      try {
        // Get company information
        const { data: companyData, error: companyError } = await supabase
          .from('companies')
          .select('name, settings')
          .eq('id', userProfile.company_id)
          .single();

        if (companyError) throw companyError;

        // Load settings from company settings JSON field
        const settings = companyData?.settings || {};
        const emailConfig = settings.emailNotifications || {};

        setEmailSettings({
          enablePurchaseNotifications: emailConfig.enablePurchaseNotifications ?? true,
          enableLowStockAlerts: emailConfig.enableLowStockAlerts ?? true,
          enableUserActivityAlerts: emailConfig.enableUserActivityAlerts ?? false,
          enableStockRequestNotifications: emailConfig.enableStockRequestNotifications ?? true,
          adminEmail: emailConfig.adminEmail || '',
          companyName: companyData?.name || 'Inventory Management System'
        });

        setSettingsLoaded(true);
      } catch (error) {
        console.error('Failed to load email settings:', error);
      }
    };

    loadSettings();
  }, [userProfile?.company_id]);

  const updateSettings = async (key: string, value: any) => {
    const newSettings = { ...emailSettings, [key]: value };
    setEmailSettings(newSettings);
    onSettingsChange?.(newSettings);

    // Save settings to database
    if (!userProfile?.company_id) return;

    try {
      // Get current company settings
      const { data: companyData } = await supabase
        .from('companies')
        .select('settings')
        .eq('id', userProfile.company_id)
        .single();

      const currentSettings = companyData?.settings || {};

      // Update email notification settings
      const updatedSettings = {
        ...currentSettings,
        emailNotifications: newSettings
      };

      // Save back to database
      await supabase
        .from('companies')
        .update({ settings: updatedSettings })
        .eq('id', userProfile.company_id);

      toast({
        title: "Settings Saved",
        description: "Email notification settings updated successfully."
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast({
        title: "Save Failed",
        description: "Failed to save email settings.",
        variant: "destructive"
      });
    }
  };

  const sendTestEmail = async () => {
    if (!testEmail.to.trim()) {
      toast({
        title: "Email Required",
        description: "Please enter a recipient email address.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      console.log('Sending test email to:', testEmail.to);
      const { data, error } = await supabase.functions.invoke('email-notifications', {
        body: {
          type: 'test',
          to: testEmail.to,
          subject: testEmail.subject,
          message: testEmail.message,
          companyName: emailSettings.companyName
        }
      });

      console.log('Email response:', { data, error });

      if (error) {
        console.error('Email error:', error);
        throw error;
      }

      toast({
        title: "Test Email Sent",
        description: `Test email sent successfully to ${testEmail.to}`
      });
      
      setTestEmail({ ...testEmail, to: '' });
    } catch (error: any) {
      console.error('Test email failed:', error);
      toast({
        title: "Email Failed",
        description: `Failed to send test email: ${error.message || 'Unknown error'}`,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const sendPurchaseNotification = async (purchaseData: any) => {
    if (!emailSettings.enablePurchaseNotifications || !emailSettings.adminEmail) return;

    try {
      await supabase.functions.invoke('email-notifications', {
        body: {
          type: 'purchase',
          to: emailSettings.adminEmail,
          purchaseData,
          companyName: emailSettings.companyName,
          companyId: userProfile?.company_id
        }
      });
    } catch (error) {
      console.error('Purchase notification failed:', error);
    }
  };

  const sendLowStockAlert = async (items: any[]) => {
    if (!emailSettings.enableLowStockAlerts || !emailSettings.adminEmail) return;

    try {
      await supabase.functions.invoke('email-notifications', {
        body: {
          type: 'low_stock',
          to: emailSettings.adminEmail,
          items,
          companyName: emailSettings.companyName,
          companyId: userProfile?.company_id
        }
      });
    } catch (error) {
      console.error('Low stock alert failed:', error);
    }
  };

  const sendUserActivityAlert = async (activityData: any) => {
    if (!emailSettings.enableUserActivityAlerts || !emailSettings.adminEmail) return;

    try {
      await supabase.functions.invoke('email-notifications', {
        body: {
          type: 'user_activity',
          to: emailSettings.adminEmail,
          activityData,
          companyName: emailSettings.companyName,
          companyId: userProfile?.company_id
        }
      });
    } catch (error) {
      console.error('User activity alert failed:', error);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Email Notification Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="admin-email">Admin Email Address</Label>
            <Input
              id="admin-email"
              type="email"
              value={emailSettings.adminEmail}
              onChange={(e) => updateSettings('adminEmail', e.target.value)}
              placeholder="admin@company.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="company-name">Company Name</Label>
            <Input
              id="company-name"
              value={emailSettings.companyName}
              onChange={(e) => updateSettings('companyName', e.target.value)}
              placeholder="Your Company Name"
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="purchase-notifications">Purchase Notifications</Label>
              <Switch
                id="purchase-notifications"
                checked={emailSettings.enablePurchaseNotifications}
                onCheckedChange={(checked) => updateSettings('enablePurchaseNotifications', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="low-stock-alerts">Low Stock Alerts</Label>
              <Switch
                id="low-stock-alerts"
                checked={emailSettings.enableLowStockAlerts}
                onCheckedChange={(checked) => updateSettings('enableLowStockAlerts', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="activity-alerts">User Activity Alerts</Label>
              <Switch
                id="activity-alerts"
                checked={emailSettings.enableUserActivityAlerts}
                onCheckedChange={(checked) => updateSettings('enableUserActivityAlerts', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="stock-request-notifications">Stock Request Notifications</Label>
              <Switch
                id="stock-request-notifications"
                checked={emailSettings.enableStockRequestNotifications}
                onCheckedChange={(checked) => updateSettings('enableStockRequestNotifications', checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

     {/* 
           <Card>
      
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Send Test Email
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="test-email-to">Recipient Email</Label>
            <Input
              id="test-email-to"
              type="email"
              value={testEmail.to}
              onChange={(e) => setTestEmail({ ...testEmail, to: e.target.value })}
              placeholder="indytradingpost@comcast.net"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="test-subject">Subject</Label>
            <Input
              id="test-subject"
              value={testEmail.subject}
              onChange={(e) => setTestEmail({ ...testEmail, subject: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="test-message">Message</Label>
            <Textarea
              id="test-message"
              value={testEmail.message}
              onChange={(e) => setTestEmail({ ...testEmail, message: e.target.value })}
              rows={3}
            />
          </div>

          <Button 
            onClick={sendTestEmail} 
            disabled={isLoading || !testEmail.to.trim()}
            className="w-full"
          >
            <Send className="h-4 w-4 mr-2" />
            {isLoading ? 'Sending...' : 'Send Test Email'}
          </Button>
        </CardContent>
      </Card>
     */}
    </div>
  );

  // Export functions for use in other components
  (EmailNotifications as any).sendPurchaseNotification = sendPurchaseNotification;
  (EmailNotifications as any).sendLowStockAlert = sendLowStockAlert;
  (EmailNotifications as any).sendUserActivityAlert = sendUserActivityAlert;
};