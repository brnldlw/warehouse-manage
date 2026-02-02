import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Scan } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

interface InventorySearchProps {
  onItemFound?: (item: any) => void;
  onOpenScanner?: () => void;
}

export const InventorySearch: React.FC<InventorySearchProps> = ({ 
  onItemFound, 
  onOpenScanner 
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const { toast } = useToast();

  const searchInventory = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .or(`name.ilike.%${query}%,barcode.eq.${query},description.ilike.%${query}%`)
        .limit(10);

      if (error) throw error;
      
      setSearchResults(data || []);
      
      if (data && data.length > 0) {
        toast({
          title: "Search Results",
          description: `Found ${data.length} item(s)`
        });
      } else {
        toast({
          title: "No Results",
          description: "No items found matching your search"
        });
      }
    } catch (error: any) {
      toast({
        title: "Search Error",
        description: error.message || "Failed to search inventory",
        variant: "destructive"
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = () => {
    searchInventory(searchQuery);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Search Inventory
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, barcode, or description..."
            onKeyPress={handleKeyPress}
            className="flex-1"
          />
          <Button 
            onClick={handleSearch}
            disabled={isSearching || !searchQuery.trim()}
          >
            <Search className="h-4 w-4" />
          </Button>
          {onOpenScanner && (
            <Button onClick={onOpenScanner} variant="outline">
              <Scan className="h-4 w-4" />
            </Button>
          )}
        </div>

        {isSearching && (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-sm text-gray-600">Searching...</p>
          </div>
        )}

        {searchResults.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-semibold">Search Results:</h4>
            <div className="max-h-64 overflow-y-auto space-y-2">
              {searchResults.map((item) => (
                <div 
                  key={item.id} 
                  className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                  onClick={() => onItemFound?.(item)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-sm text-gray-600">{item.description}</p>
                      {item.barcode && (
                        <p className="text-xs text-gray-500">Barcode: {item.barcode}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">Qty: {item.quantity}</p>
                      <p className="text-sm text-gray-600">${item.price}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};