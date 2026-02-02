import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, Users, Activity, UserCheck, Menu } from 'lucide-react';
import { useInventory } from '@/contexts/InventoryContext';
import { AdminSidebar } from './AdminSidebar';
import CategoryManager from './CategoryManager';
import { InventoryManager } from './InventoryManager';
import LiveMonitor from './LiveMonitor';
import { BarcodeScanner } from './BarcodeScanner';
import { EmailNotifications } from './EmailNotifications';
import { BarcodeGenerator } from './BarcodeGenerator';
import { TruckManager } from './TruckManager';
import { TruckAssignmentManager } from './TruckAssignment';
import { TechManagement } from './TechManagement';
import { TechInventoryViewer } from './TechInventoryViewer';
import { FulfillRequests } from './FulfillRequests';
import { WarrantyTracker } from './WarrantyTracker';
import { RefrigerantTracker } from './RefrigerantTracker';
import { ReportsPanel } from './ReportsPanel';
import { CreateRequest } from './CreateRequest';
import { supabase } from '@/lib/supabase';
export const AdminPanel: React.FC = () => {
  const [techCount, setTechCount] = useState(0);
  const [activeUserCount, setActiveUserCount] = useState(0);
  const [categoryCount, setCategoryCount] = useState(0);
  const [itemCount, setItemCount] = useState(0);
  const [activeTab, setActiveTab] = useState('inventory');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    fetchUserCounts();
  }, []);

  // Close sidebar on mobile when screen size changes
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchUserCounts = async () => {
    try {
      // Get current user's company ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user's company information
      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();

      if (!profileData?.company_id) return;

      const companyId = profileData.company_id;

      // Get company name
      const { data: companyData } = await supabase
        .from('companies')
        .select('name')
        .eq('id', companyId)
        .single();

      if (companyData) {
        setCompanyName(companyData.name);
      }

      // Fetch categories count for specific company
      const { data: categoryData, error: categoryError } = await supabase
        .from('categories')
        .select('id')
        .eq('company_id', companyId);

      if (categoryError) throw categoryError;
      setCategoryCount(categoryData?.length || 0);

      // Fetch items count for specific company
      const { data: itemData, error: itemError } = await supabase
        .from('inventory_items')
        .select('id')
        .eq('company_id', companyId);

      if (itemError) throw itemError;
      setItemCount(itemData?.length || 0);

      // Fetch tech count for specific company
      const { data: techData, error: techError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('role', 'tech')
        .eq('is_active', true)
        .eq('company_id', companyId);

      if (techError) throw techError;
      setTechCount(techData?.length || 0);

      // Fetch active users count for specific company
      const { data: userData, error: userError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('is_active', true)
        .eq('company_id', companyId);

      if (userError) throw userError;
      setActiveUserCount(userData?.length || 0);
    } catch (error) {
      console.error('Error fetching user counts:', error);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'inventory':
        return <InventoryManager />;
      case 'categories':
        return <CategoryManager />;
      case 'create-request':
        return <CreateRequest />;
      case 'fulfill':
        return <FulfillRequests />;
      case 'trucks':
        return <TruckManager />;
      case 'assignments':
        return <TruckAssignmentManager />;
      case 'techs':
        return <TechManagement />;
      case 'tech-inventory':
        return <TechInventoryViewer />;
      case 'scanner':
        return (
          <Card className="bg-white shadow-lg">
            <CardHeader>
              <CardTitle>Barcode Scanner</CardTitle>
            </CardHeader>
            <CardContent>
              <BarcodeScanner />
            </CardContent>
          </Card>
        );
      case 'generator':
        return (
          <Card className="bg-white shadow-lg">
            <CardHeader>
              <CardTitle>Barcode Generator</CardTitle>
            </CardHeader>
            <CardContent>
              <BarcodeGenerator />
            </CardContent>
          </Card>
        );
      case 'monitor':
        return <LiveMonitor />;
      case 'settings':
        return (
          <Card className="bg-white shadow-lg">
            <CardHeader>
              <CardTitle>Email Notifications</CardTitle>
            </CardHeader>
            <CardContent>
              <EmailNotifications />
            </CardContent>
          </Card>
        );
      case 'warranty':
        return <WarrantyTracker />;
      case 'refrigerant':
        return <RefrigerantTracker />;
      case 'reports':
        return <ReportsPanel />;
      default:
        return <InventoryManager />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="flex h-screen">
        <AdminSidebar 
          activeTab={activeTab} 
          onTabChange={setActiveTab}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
        />
        
        <div className="flex-1 overflow-auto">
          {/* Mobile Header */}
          <div className="md:hidden bg-white shadow-sm border-b border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="md:hidden"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <h1 className="text-lg font-semibold text-gray-900">Admin Panel</h1>
              <div className="w-9"></div> {/* Spacer for centering */}
            </div>
          </div>
          
          <div className="p-4 md:p-6">
            <div className="mb-8">
              <h1 className="text-2xl md:text-4xl font-bold text-gray-900 mb-2">
                {companyName ? `${companyName} - Admin Panel` : 'Trade Inventory Admin'}
              </h1>
              <p className="text-gray-600">Manage your skilled trade inventory and team</p>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-8">
              <Card className="bg-white shadow-lg border-0 hover:shadow-xl transition-shadow">
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs md:text-sm font-medium text-gray-600">Categories</p>
                      <p className="text-2xl md:text-3xl font-bold text-blue-600">{categoryCount}</p>
                    </div>
                    <Package className="h-6 w-6 md:h-8 md:w-8 text-blue-600" />
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-white shadow-lg border-0 hover:shadow-xl transition-shadow">
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs md:text-sm font-medium text-gray-600">Total Items</p>
                      <p className="text-2xl md:text-3xl font-bold text-green-600">{itemCount}</p>
                    </div>
                    <Package className="h-6 w-6 md:h-8 md:w-8 text-green-600" />
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-white shadow-lg border-0 hover:shadow-xl transition-shadow">
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs md:text-sm font-medium text-gray-600">Active Users</p>
                      <p className="text-2xl md:text-3xl font-bold text-purple-600">{activeUserCount}</p>
                    </div>
                    <Users className="h-6 w-6 md:h-8 md:w-8 text-purple-600" />
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-white shadow-lg border-0 hover:shadow-xl transition-shadow">
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs md:text-sm font-medium text-gray-600">Technicians</p>
                      <p className="text-2xl md:text-3xl font-bold text-indigo-600">{techCount}</p>
                    </div>
                    <UserCheck className="h-6 w-6 md:h-8 md:w-8 text-indigo-600" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Main Content */}
            <div className="bg-white rounded-lg shadow-lg">
              {renderContent()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;