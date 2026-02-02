import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Package, Trash2, QrCode, Smartphone, Filter, Scan } from 'lucide-react';
import { BarcodeScanner } from './BarcodeScanner';
import { BarcodeInput } from './BarcodeInput';
import { useInventory } from '@/contexts/InventoryContext';

const MobileApp: React.FC = () => {
  const { items, categories, deleteItem, currentUser } = useInventory();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Filter items for current user (simulate individual inventory)
  const userItems = useMemo(() => {
    return items.filter(item => item.userId === currentUser?.id || !item.userId);
  }, [items, currentUser]);

  const filteredItems = useMemo(() => {
    return userItems.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           item.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || item.categoryId === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [userItems, searchTerm, selectedCategory]);

  const getCategoryName = (categoryId: string) => {
    return categories.find(cat => cat.id === categoryId)?.name || 'Unknown';
  };

  const getCategoryColor = (categoryId: string) => {
    return categories.find(cat => cat.id === categoryId)?.color || '#6B7280';
  };

  const handleDeleteItem = (itemId: string) => {
    if (confirm('Are you sure you want to remove this item from your inventory?')) {
      deleteItem(itemId);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 p-4">
      <div className="max-w-md mx-auto">
        <div className="mb-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Smartphone className="h-8 w-8 text-green-600" />
            <h1 className="text-2xl font-bold text-gray-900">Trade Inventory</h1>
          </div>
          <p className="text-gray-600">Mobile App - {currentUser?.name}</p>
        </div>

        <Tabs defaultValue="inventory" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 bg-white shadow-lg">
            <TabsTrigger value="inventory" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
              Inventory
            </TabsTrigger>
            <TabsTrigger value="scanner" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
              <Scan className="h-4 w-4 mr-1" />
              Scanner
            </TabsTrigger>
            <TabsTrigger value="categories" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
              Categories
            </TabsTrigger>
          </TabsList>

          <TabsContent value="inventory" className="space-y-4">
            {/* Search and Filter */}
            <Card className="bg-white shadow-lg">
              <CardContent className="p-4 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search your items..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Items List */}
            <div className="space-y-3">
              {filteredItems.map((item) => (
                <Card key={item.id} className="bg-white shadow-lg hover:shadow-xl transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg text-gray-900">{item.name}</h3>
                        <Badge 
                          style={{ 
                            backgroundColor: getCategoryColor(item.categoryId), 
                            color: 'white' 
                          }}
                          className="text-xs mt-1"
                        >
                          {getCategoryName(item.categoryId)}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteItem(item.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Quantity:</span>
                        <p className={`font-semibold ${item.quantity <= item.minQuantity ? 'text-red-600' : 'text-gray-900'}`}>
                          {item.quantity}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-600">Price:</span>
                        <p className="font-semibold text-gray-900">${item.price.toFixed(2)}</p>
                      </div>
                      <div className="col-span-2">
                        <span className="text-gray-600">Location:</span>
                        <p className="font-semibold text-gray-900">{item.location}</p>
                      </div>
                    </div>

                    {item.barcode && (
                      <div className="flex items-center gap-2 mt-3 p-2 bg-gray-50 rounded">
                        <QrCode className="h-4 w-4 text-gray-600" />
                        <span className="text-sm font-mono text-gray-700">{item.barcode}</span>
                      </div>
                    )}

                    {item.quantity <= item.minQuantity && (
                      <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded">
                        <p className="text-sm text-red-800 font-medium">⚠️ Low Stock Alert</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {filteredItems.length === 0 && (
              <Card className="bg-white shadow-lg">
                <CardContent className="p-8 text-center">
                  <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No items found in your inventory</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="scanner" className="space-y-4">
            <BarcodeScanner />
            <BarcodeInput />
          </TabsContent>

          <TabsContent value="categories" className="space-y-3">
            {categories.map((category) => (
              <Card key={category.id} className="bg-white shadow-lg">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: category.color }}
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{category.name}</h3>
                      {category.description && (
                        <p className="text-sm text-gray-600 mt-1">{category.description}</p>
                      )}
                    </div>
                    <Badge variant="secondary">
                      {userItems.filter(item => item.categoryId === category.id).length}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default MobileApp;