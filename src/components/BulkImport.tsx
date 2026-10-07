import React, { useEffect, useState } from 'react';
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
import { PO_NOT_ENABLED, parsePurchaseDate, usePoSupport } from '@/lib/poSupport';
import { downloadTableCsv } from '@/lib/tableExport';
import { COLOR_SHORT_NOTE, TOOL_COLORS, parseColor, useColorSupport } from '@/lib/toolColor';
import { getLastWarehouse, setLastWarehouse, useWarehouses } from '@/lib/warehouses';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ColorDot } from '@/components/ColorDot';

interface ImportItem {
  name: string;
  description?: string;
  category_id: string;
  barcode?: string;
  serial_number?: string;
  condition?: 'good' | 'fair' | 'poor' | 'damaged';
  unit_price?: number;
  quantity?: number;
  image?: File | null;
  po_number?: string;
  /** "YYYY-MM-DD" */
  purchase_date?: string;
  /** 'red', 'blue', … */
  color?: string;
  /** From the optional Warehouse column (matched by name); empty = the warehouse chosen above the file. */
  warehouse_id?: string;
}

const TEMPLATE_HEADERS = ['Name', 'Category', 'Quantity', 'Serial_Number', 'Description', 'Barcode', 'Condition', 'Color', 'Unit_Price', 'PO_Number', 'Purchase_Date', 'Warehouse'];
const COLUMN_LIST = 'Name, Category, Quantity, Serial_Number, Description, Barcode, Condition, Color, Unit_Price, PO_Number, Purchase_Date, Warehouse';



interface BulkImportProps {
  categories: { id: string; name: string }[];
  onImportComplete: () => void;
}

export const BulkImport: React.FC<BulkImportProps> = ({ categories, onImportComplete }) => {
  const [importData, setImportData] = useState<ImportItem[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState(true);
  const [fileFormatError, setFileFormatError] = useState<string | null>(null);
  const { toast } = useToast();
  const { userProfile } = useAuth();

  // Required and optional headers for validation
  const REQUIRED_HEADERS = ['name', 'category'];
  const VALID_HEADERS = ['name', 'category', 'serial_number', 'description', 'barcode', 'condition', 'color', 'unit_price', 'quantity', 'po_number', 'purchase_date', 'warehouse'];
  const poSupported = usePoSupport();
  const colorSupported = useColorSupport();
  // Several warehouses (migration 006): every imported tool needs a home warehouse.
  const wh = useWarehouses(userProfile?.company_id);
  const [warehouseId, setWarehouseId] = useState('');
  useEffect(() => {
    if (wh.enabled && !warehouseId) setWarehouseId(getLastWarehouse(userProfile?.company_id, wh.active));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wh.enabled, wh.active]);

  const downloadTemplate = () => {
    const example = ['Cordless Drill', categories[0]?.name ?? 'Power Tools', '2', '', '', '', 'good', 'Red', '149.99', 'PO-1042', '9/28/2026', wh.active[0]?.name ?? ''];
    downloadTableCsv('tool-import-template.csv',
      TEMPLATE_HEADERS.map((h) => ({ key: h, label: h })),
      [Object.fromEntries(TEMPLATE_HEADERS.map((h, i) => [h, example[i]]))]);
  };
  const OLD_FORMAT_HEADERS = ['min_quantity', 'location']; // Old consumable format

  const normalizeHeader = (header: string): string => {
    return header.toLowerCase().trim().replace(/\s+/g, '_');
  };

  const validateFileHeaders = (headers: string[]): { valid: boolean; error: string | null } => {
    const normalizedHeaders = headers.map(normalizeHeader);
    
    // Check for old format headers
    const oldHeadersFound = OLD_FORMAT_HEADERS.filter(h => normalizedHeaders.includes(h));
    if (oldHeadersFound.length > 0) {
      return {
        valid: false,
        error: `This file appears to be in the OLD format. Found columns: "${oldHeadersFound.join(', ')}". 
        
The new format requires: Name, Category, Serial_Number, Description, Barcode, Condition, Unit_Price

Please update your file to remove Quantity, Min_Quantity, and Location columns, and add Serial_Number and Condition columns instead.`
      };
    }

    // Check for required headers
    const missingRequired = REQUIRED_HEADERS.filter(h => !normalizedHeaders.includes(h));
    if (missingRequired.length > 0) {
      return {
        valid: false,
        error: `Missing required columns: "${missingRequired.join(', ')}". 

Required columns: Name, Category
Optional columns: Quantity, Serial_Number, Description, Barcode, Condition, Color, Unit_Price, PO_Number, Purchase_Date`
      };
    }

    // Check for unrecognized headers
    const unrecognizedHeaders = normalizedHeaders.filter(h => h && !VALID_HEADERS.includes(h));
    if (unrecognizedHeaders.length > 0) {
      return {
        valid: false,
        error: `Unrecognized columns found: "${unrecognizedHeaders.join(', ')}". 

Valid columns are: ${COLUMN_LIST}`
      };
    }

    return { valid: true, error: null };
  };

  // Helper to get value from row with case-insensitive key
  const getRowValue = (row: any, key: string): any => {
    // Same rule as the header check: "PO Number", "po_number" and "PO_Number" all match.
    const normalizedKey = normalizeHeader(key);
    for (const k of Object.keys(row)) {
      if (normalizeHeader(k) === normalizedKey) {
        return row[k];
      }
    }
    return undefined;
  };

  const validateData = (data: any[]): { valid: ImportItem[]; errors: string[] } => {
    const validItems: ImportItem[] = [];
    const errors: string[] = [];

    data.forEach((row, index) => {
      const name = getRowValue(row, 'name');
      const category = getRowValue(row, 'category');
      const serialNumber = getRowValue(row, 'serial_number');
      const description = getRowValue(row, 'description');
      const barcode = getRowValue(row, 'barcode');
      const conditionValue = getRowValue(row, 'condition');
      const unitPrice = getRowValue(row, 'unit_price');

      // Skip empty rows
      if (!name) {
        return;
      }

      // Required fields validation
      if (!name || !category) {
        errors.push(`Row ${index + 1}: Name and Category are required`);
        return;
      }

      // Find category ID by name
      const categoryMatch = categories.find(c => 
        c.name.toLowerCase() === category.toString().toLowerCase().trim()
      );

      if (!categoryMatch) {
        errors.push(`Row ${index + 1}: Invalid category "${category}". Category must exist in your system.`);
        return;
      }

      // Validate condition if provided
      const validConditions = ['good', 'fair', 'poor', 'damaged'];
      const condition = conditionValue?.toString().toLowerCase().trim() || 'good';
      if (!validConditions.includes(condition)) {
        errors.push(`Row ${index + 1}: Invalid condition "${conditionValue}". Must be good, fair, poor, or damaged`);
        return;
      }

      const unit_price = parseFloat(unitPrice) || 0;
      const qty = parseInt(getRowValue(row, 'quantity')) || 1;

      const purchaseDate = parsePurchaseDate(getRowValue(row, 'purchase_date'));
      if (purchaseDate === 'invalid') {
        errors.push(`Row ${index + 1}: Purchase_Date "${getRowValue(row, 'purchase_date')}" isn't a date. Use 9/28/2026 or 2026-09-28.`);
        return;
      }
      const poNumber = getRowValue(row, 'po_number')?.toString().trim() || undefined;
      const color = parseColor(getRowValue(row, 'color'));
      if (color === 'invalid') {
        errors.push(`Row ${index + 1}: Color "${getRowValue(row, 'color')}" isn't one of: ${TOOL_COLORS.map((c) => c.label).join(', ')} (or leave it empty).`);
        return;
      }

      // Optional Warehouse column: an active warehouse of this company, by name (capitals / spaces ignored).
      const whText = (getRowValue(row, 'warehouse') ?? '').toString().trim();
      let rowWarehouse: string | undefined;
      if (whText && wh.enabled) {
        const key = whText.replace(/\s+/g, ' ').toLowerCase();
        const match = wh.warehouses.find((w) => w.name.replace(/\s+/g, ' ').toLowerCase() === key);
        if (!match || !match.is_active) {
          errors.push(`Row ${index + 1}: Warehouse "${whText}" ${match ? 'is inactive' : "doesn't exist"}. Use one of: ${wh.active.map((w) => w.name).join(', ')} (or leave it empty).`);
          return;
        }
        rowWarehouse = match.id;
      }

      validItems.push({
        warehouse_id: rowWarehouse,
        color: color ?? undefined,
        po_number: poNumber,
        purchase_date: purchaseDate ?? undefined,
        name: name.toString().trim(),
        description: description?.toString().trim(),
        category_id: categoryMatch.id,
        barcode: barcode?.toString().trim(),
        serial_number: serialNumber?.toString().trim(),
        condition: condition as 'good' | 'fair' | 'poor' | 'damaged',
        unit_price,
        quantity: Math.max(1, Math.min(qty, 500))
      });
    });

    return { valid: validItems, errors };
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setErrors([]);
    setImportData([]);
    setFileFormatError(null);

    const fileType = file.name.split('.').pop()?.toLowerCase();

    if (fileType === 'csv') {
      Papa.parse(file, {
        header: true,
        complete: (results) => {
          // First validate headers
          const headers = results.meta.fields || [];
          const headerValidation = validateFileHeaders(headers);
          
          if (!headerValidation.valid) {
            setFileFormatError(headerValidation.error);
            return;
          }

          // Then validate data
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
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        // Get headers from first row
        const headers = (jsonData[0] || []).map(String);
        const headerValidation = validateFileHeaders(headers);
        
        if (!headerValidation.valid) {
          setFileFormatError(headerValidation.error);
          return;
        }

        // Parse with headers
        const jsonDataWithHeaders = XLSX.utils.sheet_to_json(worksheet);
        const { valid, errors } = validateData(jsonDataWithHeaders);
        setImportData(valid);
        setErrors(errors);
      };
      reader.readAsBinaryString(file);
    } else {
      setFileFormatError('Invalid file type. Please upload a CSV or Excel (.xlsx, .xls) file.');
    }
  };

  const importItems = async () => {
    if (importData.length === 0) return;

    if (wh.enabled && !warehouseId && importData.some((i) => !i.warehouse_id)) {
      toast({ title: "Error", description: "Choose the warehouse for these tools", variant: "destructive" });
      return;
    }

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
      // Expand items: each row can have a quantity, creating N individual records with same group_id
      const itemsToInsert: any[] = [];
      const groupMap: { index: number; groupId: string; qty: number }[] = [];

      importData.forEach((item, idx) => {
        const qty = item.quantity || 1;
        const groupId = crypto.randomUUID();
        groupMap.push({ index: idx, groupId, qty });

        for (let i = 0; i < qty; i++) {
          itemsToInsert.push({
            name: item.name,
            description: item.description,
            category_id: item.category_id,
            barcode: qty === 1 ? (item.barcode || null) : null, // Only set barcode if single
            serial_number: qty === 1 ? (item.serial_number || null) : null, // Only set serial if single
            condition: item.condition || 'good',
            location_type: 'warehouse',
            assigned_truck_id: null,
            quantity: 1,
            min_quantity: 0,
            unit_price: item.unit_price,
            location: 'Warehouse',
            company_id: userProfile.company_id,
            group_id: groupId,
            // Every tool in the row gets the row's PO (only once the database has the columns)
            ...(poSupported ? { po_number: item.po_number || null, purchase_date: item.purchase_date || null } : {}),
            ...(colorSupported ? { color: item.color || null } : {}),
            // Home warehouse (and it's in that warehouse): the row's, or the one chosen above the file.
            ...(wh.enabled ? { home_warehouse_id: item.warehouse_id || warehouseId, current_warehouse_id: item.warehouse_id || warehouseId } : {}),
          });
        }
      });

      const totalItems = itemsToInsert.length;

      // Insert in batches of 100 to avoid Supabase limits
      const insertedItems: any[] = [];
      for (let i = 0; i < itemsToInsert.length; i += 100) {
        const batch = itemsToInsert.slice(i, i + 100);
        const { data, error } = await supabase
          .from('inventory_items')
          .insert(batch)
          .select();

        if (error) throw error;
        if (data) insertedItems.push(...data);
      }

      // Log activity per group (not per individual item)
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const activityLogs = groupMap.map(g => ({
          company_id: userProfile.company_id,
          user_id: user.id,
          action: 'added',
          details: {
            item_name: importData[g.index].name,
            group_id: g.groupId,
            quantity: g.qty,
            condition: importData[g.index].condition || 'good',
            location: 'Warehouse',
            import_method: 'bulk'
          }
        }));

        await supabase.from('activity_logs').insert(activityLogs);
      }

      // Handle image uploads — apply image to all items in the group
      for (let idx = 0; idx < importData.length; idx++) {
        const item = importData[idx];
        if (!item.image) continue;

        const group = groupMap[idx];
        const firstGroupItem = insertedItems.find(i => i.group_id === group.groupId);
        if (!firstGroupItem) continue;

        try {
          const validation = validateImageFile(item.image);
          if (!validation.valid) continue;

          const imageUrl = await uploadItemImage(item.image, firstGroupItem.id);
          if (imageUrl) {
            await supabase
              .from('inventory_items')
              .update({ image_url: imageUrl })
              .eq('group_id', group.groupId);
          }
        } catch (imageError) {
          console.error(`Failed to upload image for item ${item.name}:`, imageError);
        }
      }

      toast({
        title: "Success",
        description: `Successfully imported ${totalItems} items from ${importData.length} rows`,
      });

      if (wh.enabled && warehouseId) setLastWarehouse(userProfile.company_id, warehouseId);
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
          {wh.enabled && (
            <div className="space-y-1.5 max-w-md">
              <Label htmlFor="import-warehouse">Warehouse for these tools *</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger id="import-warehouse" className="h-12 text-base"><SelectValue placeholder="Choose warehouse" /></SelectTrigger>
                <SelectContent>
                  {wh.active.map((w) => <SelectItem key={w.id} value={w.id} className="py-3 text-base">{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-700">Every imported tool belongs to (and starts in) this warehouse, unless its row has a Warehouse.</p>
            </div>
          )}
          <Input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileUpload}
            className="cursor-pointer"
          />
          
          <Alert variant="default" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>File Format Requirements</AlertTitle>
            <AlertDescription>
              <p className="mb-2">Upload a CSV or Excel file with the following columns:</p>
              <div className="bg-gray-100 p-3 rounded-md font-mono text-sm mb-2">
                {COLUMN_LIST}
              </div>
              <Button type="button" variant="outline" className="h-11 border-2 mb-2" onClick={downloadTemplate}>
                Download template (CSV)
              </Button>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li><strong>Name</strong> (required) - Tool name</li>
                <li><strong>Category</strong> (required) - Must match existing category</li>
                <li><strong>Quantity</strong> (optional) - How many of this tool (default: 1). E.g., 60 ladders creates 60 individual records grouped together</li>
                <li><strong>Serial_Number</strong> (optional) - Only used when quantity is 1</li>
                <li><strong>Barcode</strong> (optional) - Only used when quantity is 1</li>
                <li><strong>Condition</strong> (optional) - good, fair, poor, or damaged (defaults to "good")</li>
                <li><strong>Color</strong> (optional) - {TOOL_COLORS.map((c) => c.label).join(', ')}; every tool in the row gets it</li>
                <li><strong>Unit_Price</strong> (optional) - Price in dollars</li>
                <li><strong>Description</strong> (optional)</li>
                <li><strong>PO_Number</strong> (optional) - Purchase order number; every tool in the row gets it</li>
                <li><strong>Purchase_Date</strong> (optional) - e.g. 9/28/2026 or 2026-09-28</li>
                {wh.enabled && <li><strong>Warehouse</strong> (optional) - one of: {wh.active.map((w) => w.name).join(', ')}. Empty = the warehouse chosen above.</li>}
              </ul>
              {poSupported === false && <p className="mt-2 text-sm font-medium text-amber-800">{PO_NOT_ENABLED} PO_Number and Purchase_Date will be skipped until then.</p>}
              {colorSupported === false && <p className="mt-2 text-sm font-medium text-amber-800">{COLOR_SHORT_NOTE} The Color column will be skipped until then.</p>}
              <p className="mt-3 text-sm text-blue-600 font-medium">💡 Use Quantity to add multiple identical tools at once (e.g., 60 ladders). They'll be grouped for easy management.</p>
              <p className="mt-2 text-sm text-gray-600">Note: All imported tools will be placed in {wh.enabled ? 'their warehouse' : 'the Warehouse'}. Serial # and barcode are ignored when quantity &gt; 1.</p>
            </AlertDescription>
          </Alert>

          {fileFormatError && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Invalid File Format</AlertTitle>
              <AlertDescription className="whitespace-pre-line">
                {fileFormatError}
              </AlertDescription>
            </Alert>
          )}

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
                  Preview ({importData.length} rows, {importData.reduce((sum, item) => sum + (item.quantity || 1), 0)} total items)
                  {poSupported === false && importData.some((i) => i.po_number || i.purchase_date) && (
                    <span className="block text-sm font-medium text-amber-800">PO numbers in this file won't be saved yet: {PO_NOT_ENABLED}</span>
                  )}
                </h3>
                <Button
                  onClick={importItems}
                  disabled={importing || errors.length > 0 || !!fileFormatError || (wh.enabled && !warehouseId && importData.some((i) => !i.warehouse_id))}
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
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead>Serial #</TableHead>
                      <TableHead>PO #</TableHead>
                      {wh.enabled && <TableHead>Warehouse</TableHead>}
                      <TableHead>Condition</TableHead>
                      <TableHead>Image</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importData.slice(0, 10).map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium"><span className="flex items-center gap-2"><ColorDot color={item.color} />{item.name}</span></TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {getCategoryName(item.category_id)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={item.quantity && item.quantity > 1 ? 'default' : 'secondary'} className={item.quantity && item.quantity > 1 ? 'bg-blue-600' : ''}>
                            {item.quantity || 1}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{item.serial_number || '-'}</TableCell>
                        <TableCell className="text-sm">{item.po_number || '-'}{item.purchase_date ? ` · ${item.purchase_date}` : ''}</TableCell>
                        {wh.enabled && <TableCell className="text-sm">{wh.byId.get(item.warehouse_id || warehouseId)?.name ?? '—'}</TableCell>}
                        <TableCell>
                          <Badge className={
                            item.condition === 'good' ? 'bg-green-100 text-green-800' :
                            item.condition === 'fair' ? 'bg-yellow-100 text-yellow-800' :
                            item.condition === 'poor' ? 'bg-orange-100 text-orange-800' :
                            'bg-red-100 text-red-800'
                          }>
                            {(item.condition || 'good').charAt(0).toUpperCase() + (item.condition || 'good').slice(1)}
                          </Badge>
                        </TableCell>
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
