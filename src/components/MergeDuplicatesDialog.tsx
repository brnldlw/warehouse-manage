import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Image as ImageIcon, Loader2, Merge, Undo2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { FormAlert } from '@/components/auth/FormAlert';
import { SearchBox } from '@/components/SearchBox';
import { matchesSearch } from '@/lib/search';
import {
  LastMerge, MergeableTool, ToolGroup, applyMerge, buildToolGroups, findUndoableMerge, planMerge, suggestDuplicates, undoMerge,
} from '@/lib/toolMerge';

interface Props {
  open: boolean;
  onClose: () => void;
  tools: MergeableTool[];
  categories: { id: string; name: string }[];
  companyId?: string;
  userId?: string;
  /** Reload the inventory after a merge or undo. */
  onChanged: () => Promise<void> | void;
}

const where = (g: ToolGroup) => {
  const counts = new Map<string, number>();
  for (const t of g.tools) {
    const place = t.locationType === 'truck' ? t.assignedTruckName || 'Van' : 'Warehouse';
    counts.set(place, (counts.get(place) ?? 0) + 1);
  }
  return [...counts].map(([place, n]) => `${place} ${n}`).join(', ');
};

const OptionButton: React.FC<{ selected: boolean; onClick: () => void; children: React.ReactNode }> = ({ selected, onClick, children }) => (
  <button type="button" onClick={onClick}
    className={`min-h-[52px] rounded-md border-2 px-3 py-2 text-left text-base ${selected ? 'border-blue-700 bg-blue-50 font-semibold' : 'border-gray-300 bg-white'}`}>
    {children}
  </button>
);

export const MergeDuplicatesDialog: React.FC<Props> = ({ open, onClose, tools, categories, companyId, userId, onChanged }) => {
  const { toast } = useToast();
  const [view, setView] = useState<'suggested' | 'all'>('suggested');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [step, setStep] = useState<'pick' | 'preview'>('pick');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastMerge, setLastMerge] = useState<LastMerge | null>(null);

  const groups = useMemo(() => buildToolGroups(tools), [tools]);
  const suggestions = useMemo(() => suggestDuplicates(groups), [groups]);
  const byId = useMemo(() => new Map(groups.map((g) => [g.groupId, g])), [groups]);
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? 'Uncategorized';
  const picked = [...selected].map((id) => byId.get(id)).filter(Boolean) as ToolGroup[];
  const pickedTools = picked.reduce((n, g) => n + g.tools.length, 0);

  const refreshUndo = async () => {
    if (!companyId) return;
    try { setLastMerge(await findUndoableMerge(companyId)); } catch (err) { console.error(err); }
  };
  useEffect(() => {
    if (open) { refreshUndo(); setStep('pick'); setSelected(new Set()); setError(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (ids: string[], on: boolean) => setSelected((s) => {
    const n = new Set(s);
    ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
    return n;
  });

  const goPreview = () => {
    const biggest = [...picked].sort((a, b) => b.tools.length - a.tools.length)[0];
    setName(biggest.name.trim().replace(/\s+/g, ' '));
    setCategoryId(biggest.categoryId);
    setImageUrl(picked.find((g) => g.imageUrl)?.imageUrl ?? null);
    setError(null);
    setStep('preview');
  };

  const doMerge = async () => {
    if (!companyId) return;
    if (!name.trim()) { setError('Give the merged tool a name.'); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await applyMerge(companyId, userId, planMerge(picked, { name, categoryId, imageUrl }));
      await onChanged();
      await refreshUndo();
      setSelected(new Set());
      setStep('pick');
      if (r.changed < r.expected) {
        setError(`Only ${r.changed} of ${r.expected} tools could be changed (you may not have permission for some). Use Undo to put things back.`);
      } else {
        toast({ title: 'Merged', description: `${r.changed} tools now group together as "${name.trim()}".` });
      }
    } catch (err) {
      setError(`Merge stopped: ${err instanceof Error ? err.message : String(err)}. Use Undo if some tools were changed.`);
      await onChanged();
      await refreshUndo();
    } finally {
      setBusy(false);
    }
  };

  const doUndo = async () => {
    if (!companyId || !lastMerge) return;
    setBusy(true);
    setError(null);
    try {
      const n = await undoMerge(companyId, userId, lastMerge);
      await onChanged();
      toast({ title: 'Merge undone', description: `${n} tools are back to how they were.` });
      await refreshUndo();
    } catch (err) {
      setError(`Undo failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  // Names that only differ by spacing look identical, so offer each spelling once.
  const names = [...new Set(picked.map((g) => g.name.trim().replace(/\s+/g, ' ')))];
  const cats = [...new Set(picked.map((g) => g.categoryId))];
  const photos = [...new Set(picked.map((g) => g.imageUrl).filter(Boolean))] as string[];
  const allShown = groups.filter((g) => matchesSearch(search, g.name, catName(g.categoryId)))
    .sort((a, b) => a.name.localeCompare(b.name));

  const GroupRow: React.FC<{ g: ToolGroup }> = ({ g }) => (
    <label className="flex items-center gap-3 px-3 min-h-[56px] cursor-pointer hover:bg-gray-50">
      <Checkbox className="h-6 w-6" checked={selected.has(g.groupId)} onCheckedChange={(v) => toggle([g.groupId], v === true)} />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{g.name} <span className="font-normal text-gray-700">× {g.tools.length}</span></span>
        <span className="block text-sm text-gray-700">{catName(g.categoryId)} · {where(g)}</span>
      </span>
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl"><Merge className="h-5 w-5" /> Merge duplicates</DialogTitle>
          <DialogDescription className="text-base text-gray-700">
            Makes tools that are really the same thing show as one group. Nothing is deleted: every tool keeps its own
            serial number, barcode, location, condition and history. Only the group, name, category and photo change.
          </DialogDescription>
        </DialogHeader>

        {lastMerge && step === 'pick' && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border-2 border-gray-300 bg-gray-50 p-3">
            <span className="text-base">
              Last merge: <strong>"{lastMerge.name}"</strong> — {lastMerge.groupCount} groups, {lastMerge.toolCount} tools, {new Date(lastMerge.at).toLocaleString()}
            </span>
            <Button variant="outline" className="h-12 border-2 border-gray-800 shrink-0" onClick={doUndo} disabled={busy}>
              <Undo2 className="h-4 w-4 mr-2" /> Undo last merge
            </Button>
          </div>
        )}
        <FormAlert error={error} />

        {step === 'pick' ? (
          <div className="space-y-4">
            <div className="flex rounded-md border-2 border-gray-800 overflow-hidden w-fit" role="tablist">
              {(['suggested', 'all'] as const).map((v) => (
                <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
                  className={`h-12 px-4 text-base font-medium ${view === v ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}>
                  {v === 'suggested' ? `Suggested (${suggestions.length})` : `Pick by hand (${groups.length})`}
                </button>
              ))}
            </div>

            {view === 'suggested' ? (
              suggestions.length === 0 ? (
                <p className="text-base text-gray-700">No likely duplicates found (same name ignoring capitals and spaces, same category). Use "Pick by hand" for others.</p>
              ) : (
                <div className="space-y-3">
                  {suggestions.map((set) => {
                    const ids = set.map((g) => g.groupId);
                    const all = ids.every((id) => selected.has(id));
                    return (
                      <div key={ids.join()} className="rounded-md border">
                        <label className="flex items-center gap-3 border-b bg-gray-50 px-3 min-h-[52px] cursor-pointer font-semibold">
                          <Checkbox className="h-6 w-6" checked={all} onCheckedChange={(v) => toggle(ids, v === true)} />
                          {set[0].name} — {set.length} groups, {set.reduce((n, g) => n + g.tools.length, 0)} tools
                        </label>
                        <div className="divide-y">{set.map((g) => <GroupRow key={g.groupId} g={g} />)}</div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="space-y-2">
                <SearchBox value={search} onChange={setSearch} placeholder="Search groups by name or category…" shown={allShown.length} total={groups.length} noun="groups" />
                <div className="rounded-md border divide-y">
                  {allShown.map((g) => <GroupRow key={g.groupId} g={g} />)}
                </div>
              </div>
            )}

            <DialogFooter className="sm:items-center sm:justify-between">
              <span className="text-base">{picked.length} groups, {pickedTools} tools selected</span>
              <Button className="h-14 px-6 text-base font-semibold bg-blue-700 hover:bg-blue-800 text-white" onClick={goPreview} disabled={picked.length < 2}>
                Preview merge
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <h4 className="mb-2 font-semibold">Merging these {picked.length} groups:</h4>
              <ul className="space-y-1 text-base">
                {picked.map((g) => <li key={g.groupId}>• {g.name} × {g.tools.length} <span className="text-gray-700">({catName(g.categoryId)} · {where(g)})</span></li>)}
              </ul>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold">Name to keep</h4>
              <div className="flex flex-wrap gap-2">
                {names.map((n) => <OptionButton key={n} selected={name === n} onClick={() => setName(n)}>{n}</OptionButton>)}
              </div>
              <Input className="h-12 text-base" value={name} onChange={(e) => setName(e.target.value)} aria-label="Merged name" />
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold">Category to keep</h4>
              <div className="flex flex-wrap gap-2">
                {cats.map((c) => <OptionButton key={c ?? 'none'} selected={categoryId === c} onClick={() => setCategoryId(c)}>{catName(c)}</OptionButton>)}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold">Photo to keep</h4>
              <div className="flex flex-wrap gap-2">
                {photos.map((p) => (
                  <OptionButton key={p} selected={imageUrl === p} onClick={() => setImageUrl(p)}>
                    <img src={p} alt="" className="h-16 w-16 rounded object-cover" />
                  </OptionButton>
                ))}
                <OptionButton selected={imageUrl === null} onClick={() => setImageUrl(null)}>
                  <span className="flex h-16 w-16 flex-col items-center justify-center text-sm text-gray-700"><ImageIcon className="h-5 w-5" />No photo</span>
                </OptionButton>
              </div>
            </div>

            <p className="rounded-md bg-blue-50 p-3 text-base">
              After merging: <strong>{name.trim() || '—'}</strong> × <strong>{pickedTools}</strong> in {catName(categoryId)}.
              Tools stay where they are; you'll see one line per location on Manage Parts.
            </p>

            <DialogFooter>
              <Button variant="outline" className="h-14 text-base border-2 border-gray-800" onClick={() => setStep('pick')} disabled={busy}>Back</Button>
              <Button className="h-14 px-6 text-base font-semibold bg-blue-700 hover:bg-blue-800 text-white" onClick={doMerge} disabled={busy}>
                {busy ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Merge className="h-5 w-5 mr-2" />}
                Merge {picked.length} groups ({pickedTools} tools)
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
