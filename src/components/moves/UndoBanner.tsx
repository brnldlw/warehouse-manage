import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2, Undo2 } from 'lucide-react';
import { MoveResult, UndoResult, describeMove } from '@/lib/toolMoves';

const SECONDS = 30;

/**
 * Success message with an Undo button for 30 seconds after a bulk move. Shown on the page
 * itself (not a pop-up), so another message can't push it away.
 */
export const UndoBanner: React.FC<{
  move: MoveResult;
  onUndo: () => Promise<UndoResult>;
  onDismiss: () => void;
}> = ({ move, onUndo, onDismiss }) => {
  const [left, setLeft] = useState(SECONDS);
  const [state, setState] = useState<'ready' | 'undoing' | 'undone' | 'failed'>('ready');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setLeft(SECONDS);
    setState('ready');
    const t = window.setInterval(() => setLeft((s) => s - 1), 1000);
    return () => window.clearInterval(t);
  }, [move.batchId]);

  useEffect(() => {
    if (left <= 0 && state === 'ready') onDismiss();
    if (state === 'undone' && left <= SECONDS - 8) onDismiss(); // leave the "undone" note up briefly
  }, [left, state, onDismiss]);

  const undo = async () => {
    setState('undoing');
    try {
      const r = await onUndo();
      if (r.failed.length) {
        setState('failed');
        setMessage(`Put ${r.restored} back, but ${r.failed.length} couldn't be: ${r.failed.map((f) => `${f.name} (${f.reason})`).join('; ')}`);
      } else {
        setState('undone');
        setLeft(SECONDS);
        setMessage(`Undone: ${r.restored} tool${r.restored === 1 ? ' is' : 's are'} back where ${r.restored === 1 ? 'it was' : 'they were'}.`);
      }
    } catch (err) {
      setState('failed');
      setMessage(`Undo failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const ok = state !== 'failed';
  return (
    <div role="status" className={`flex flex-col gap-3 rounded-md border-2 p-3 sm:flex-row sm:items-center sm:justify-between ${ok ? 'border-green-700 bg-green-50 text-green-950' : 'border-red-700 bg-red-50 text-red-950'}`}>
      <span className="flex items-start gap-2 text-base">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
        {state === 'ready' || state === 'undoing' ? `${describeMove(move)}.` : message}
        {move.skipped.length > 0 && state === 'ready' && ` (${move.skipped.length} already there.)`}
      </span>
      {(state === 'ready' || state === 'undoing') && (
        <Button variant="outline" className="h-14 shrink-0 border-2 border-gray-800 bg-white" onClick={undo} disabled={state === 'undoing'}>
          {state === 'undoing' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Undo2 className="mr-2 h-4 w-4" />}
          Undo ({Math.max(0, left)}s)
        </Button>
      )}
      {state === 'failed' && <Button variant="outline" className="h-14 shrink-0 border-2" onClick={onDismiss}>Close</Button>}
    </div>
  );
};
