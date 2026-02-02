import React, { useState, useEffect, useRef } from 'react';
import { BrowserBarcodeReader, NotFoundException, BarcodeFormat, DecodeHintType } from '@zxing/library';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Scan, Plus, XCircle, RotateCcw, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useInventory } from '@/contexts/InventoryContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { uploadItemImage, validateImageFile } from '@/lib/imageUtils';

interface BarcodeScannerProps {
  onItemAdded?: (item: any) => void;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onItemAdded }) => {
  const [scannedBarcode, setScannedBarcode] = useState<string>('');
  const [isScanning, setIsScanning] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [scannedData, setScannedData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const { addItem, categories } = useInventory();
  const { toast } = useToast();
  const { isAdmin, isTech, userProfile } = useAuth();
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReaderRef = useRef<BrowserBarcodeReader | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);











  // Allow both admins and techs to use scanner - simplified permission check
  const canUseScanner = isAdmin || isTech || userProfile?.role === 'tech' || userProfile?.role === 'admin';

  const startScanning = async () => {
    if (!videoRef.current) return;

    try {
      if (!codeReaderRef.current) {
        // Configure hints to only scan 1D barcodes (exclude QR codes)
        const hints = new Map();
        const formats = [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_39,
          BarcodeFormat.CODE_93,
          BarcodeFormat.CODE_128,
          BarcodeFormat.ITF,
          BarcodeFormat.CODABAR,
        ];
        hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
        codeReaderRef.current = new BrowserBarcodeReader(hints);
      }

      const videoInputDevices = await codeReaderRef.current.listVideoInputDevices();
      
      if (videoInputDevices.length === 0) {
        throw new Error('No camera found');
      }

      // Prefer back camera on mobile devices
      const selectedDeviceId = videoInputDevices.find(device => 
        device.label.toLowerCase().includes('back')
      )?.deviceId || videoInputDevices[0].deviceId;

      await codeReaderRef.current.decodeFromVideoDevice(
        selectedDeviceId,
        videoRef.current,
        (result, error) => {
          if (result) {
            const barcodeText = result.getText();
            const format = result.getBarcodeFormat();
            
            // Double-check it's not a QR code
            if (format === BarcodeFormat.QR_CODE) {
              toast({
                title: "Invalid Code",
                description: "Please scan a barcode, not a QR code.",
                variant: "destructive",
              });
              return;
            }
            
            if (barcodeText && barcodeText !== scannedBarcode) {
              setScannedBarcode(barcodeText);
              setIsScanning(false);
              lookupBarcode(barcodeText);
              toast({
                title: "Barcode Scanned",
                description: `Successfully scanned barcode: ${barcodeText}`,
              });
              // Stop scanning after successful scan
              stopScanning();
            }
          }
          if (error && !(error instanceof NotFoundException)) {
            console.error('Barcode scan error:', error);
          }
        }
      );
      
      setHasError(false);
    } catch (error) {
      console.error("Barcode Scanner Error:", error);
      setHasError(true);
      toast({
        title: "Scanner Error",
        description: "Failed to access camera. Please check permissions.",
        variant: "destructive",
      });
    }
  };

  const stopScanning = () => {
    if (codeReaderRef.current) {
      codeReaderRef.current.reset();
    }
  };

  const resetScanner = () => {
    stopScanning();
    setScannedBarcode('');
    setIsScanning(true);
    setHasError(false);
    setScannedData(null);
    setImageFile(null);
    setImagePreview('');
    toast({
      title: "Scanner Reset",
      description: "Ready to scan again",
    });
  };

  const lookupBarcode = async (barcode: string) => {
    setIsLoading(true);
    try {
      // Try to lookup in existing inventory first
      const { data: existingItem, error } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('barcode', barcode)
        .maybeSingle();

      if (existingItem) {
        setScannedData({ ...existingItem, isExisting: true });
        toast({
          title: "Product Found",
          description: `Found: ${existingItem.name}`
        });
        return;
      }

      // Product not found in database - create manual entry option
      setScannedData({
        barcode,
        name: '',
        description: '',
        category_id: categories.length > 0 ? categories[0].id : '',
        unit_price: '',
        quantity: '',
        min_quantity: '',
        location: '',
        supplier: '',
        image_url: '',
        company_id: userProfile?.company_id || null,
        isExisting: false
      });
      toast({
        title: "New Product",
        description: "Product not found in inventory. Please enter details manually."
      });
    } catch (error) {
      console.error('Lookup error:', error);
      toast({
        title: "Lookup Failed",
        description: "Error looking up product.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualLookup = () => {
    if (manualBarcode.trim()) {
      lookupBarcode(manualBarcode.trim());
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };


  const addToInventory = async () => {
    if (!scannedData || !scannedData.name) {
      toast({
        title: "Error",
        description: "Please provide a product name",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      let data;
      
      // Validate image if provided
      if (imageFile) {
        const validation = validateImageFile(imageFile);
        if (!validation.valid) {
          toast({
            title: "Error",
            description: validation.error || "Invalid image file",
            variant: "destructive"
          });
          setIsLoading(false);
          return;
        }
      }
      
      // Check if this is an existing item (UPDATE) or new item (INSERT)
      if (scannedData.isExisting && scannedData.id) {
        // UPDATE existing item - only update quantity
        const { data: updatedData, error } = await supabase
          .from('inventory_items')
          .update({
            quantity: parseInt(scannedData.quantity) || 0,
            updated_at: new Date().toISOString()
          })
          .eq('id', scannedData.id)
          .select()
          .single();

        if (error) throw error;
        data = updatedData;

        toast({
          title: "Quantity Updated",
          description: `${data.name} quantity updated to ${data.quantity}.`
        });
      } else {
        // INSERT new item
        const itemData = {
          name: scannedData.name,
          description: scannedData.description || '',
          category_id: scannedData.category_id || null,
          quantity: parseInt(scannedData.quantity) || 1,
          unit_price: parseFloat(scannedData.unit_price) || 0,
          barcode: scannedData.barcode,
          location: scannedData.location || '',
          min_quantity: parseInt(scannedData.min_quantity) || 5,
          supplier: scannedData.supplier || '',
          company_id: scannedData.company_id || userProfile?.company_id || null
        };

        const { data: insertedData, error } = await supabase
          .from('inventory_items')
          .insert([itemData])
          .select()
          .single();

        if (error) throw error;
        data = insertedData;

        // Upload image if provided
        let imageUrl = null;
        if (imageFile) {
          imageUrl = await uploadItemImage(imageFile, data.id);
          if (imageUrl) {
            // Update item with image URL
            await supabase
              .from('inventory_items')
              .update({ image_url: imageUrl })
              .eq('id', data.id);
            
            // Update local data object
            data.image_url = imageUrl;
          }
        }

        toast({
          title: "Item Added",
          description: `${data.name} has been added to inventory.`
        });
      }

      // Also add/update context for immediate UI update
      const contextItem = {
        id: data.id,
        name: data.name,
        description: data.description || '',
        categoryId: data.category_id || '1',
        quantity: data.quantity,
        minQuantity: data.min_quantity || 0,
        price: data.unit_price || 0,
        barcode: data.barcode,
        location: data.location || '',
        image_url: data.image_url || '',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      addItem(contextItem);
      onItemAdded?.(contextItem);
      setScannedData(null);
      setManualBarcode('');
      setImageFile(null);
      setImagePreview('');
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add item to inventory",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Start scanning when component mounts or when isScanning becomes true
  useEffect(() => {
    if (isScanning && canUseScanner) {
      startScanning();
    }
    
    return () => {
      stopScanning();
    };
  }, [isScanning, canUseScanner]);

  if (!canUseScanner) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scan className="h-5 w-5" />
            Barcode Scanner
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-gray-600">You don't have permission to modify inventory.</p>
            <p className="text-sm text-gray-500 mt-2">Only admins and technicians can add items.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scan className="h-5 w-5" />
          Barcode Scanner
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Barcode Scanner</Label>
          <div className="aspect-square bg-black rounded-lg overflow-hidden relative">
            {isScanning && !hasError && (
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                autoPlay
                playsInline
              />
            )}

            {hasError && (
              <div className="flex flex-col items-center justify-center h-full space-y-4 p-8 text-white">
                <XCircle className="w-12 h-12 text-red-500" />
                <h3 className="text-lg font-semibold">Camera Access Required</h3>
                <p className="text-sm text-gray-300 text-center">
                  Please allow camera access to scan product barcodes
                </p>
                <Button onClick={resetScanner} variant="outline">
                  Try Again
                </Button>
              </div>
            )}

            {!isScanning && scannedBarcode && (
              <div className="flex flex-col items-center justify-center h-full space-y-4 p-8 text-white">
                <div className="text-center">
                  <h3 className="text-xl font-semibold mb-2">Barcode Scanned!</h3>
                  <p className="text-sm text-gray-300 mb-4">Scanned Code:</p>
                  <div className="bg-gray-800 p-4 rounded-lg max-w-full">
                    <p className="text-sm break-all text-green-400 font-mono">
                      {scannedBarcode}
                    </p>
                  </div>
                </div>
                <Button onClick={resetScanner} className="w-full">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Scan Another
                </Button>
              </div>
            )}

            {!isScanning && !scannedBarcode && !hasError && (
              <div className="flex flex-col items-center justify-center h-full space-y-4 p-8 text-white">
                <Scan className="w-16 h-16 text-gray-400" />
                <h3 className="text-lg font-semibold">Ready to Scan</h3>
                <p className="text-sm text-gray-300 text-center">
                  Point your camera at a product barcode (UPC, EAN, Code 128, etc.)
                </p>
                <p className="text-xs text-gray-400 text-center">
                  QR codes are not supported
                </p>
                <Button onClick={resetScanner}>
                  Start Scanning
                </Button>
              </div>
            )}
          </div>
        </div>


        <div className="space-y-2">
          <Label htmlFor="manual-barcode">Manual Barcode Entry</Label>
          <div className="flex gap-2">
            <Input
              id="manual-barcode"
              value={manualBarcode}
              onChange={(e) => setManualBarcode(e.target.value)}
              placeholder="Enter barcode manually"
              onKeyPress={(e) => e.key === 'Enter' && handleManualLookup()}
            />
            <Button 
              onClick={handleManualLookup} 
              disabled={!manualBarcode.trim() || isLoading}
            >
              <Scan className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Scanned Data Display */}
        {scannedData && (
          <div className="space-y-3 p-4 bg-gray-50 rounded-lg border-2 border-blue-200">
            <h4 className="font-semibold text-lg">
              {scannedData.isExisting ? 'Product Found!' : 'New Product - Enter Details'}
            </h4>
            
            <div className="space-y-2">
              <div>
                <Label>Barcode</Label>
                <Input value={scannedData.barcode} disabled className="bg-gray-200" />
              </div>

              <div>
                <Label>Product Name *</Label>
                <Input 
                  value={scannedData.name} 
                  onChange={(e) => setScannedData({...scannedData, name: e.target.value})}
                  placeholder="Enter product name"
                  disabled={scannedData.isExisting}
                  className={scannedData.isExisting ? 'bg-gray-200' : ''}
                />
              </div>

              <div>
                <Label>Category *</Label>
                {scannedData.isExisting ? (
                  <Input 
                    value={categories.find(c => c.id === scannedData.category_id)?.name || 'N/A'} 
                    disabled
                    className="bg-gray-200"
                  />
                ) : (
                  <Select
                    value={scannedData.category_id}
                    onValueChange={(value) => setScannedData({...scannedData, category_id: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div>
                <Label>Description</Label>
                <Input 
                  value={scannedData.description || ''} 
                  onChange={(e) => setScannedData({...scannedData, description: e.target.value})}
                  placeholder="Enter description (optional)"
                  disabled={scannedData.isExisting}
                  className={scannedData.isExisting ? 'bg-gray-200' : ''}
                />
              </div>

              <div>
                <Label>Location</Label>
                <Input 
                  value={scannedData.location || ''} 
                  onChange={(e) => setScannedData({...scannedData, location: e.target.value})}
                  placeholder="Enter location (optional)"
                  disabled={scannedData.isExisting}
                  className={scannedData.isExisting ? 'bg-gray-200' : ''}
                />
              </div>

              <div>
                <Label>Unit Price</Label>
                <Input 
                  type="number"
                  step="0.01"
                  value={scannedData.unit_price} 
                  onChange={(e) => setScannedData({...scannedData, unit_price: e.target.value})}
                  placeholder="0.00"
                  disabled={scannedData.isExisting}
                  className={scannedData.isExisting ? 'bg-gray-200' : ''}
                />
              </div>

              <div>
                <Label>Quantity {scannedData.isExisting && '(Editable)'}</Label>
                <Input 
                  type="number"
                  value={scannedData.quantity} 
                  onChange={(e) => setScannedData({...scannedData, quantity: e.target.value})}
                  placeholder="1"
                  className="bg-white"
                />
              </div>

              <div>
                <Label>Minimum Quantity</Label>
                <Input 
                  type="number"
                  value={scannedData.min_quantity} 
                  onChange={(e) => setScannedData({...scannedData, min_quantity: e.target.value})}
                  placeholder="5"
                  disabled={scannedData.isExisting}
                  className={scannedData.isExisting ? 'bg-gray-200' : ''}
                />
              </div>

              <div>
                <Label>Supplier</Label>
                <Input 
                  value={scannedData.supplier || ''} 
                  onChange={(e) => setScannedData({...scannedData, supplier: e.target.value})}
                  placeholder="Enter supplier name (optional)"
                  disabled={scannedData.isExisting}
                  className={scannedData.isExisting ? 'bg-gray-200' : ''}
                />
              </div>

              {!scannedData.isExisting && (
                <div>
                  <Label>Product Image</Label>
                  <div className="space-y-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {imageFile ? 'Change Image' : 'Upload Image'}
                    </Button>
                    {imagePreview && (
                      <div className="relative w-full h-32 border rounded-lg overflow-hidden">
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {scannedData.isExisting && scannedData.image_url && (
                <div>
                  <Label>Product Image</Label>
                  <div className="relative w-full h-32 border rounded-lg overflow-hidden bg-gray-100">
                    <img
                      src={scannedData.image_url}
                      alt={scannedData.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              )}
            </div>

            <Button onClick={addToInventory} className="w-full mt-2" disabled={!scannedData.name}>
              <Plus className="h-4 w-4 mr-2" />
              {scannedData.isExisting ? 'Update Quantity' : 'Add to Inventory'}
            </Button>
          </div>
        )}

        {isLoading && (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-sm text-gray-600">Looking up product...</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};