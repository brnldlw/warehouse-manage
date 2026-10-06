import React from 'react';
import { findColor } from '@/lib/toolColor';

/** A small colored dot for a tool's color (nothing when the tool has no color). */
export const ColorDot: React.FC<{ color: string | null | undefined; className?: string }> = ({ color, className = '' }) => {
  const c = findColor(color);
  if (!c) return null;
  return (
    <span
      role="img"
      aria-label={`Color: ${c.label}`}
      title={c.label}
      className={`inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-gray-500 align-middle ${className}`}
      style={{ backgroundColor: c.hex }}
    />
  );
};
