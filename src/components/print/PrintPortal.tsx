import React from 'react';
import { createPortal } from 'react-dom';

/**
 * Printing works by rendering the document into a <div class="print-root"> directly
 * under <body>. While it exists, the print stylesheet (index.css) hides everything
 * else — sidebar, header, banners, dialogs — so only the document is printed.
 */

const cssString = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;

interface PrintPortalProps {
  landscape?: boolean;
  /** Small running header printed at the top of every page. */
  runningHeader?: string;
  runningHeaderRight?: string;
  children: React.ReactNode;
}

export const PrintPortal: React.FC<PrintPortalProps> = ({ landscape, runningHeader = '', runningHeaderRight = '', children }) => {
  const pageCss = `
@page {
  size: ${landscape ? 'landscape' : 'portrait'};
  margin: 14mm 12mm 14mm 12mm;
  @top-left { content: ${cssString(runningHeader)}; font: 8pt Arial, sans-serif; color: #000; }
  @top-right { content: ${cssString(runningHeaderRight)}; font: 8pt Arial, sans-serif; color: #000; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt Arial, sans-serif; color: #000; }
}`;
  return createPortal(
    <div className="print-root">
      <style>{pageCss}</style>
      {children}
    </div>,
    document.body,
  );
};
