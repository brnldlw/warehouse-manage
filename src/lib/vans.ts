// Creating vans (the `trucks` table) with plain-English errors.

import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import { TruckInfo } from '@/lib/inventoryReport';

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** This company's vans, sorted, each with the names of the techs assigned to it now. */
export async function loadVans(companyId: string): Promise<(TruckInfo & { techs: string[] })[]> {
  const [trucks, assignments, people] = await Promise.all([
    fetchAll(() => supabase.from('trucks').select('id, name, identifier').eq('company_id', companyId).order('name').order('id')),
    fetchAll(() => supabase.from('user_truck_assignments').select('user_id, truck_id').eq('company_id', companyId).order('id'))
      .catch(() => []),
    fetchAll(() => supabase.from('user_profiles').select('id, first_name, last_name, email, is_active, status').eq('company_id', companyId).order('id'))
      .catch(() => []),
  ]);
  const nameById = new Map(people
    .filter((p) => p.is_active !== false && p.status !== 'inactive')
    .map((p) => [p.id as string, [p.first_name, p.last_name].filter(Boolean).join(' ') || (p.email as string) || 'Unnamed']));
  return trucks.map((t) => ({
    id: t.id, name: t.name, identifier: t.identifier ?? '',
    techs: assignments.filter((a) => a.truck_id === t.id).map((a) => nameById.get(a.user_id as string)).filter(Boolean) as string[],
  }));
}

export type CreateVanResult = { van: TruckInfo; error?: undefined } | { van?: undefined; error: string };

/**
 * Add a van to this company. Checks your own vans for the same identifier first (and names
 * the van that has it). Van identifiers are currently unique across ALL companies in the app
 * (a database rule), so a clash with another company gets its own explanation.
 */
export async function createVan(companyId: string, userId: string | undefined, rawName: string, rawIdentifier: string): Promise<CreateVanResult> {
  const name = rawName.trim().replace(/\s+/g, ' ');
  const identifier = rawIdentifier.trim().replace(/\s+/g, ' ');
  if (!name) return { error: 'Give the van a name, e.g. "Van 12".' };
  if (!identifier) return { error: 'Enter the plate or another identifier for the van.' };

  const { data: mine, error: checkError } = await supabase
    .from('trucks').select('id, name').eq('company_id', companyId).ilike('identifier', escapeLike(identifier)).limit(1);
  if (checkError) return { error: `Couldn't check existing vans: ${checkError.message}` };
  if (mine?.length) return { error: `Your company already has a van with identifier "${identifier}": ${mine[0].name}.` };

  const { data, error } = await supabase
    .from('trucks').insert({ name, identifier, company_id: companyId }).select('id, name, identifier').maybeSingle();
  if (error) {
    if (error.code === '23505') {
      return {
        error: `The identifier "${identifier}" is already used by a van in another company. Right now van identifiers must be unique across the whole app (not just your company), so add something to make it unique — for example "${identifier}-2".`,
      };
    }
    if (error.code === '42501') return { error: "You don't have permission to add vans." };
    return { error: `Couldn't create the van: ${error.message}` };
  }
  if (!data) return { error: "The van wasn't saved. You may not have permission to add vans." };

  await supabase.from('activity_logs').insert({
    company_id: companyId, user_id: userId, action: 'van_added', truck_id: data.id,
    details: { truck_name: data.name, identifier: data.identifier },
  });
  return { van: { id: data.id, name: data.name, identifier: data.identifier ?? '' } };
}
