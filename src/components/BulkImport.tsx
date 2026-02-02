import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Upload, AlertCircle, CheckCircle2, X, Image } from 'lucide-react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { uploadItemImage, validateImageFile } from '@/lib/imageUtils';
import { useAuth } from '@/contexts/AuthContext';

interface ImportItem {
  name: string;
  description?: string;
  category_id: string;
  barcode?: string;
  quantity: number;
  min_quantity?: number;
  unit_price?: number;
  location?: string;
  image?: File | null;
}

interface BulkImportProps {
  categories: { id: string; name: string }[];
  onImportComplete: () => void;
}

export const BulkImport: React.FC<BulkImportProps> = ({ categories, onImportComplete }) => {
  const [importData, setImportData] = useState<ImportItem[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState(true);
  const { toast } = useToast();
  const { userProfile } = useAuth();

  const validateData = (data: any[]): { valid: ImportItem[]; errors: string[] } => {
    const validItems: ImportItem[] = [];
    const errors: string[] = [];

    data.forEach((row, index) => {
      // Skip empty rows
      if (!row.name) {
        return;
      }

      // Required fields validation
      if (!row.name || !row.category) {
        errors.push(`Row ${index + 1}: Name and Category are required`);
        return;
      }

      // Find category ID by name
      const category = categories.find(c => 
        c.name.toLowerCase() === row.category.toLowerCase()
      );

      if (!category) {
        errors.push(`Row ${index + 1}: Invalid category "${row.category}"`);
        return;
      }

      // Convert quantity to number
      const quantity = parseInt(row.quantity) || 0;
      const min_quantity = parseInt(row.min_quantity) || 0;
      const unit_price = parseFloat(row.unit_price) || 0;

      validItems.push({
        name: row.name.trim(),
        description: row.description?.trim(),
        category_id: category.id,
        barcode: row.barcode?.trim(),
        quantity,
        min_quantity,
        unit_price,
        location: row.location?.trim()
      });
    });

    return { valid: validItems, errors };
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setErrors([]);
    setImportData([]);

    const fileType = file.name.split('.').pop()?.toLowerCase();

    if (fileType === 'csv') {
      Papa.parse(file, {
        header: true,
        complete: (results) => {
          const { valid, errors } = validateData(results.data);
          setImportData(valid);
          setErrors(errors);
        }
      });
    } else if (fileType === 'xlsx' || fileType === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        const { valid, errors } = validateData(jsonData);
        setImportData(valid);
        setErrors(errors);
      };
      reader.readAsBinaryString(file);
    } else {
      setErrors(['Invalid file type. Please upload a CSV or Excel file.']);
    }
  };

  const importItems = async () => {
    if (importData.length === 0) return;

    if (!userProfile?.company_id) {
      toast({
        title: "Error",
        description: "Company information not found",
        variant: "destructive"
      });
      return;
    }

    setImporting(true);
    try {
      // First, insert all items without images
      const itemsToInsert = importData.map(item => ({
        name: item.name,
        description: item.description,
        category_id: item.category_id,
        barcode: item.barcode,
        quantity: item.quantity,
        min_quantity: item.min_quantity,
        unit_price: item.unit_price,
        location: item.location,
        company_id: userProfile.company_id
      }));

      const { data: insertedItems, error } = await supabase
        .from('inventory_items')
        .insert(itemsToInsert)
        .select();

      if (error) throw error;

      // Now handle image uploads for items that have images
      const itemsWithImages = importData.filter(item => item.image);
      
      for (let i = 0; i < itemsWithImages.length; i++) {
        const item = itemsWithImages[i];
        const insertedItem = insertedItems?.[i];
        
        if (insertedItem && item.image) {
          try {
            // Validate image file
            const validation = validateImageFile(item.image);
            if (!validation.valid) {
              console.warn(`Invalid image for item ${item.name}: ${validation.error}`);
              continue;
            }

            // Upload image
            const imageUrl = await uploadItemImage(item.image, insertedItem.id);
            if (imageUrl) {
              // Update item with image URL
              await supabase
                .from('inventory_items')
                .update({ image_url: imageUrl })
                .eq('id', insertedItem.id);
            }
          } catch (imageError) {
            console.error(`Failed to upload image for item ${item.name}:`, imageError);
          }
        }
      }

      toast({
        title: "Success",
        description: `Successfully imported ${importData.length} items`,
      });

      setImportData([]);
      setErrors([]);
      onImportComplete();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to import items",
        variant: "destructive"
      });
    } finally {
      setImporting(false);
    }
  };

  const getCategoryName = (categoryId: string) => {
    return categories.find(c => c.id === categoryId)?.name || 'Unknown';
  };

  const handleImageSelect = (index: number, file: File | null) => {
    setImportData(prev => prev.map((item, i) => 
      i === index ? { ...item, image: file } : item
    ));
  };

  const removeImage = (index: number) => {
    setImportData(prev => prev.map((item, i) => 
      i === index ? { ...item, image: null } : item
    ));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Bulk Import Inventory
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          <Input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileUpload}
            className="cursor-pointer"
          />
          
          <Alert variant="info" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>File Format Requirements</AlertTitle>
            <AlertDescription>
              <p>Upload a CSV or Excel file with the following columns:</p>
              <ul className="list-disc list-inside mt-2">
                <li>name (required)</li>
                <li>category (required)</li>
                <li>quantity (optional, defaults to 0)</li>
                <li>description (optional)</li>
                <li>barcode (optional)</li>
                <li>min_quantity (optional)</li>
                <li>unit_price (optional)</li>
                <li>location (optional)</li>
              </ul>
              <p className="mt-2 font-medium">Images can be added manually in the preview table below.</p>
            </AlertDescription>
          </Alert>

          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Validation Errors</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside">
                  {errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {importData.length > 0 && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <h3 className="text-lg font-semibold">
                  Preview ({importData.length} items)
                </h3>
                <Button
                  onClick={importItems}
                  disabled={importing || errors.length > 0}
                  className="w-full sm:w-auto"
                >
                  {importing ? 'Importing...' : 'Import Items'}
                </Button>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Image</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importData.slice(0, 10).map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {getCategoryName(item.category_id)}
                          </Badge>
                        </TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{item.location || '-'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                handleImageSelect(index, file || null);
                              }}
                              className="w-32 text-xs"
                              id={`image-${index}`}
                            />
                            {item.image && (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-gray-600 max-w-20 truncate">
                                  {item.image.name}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeImage(index)}
                                  className="h-6 w-6 p-0"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                            {!item.image && (
                              <div className="flex items-center text-gray-400">
                                <Image className="h-4 w-4" />
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {importData.length > 10 && (
                  <div className="p-2 text-center text-sm text-gray-500">
                    And {importData.length - 10} more items...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
