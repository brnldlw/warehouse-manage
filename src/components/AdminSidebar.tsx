import React from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Package, Users, Activity, Settings, Scan, Mail, QrCode, 
  UserCheck, Truck, Plus, FileText, Wrench, Snowflake,
  BarChart3, ChevronRight, Menu, X
} from 'lucide-react';

interface AdminSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isOpen?: boolean;
  onToggle?: () => void;
}

const menuItems = [
  {
    category: "Inventory Management",
    items: [
      { id: "inventory", label: "Manage Parts", icon: Package },
      { id: "categories", label: "Categories", icon: Package },
      { id: "create-request", label: "Create Request", icon: Plus },
      { id: "fulfill", label: "Fulfill Requests", icon: Truck },
    ]
  },
  {
    category: "Team Management", 
    items: [
      { id: "techs", label: "Technicians", icon: UserCheck },
      { id: "tech-inventory", label: "Tech Inventory", icon: Package },
      { id: "trucks", label: "Trucks/Vans", icon: Truck },
      { id: "assignments", label: "Assignments", icon: Users },
    ]
  },
  {
    category: "Tools",
    items: [
      { id: "scanner", label: "Barcode Scanner", icon: Scan },
      { id: "generator", label: "Barcode Generator", icon: QrCode },
      { id: "monitor", label: "Live Monitor", icon: Activity },
    ]
  },
  {
    category: "Tracking",
    items: [
      { id: "warranty", label: "Warranty Tracker", icon: Wrench },
      { id: "refrigerant", label: "Refrigerant Tracker", icon: Snowflake },
      { id: "reports", label: "Reports", icon: BarChart3 },
    ]
  },
  {
    category: "Settings",
    items: [
      { id: "settings", label: "Email Settings", icon: Mail },
    ]
  }
];

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ activeTab, onTabChange, isOpen = true, onToggle }) => {
  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={onToggle}
        />
      )}
      
      {/* Sidebar */}
      <div className={`
        fixed md:relative z-50 md:z-auto
        w-64 bg-white shadow-lg border-r border-gray-200 h-full
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0
      `}>
        {/* Mobile Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 md:hidden">
          <h2 className="text-lg font-semibold text-gray-900">Admin Panel</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="md:hidden"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        
        {/* Desktop Header */}
        <div className="hidden md:block p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Admin Panel</h2>
          <p className="text-sm text-gray-600">Inventory Management</p>
        </div>
        
        <ScrollArea className="h-[calc(100vh-120px)]">
          <div className="p-4 space-y-6">
            {menuItems.map((category, categoryIndex) => (
              <div key={category.category}>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  {category.category}
                </h3>
                <div className="space-y-1">
                  {category.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    
                    return (
                      <Button
                        key={item.id}
                        variant={isActive ? "default" : "ghost"}
                        className={`w-full justify-start h-10 ${
                          isActive 
                            ? "bg-blue-600 text-white shadow-sm" 
                            : "text-gray-700 hover:bg-gray-100"
                        }`}
                        onClick={() => {
                          onTabChange(item.id);
                          // Close sidebar on mobile after selection
                          if (window.innerWidth < 768 && onToggle) {
                            onToggle();
                          }
                        }}
                      >
                        <Icon className="h-4 w-4 mr-3" />
                        <span className="text-sm">{item.label}</span>
                        {isActive && <ChevronRight className="h-4 w-4 ml-auto" />}
                      </Button>
                    );
                  })}
                </div>
                {categoryIndex < menuItems.length - 1 && (
                  <Separator className="mt-4" />
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </>
  );
};