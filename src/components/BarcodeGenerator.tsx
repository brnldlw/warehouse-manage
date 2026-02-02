import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QrCode, Download, Printer } from 'lucide-react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';

interface BarcodeGeneratorProps {
  onBarcodeGenerated?: (barcode: string) => void;
}

export const BarcodeGenerator: React.FC<BarcodeGeneratorProps> = ({ onBarcodeGenerated }) => {
  const [barcodeData, setBarcodeData] = useState('');
  const [barcodeType, setBarcodeType] = useState('qr');
  const [generatedBarcode, setGeneratedBarcode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Initialize canvas when it's rendered
  useEffect(() => {
    if (!generatedBarcode) return; // Only initialize when we have data to show

    console.log('Canvas initialization');
    const canvas = canvasRef.current;
    if (!canvas) {
      console.error('Canvas ref not available');
      return;
    }

    // Set canvas dimensions
    canvas.width = 300;
    canvas.height = 150;

    // Get context and initialize
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('Could not get canvas context');
      return;
    }

    // Clear canvas with white background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    console.log('Canvas initialized successfully');
    
    // Generate the barcode immediately after canvas is ready
    generateBarcode();
  }, [generatedBarcode]); // Re-run when generatedBarcode changes

  const generateBarcode = async () => {
    console.log('Generating barcode...');
    const canvas = canvasRef.current;
    if (!canvas) {
      console.error('Canvas not available in generateBarcode');
      return;
    }

    setIsLoading(true);
    try {
      console.log('Barcode type:', barcodeType);
      console.log('Barcode data:', barcodeData);

      if (barcodeType === 'qr') {
        // Generate QR Code
        await QRCode.toCanvas(canvas, barcodeData, {
          width: 300,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        });

        // Add text below QR code
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.font = '14px Arial';
          ctx.textAlign = 'center';
          ctx.fillStyle = 'black';
          ctx.fillText(barcodeData, canvas.width / 2, canvas.height - 10);
        }
      } else {
        // Generate Linear Barcode
        JsBarcode(canvas, barcodeData, {
          format: "CODE128",
          width: 2,
          height: 100,
          displayValue: true,
          fontSize: 14,
          margin: 10,
          background: '#ffffff',
        });
      }

      console.log('Barcode generated successfully');
      onBarcodeGenerated?.(barcodeData);
    } catch (error) {
      console.error('Error generating barcode:', error);
      alert('Failed to generate barcode. Please try again.');
      setGeneratedBarcode(''); // Clear the generated barcode on error
    } finally {
      setIsLoading(false);
    }
  };

  const downloadBarcode = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `barcode-${generatedBarcode}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  const printBarcode = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Print Barcode</title>
          <style>
            body { margin: 0; padding: 20px; text-align: center; }
            img { max-width: 100%; }
          </style>
        </head>
        <body>
          <h3>Barcode: ${generatedBarcode}</h3>
          <img src="${canvas.toDataURL()}" alt="Barcode" />
          <script>window.print(); window.close();</script>
        </body>
      </html>
    `);
  };

  const generateRandomBarcode = () => {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    setBarcodeData(`${timestamp.slice(-8)}${random}`);
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="h-5 w-5" />
          Barcode Generator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="barcode-type">Barcode Type</Label>
          <Select value={barcodeType} onValueChange={setBarcodeType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="qr">QR Code</SelectItem>
              <SelectItem value="linear">Linear Barcode</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="barcode-data">Barcode Data</Label>
          <div className="flex gap-2">
            <Input
              id="barcode-data"
              value={barcodeData}
              onChange={(e) => setBarcodeData(e.target.value)}
              placeholder="Enter data to encode"
            />
            <Button
              type="button"
              variant="outline"
              onClick={generateRandomBarcode}
              size="sm"
            >
              Random
            </Button>
          </div>
        </div>

        <Button 
          onClick={() => {
            console.log('Button clicked');
            console.log('Current data:', barcodeData);
            console.log('Current type:', barcodeType);
            try {
              // Just set the generatedBarcode state, which will trigger the useEffect
              setGeneratedBarcode(barcodeData);
            } catch (error) {
              console.error('Error in button click:', error);
              alert('Error generating barcode. Check console for details.');
            }
          }} 
          disabled={!barcodeData.trim() || isLoading}
          className="w-full"
          type="button"
        >
          {isLoading ? 'Generating...' : 'Generate Barcode'}
        </Button>

        {generatedBarcode && (
          <div className="space-y-3">
            <div className="border rounded-lg p-4 bg-white">
              <canvas
                ref={canvasRef}
                className="w-full h-auto border"
                style={{ maxWidth: '100%', minHeight: '150px' }}
                id="barcodeCanvas"
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={downloadBarcode} variant="outline" className="flex-1">
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Button onClick={printBarcode} variant="outline" className="flex-1">
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};