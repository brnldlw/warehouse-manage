import React, { useEffect, useRef, useState } from 'react';
import { BarcodeFormat, BrowserMultiFormatReader, DecodeHintType, NotFoundException } from '@zxing/library';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const FORMATS = [
  BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93,
  BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.ITF, BarcodeFormat.CODABAR,
];

/**
 * Camera scanner (same @zxing library as the Barcode Scanner page) that reads QR codes and
 * barcodes and hands back the text. Prefers the back camera on phones and tablets.
 */
export const CameraScanDialog: React.FC<{ open: boolean; onClose: () => void; onDetected: (text: string) => void }> = ({ open, onClose, onDetected }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  useEffect(() => {
    if (!open) return;
    setError(null);
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS);
    const reader = new BrowserMultiFormatReader(hints);
    let stopped = false;

    // Wait a tick so the dialog's <video> exists.
    const start = window.setTimeout(async () => {
      try {
        const devices = await reader.listVideoInputDevices();
        if (!devices.length) throw new Error('No camera found on this device.');
        const back = devices.find((d) => /back|rear|environment/i.test(d.label)) ?? devices[devices.length - 1];
        await reader.decodeFromVideoDevice(back.deviceId, videoRef.current, (result, err) => {
          if (stopped) return;
          if (result) {
            stopped = true;
            reader.reset();
            onDetectedRef.current(result.getText().trim());
          } else if (err && !(err instanceof NotFoundException)) {
            console.error('Scan error', err);
          }
        });
      } catch (err) {
        setError(err instanceof Error && err.name === 'NotAllowedError'
          ? 'Camera permission was refused. Allow camera access for this site, then try again.'
          : `Couldn't start the camera: ${err instanceof Error ? err.message : String(err)}`);
      }
    }, 50);

    return () => { stopped = true; window.clearTimeout(start); reader.reset(); };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Scan a code</DialogTitle>
          <DialogDescription className="text-base text-gray-700">Point the camera at the QR code or barcode.</DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="rounded-md border-2 border-red-700 bg-red-50 p-3 text-base text-red-900">{error}</p>
        ) : (
          <div className="mx-auto aspect-square w-full max-w-[55vh] overflow-hidden rounded-lg bg-black">
            <video ref={videoRef} className="h-full w-full object-cover" autoPlay playsInline muted />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" className="h-14 text-base border-2 border-gray-800" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
