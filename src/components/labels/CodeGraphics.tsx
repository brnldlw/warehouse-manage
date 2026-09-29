import React, { useEffect, useMemo, useRef } from 'react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';

/** Crisp QR code as SVG, built synchronously (prints sharply at any size). */
export const QrSvg: React.FC<{ value: string; size: string; className?: string }> = ({ value, size, className }) => {
  const { n, path } = useMemo(() => {
    const qr = QRCode.create(value || ' ', { errorCorrectionLevel: 'M' });
    const count: number = qr.modules.size;
    const data: ArrayLike<number> = qr.modules.data;
    let d = '';
    for (let y = 0; y < count; y++) {
      for (let x = 0; x < count; x++) if (data[y * count + x]) d += `M${x} ${y}h1v1h-1z`;
    }
    return { n: count, path: d };
  }, [value]);
  return (
    <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} shapeRendering="crispEdges" style={{ width: size, height: size }}
      className={className} role="img" aria-label={`QR code ${value}`}>
      <rect x={-2} y={-2} width={n + 4} height={n + 4} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
};

/** Code 128 linear barcode as SVG. */
export const LinearBarcodeSvg: React.FC<{ value: string; height?: number; className?: string }> = ({ value, height = 60, className }) => {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, { format: 'CODE128', height, displayValue: false, margin: 4, background: '#ffffff' });
    } catch (err) {
      console.error('Barcode render failed', err);
    }
  }, [value, height]);
  return <svg ref={ref} className={className} role="img" aria-label={`Barcode ${value}`} />;
};
