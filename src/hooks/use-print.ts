import { useCallback, useEffect, useState } from 'react';

/**
 * Print a <PrintPortal>: call print(), render the portal while `printing` is true.
 * The portal is mounted, the browser's print dialog opens, and it unmounts afterwards.
 */
export function usePrint() {
  const [active, setActive] = useState(false);
  const [job, setJob] = useState(0);

  useEffect(() => {
    const done = () => setActive(false);
    window.addEventListener('afterprint', done);
    return () => window.removeEventListener('afterprint', done);
  }, []);

  useEffect(() => {
    if (!job) return;
    // Give React a moment to commit the portal before the browser snapshots the page.
    const t = window.setTimeout(() => window.print(), 100);
    return () => window.clearTimeout(t);
  }, [job]);

  const print = useCallback(() => {
    setActive(true);
    setJob((j) => j + 1);
  }, []);

  return { printing: active, print };
}
