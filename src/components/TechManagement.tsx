import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  UserCheck, Activity, Package, Clock, Truck, Wrench, ArrowRightLeft, Loader2, UserPlus, Mail,
  ChevronUp, ChevronDown, ChevronsUpDown,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { SearchBox } from '@/components/SearchBox';
import { VanToolsDialog } from '@/components/VanToolsDialog';
import { AddTechnicianDialog } from '@/components/AddTechnicianDialog';
import { DeactivateTechDialog } from '@/components/moves/DeactivateTechDialog';
import { matchesSearch } from '@/lib/search';
import { TruckInfo } from '@/lib/inventoryReport';
import { AppRole, TechSignInStatus, describeLinkLifetime, getTechSignInStatus, resendTechInvite } from '@/lib/adminTechApi';
import { RoleChangeDialog } from '@/components/RoleChangeDialog';

interface TechUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  specialty?: string;
  status: string;
  is_active?: boolean | null;
  role: AppRole;
  created_at: string;
  truck_id?: string;
  truck_name?: string;
  truck_identifier?: string;
  tool_count?: number;
}

type StatusTab = 'active' | 'inactive' | 'all';
type RoleTab = 'all' | 'admin' | 'tech';
type SortKey = 'name' | 'van' | 'status' | 'lastSignIn';

// Older profiles may have no `status`; fall back to is_active.
const isActiveTech = (t: TechUser) => (t.status ? t.status === 'active' : t.is_active !== false);
const techName = (t: TechUser) => [t.first_name, t.last_name].filter(Boolean).join(' ') || t.email;

interface TechActivity {
  id: string;
  user_id: string;
  action: string;
  item_name: string;
  details: any;
  timestamp: string;
  user_name: string;
}

export const TechManagement: React.FC = () => {
  const [techs, setTechs] = useState<TechUser[]>([]);
  const [activities, setActivities] = useState<TechActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [trucks, setTrucks] = useState<TruckInfo[]>([]);
  const [tab, setTab] = useState<StatusTab>('active');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'name', asc: true });
  const [signIn, setSignIn] = useState<Record<string, TechSignInStatus> | null>(null);
  const [signInNote, setSignInNote] = useState<string | null>(null);
  const [vanTech, setVanTech] = useState<TechUser | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<TechUser | null>(null);
  const [roleTab, setRoleTab] = useState<RoleTab>('all');
  const [roleChange, setRoleChange] = useState<{ person: TechUser; to: AppRole } | null>(null);
  const { toast } = useToast();
  const { userProfile, isAdmin } = useAuth();

  useEffect(() => {
    if (userProfile?.company_id) {
      loadPageData();
    }
  }, [userProfile?.company_id]);

  const loadPageData = async () => {
    setPageLoading(true);
    try {
      await Promise.all([fetchTechs(), fetchTechActivities(), fetchTrucks()]);
    } finally {
      setPageLoading(false);
    }
    fetchSignInStatus(); // extra detail from the server; the page works without it
  };

  const fetchTrucks = async () => {
    if (!userProfile?.company_id) return;
    try {
      const data = await fetchAll(() => supabase
        .from('trucks').select('id, name, identifier').eq('company_id', userProfile.company_id).order('name').order('id'));
      setTrucks(data.map((t) => ({ id: t.id, name: t.name, identifier: t.identifier ?? '' })));
    } catch (error) {
      console.error('Error fetching trucks:', error);
    }
  };

  // Last sign-in comes from the admin-create-tech Edge Function (only the server can see it).
  const fetchSignInStatus = async () => {
    if (!isAdmin) return;
    try {
      const statuses = await getTechSignInStatus();
      setSignIn(Object.fromEntries(statuses.map((s) => [s.id, s])));
      setSignInNote(null);
    } catch (error) {
      setSignIn(null);
      setSignInNote(error instanceof Error ? error.message : String(error));
    }
  };

  const resendInvite = async (tech: TechUser) => {
    setResendingId(tech.id);
    try {
      const r = await resendTechInvite(tech.id);
      toast({ title: 'Invite sent', description: `Sent to ${r.email}. The link works for ${describeLinkLifetime(r.inviteLinkSeconds)}.` });
      fetchSignInStatus();
    } catch (error) {
      toast({ title: 'Could not resend', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    } finally {
      setResendingId(null);
    }
  };

  const fetchTechs = async () => {
    try {
      if (!userProfile?.company_id) {
        console.warn('No company_id found for current user');
        return;
      }

      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email, first_name, last_name, phone, specialty, status, is_active, role, created_at')
        .in('role', ['tech', 'admin'])
        .eq('company_id', userProfile.company_id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get truck assignments
      const techIds = data?.map(t => t.id) || [];
      const { data: assignmentsData } = await supabase
        .from('user_truck_assignments')
        .select('user_id, truck_id, trucks:truck_id (id, name, identifier)')
        .in('user_id', techIds)
        .eq('company_id', userProfile.company_id);

      // Get tool counts per truck
      const truckIds = assignmentsData?.map(a => a.truck_id).filter(Boolean) || [];
      let toolCounts: Record<string, number> = {};
      
      if (truckIds.length > 0) {
        const toolsData: { assigned_truck_id: string }[] = await fetchAll(() => supabase
          .from('inventory_items')
          .select('assigned_truck_id')
          .eq('company_id', userProfile.company_id)
          .eq('location_type', 'truck')
          .in('assigned_truck_id', truckIds)
          .order('id'))
          .catch((err) => { console.error('Error counting van tools:', err); return []; });

        toolCounts = toolsData.reduce((acc, tool) => {
          acc[tool.assigned_truck_id] = (acc[tool.assigned_truck_id] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
      }

      // Map assignments to techs
      const assignmentMap = (assignmentsData || []).reduce((acc, a) => {
        const truck = a.trucks as any;
        acc[a.user_id] = {
          truck_id: a.truck_id,
          truck_name: truck?.name,
          truck_identifier: truck?.identifier,
          tool_count: toolCounts[a.truck_id] || 0
        };
        return acc;
      }, {} as Record<string, any>);

      const techsWithTrucks: TechUser[] = (data || []).map(tech => ({
        ...tech,
        truck_id: assignmentMap[tech.id]?.truck_id,
        truck_name: assignmentMap[tech.id]?.truck_name,
        truck_identifier: assignmentMap[tech.id]?.truck_identifier,
        tool_count: assignmentMap[tech.id]?.tool_count || 0
      }));

      setTechs(techsWithTrucks);
    } catch (error) {
      console.error('Error fetching techs:', error);
      toast({
        title: 'Error',
        description: `Failed to fetch technicians: ${error.message}`,
        variant: 'destructive',
      });
    }
  };

  const fetchTechActivities = async () => {
    try {
      if (!userProfile?.company_id) {
        console.warn('No company_id found for current user');
        return;
      }

      const { data, error } = await supabase
        .from('activity_logs')
        .select(`
          id,
          user_id,
          action,
          details,
          timestamp
        `)
        .eq('company_id', userProfile.company_id)
        .in('action', ['transferred', 'added', 'used', 'received'])
        .order('timestamp', { ascending: false })
        .limit(20);

      if (error) throw error;

      // Get user names for the activities
      const userIds = [...new Set(data?.map(a => a.user_id).filter(Boolean) || [])];
      let userMap: Record<string, string> = {};
      
      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .from('user_profiles')
          .select('id, first_name, last_name')
          .in('id', userIds);

        userMap = (usersData || []).reduce((acc, u) => {
          acc[u.id] = `${u.first_name} ${u.last_name}`;
          return acc;
        }, {} as Record<string, string>);
      }
      
      const formattedActivities = data?.map(activity => ({
        id: activity.id,
        user_id: activity.user_id,
        action: activity.action,
        item_name: activity.details?.item_name || activity.details?.tool_name || '',
        details: activity.details,
        timestamp: activity.timestamp,
        user_name: userMap[activity.user_id] || 'Unknown'
      })) || [];
      
      setActivities(formattedActivities);
    } catch (error) {
      console.error('Error fetching activities:', error);
      toast({
        title: 'Error',
        description: `Failed to fetch activities: ${error.message}`,
        variant: 'destructive',
      });
    }
  };

  // Allowed from the browser only for an active admin of the same company, on someone else
  // (database trigger, migration 005); its plain-English refusal is shown as-is.
  const setTechStatus = async (tech: TechUser, newStatus: 'active' | 'inactive') => {
    const { data, error } = await supabase
      .from('user_profiles')
      .update({ status: newStatus, is_active: newStatus === 'active' })
      .eq('id', tech.id)
      .eq('company_id', userProfile?.company_id)
      .select('id');
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("the database didn't save the change (you may not have permission).");
  };

  const toggleTechStatus = async (tech: TechUser) => {
    setLoading(true);
    // A tech with tools on their van: ask what to do with the tools first (live count, the
    // list's number may be out of date).
    if (isActiveTech(tech) && tech.truck_id) {
      const { count, error } = await supabase
        .from('inventory_items').select('id', { count: 'exact', head: true })
        .eq('company_id', userProfile?.company_id).eq('location_type', 'truck').eq('assigned_truck_id', tech.truck_id);
      if (error || (count ?? 0) > 0) {
        setLoading(false);
        setDeactivating(tech);
        return;
      }
    }
    try {
      const newStatus = isActiveTech(tech) ? 'inactive' : 'active';
      await setTechStatus(tech, newStatus);

      await fetchTechs();
      toast({
        title: 'Success',
        description: `Technician status updated to ${newStatus}`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to update technician status: ${error instanceof Error ? error.message : String(error)}`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Role filter first, then the Active / Inactive / All tabs count within it.
  const inRole = useMemo(() => techs.filter((t) => roleTab === 'all' || t.role === roleTab), [techs, roleTab]);
  const counts = {
    active: inRole.filter(isActiveTech).length,
    inactive: inRole.filter((t) => !isActiveTech(t)).length,
    all: inRole.length,
  };
  const roleCounts = { all: techs.length, admin: techs.filter((t) => t.role === 'admin').length, tech: techs.filter((t) => t.role === 'tech').length };
  const onlyTechs = techs.filter((t) => t.role === 'tech');
  const activeAdmins = techs.filter((t) => t.role === 'admin' && isActiveTech(t)).length;
  const isMe = (t: TechUser) => t.id === userProfile?.id;
  const lastSignIn = (t: TechUser) => signIn?.[t.id]?.lastSignInAt ?? null;

  const inTab = useMemo(
    () => inRole.filter((t) => tab === 'all' || (tab === 'active') === isActiveTech(t)),
    [inRole, tab],
  );
  const visibleTechs = useMemo(() => {
    const list = inTab.filter((t) =>
      matchesSearch(search, t.first_name, t.last_name, t.email, t.phone, t.truck_name, t.truck_identifier, t.specialty));
    const dir = sort.asc ? 1 : -1;
    const text = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
    return list.sort((a, b) => {
      switch (sort.key) {
        case 'van': return dir * text(a.truck_name ?? '￿', b.truck_name ?? '￿') || text(techName(a), techName(b));
        case 'status': return dir * (Number(isActiveTech(b)) - Number(isActiveTech(a))) || text(techName(a), techName(b));
        case 'lastSignIn': {
          // Never signed in sorts last either way.
          const la = lastSignIn(a), lb = lastSignIn(b);
          if (!la || !lb) return la ? -1 : lb ? 1 : text(techName(a), techName(b));
          return dir * (Date.parse(lb) - Date.parse(la));
        }
        default: return dir * text(techName(a), techName(b));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inTab, search, sort, signIn]);

  const sortBy = (key: SortKey) => setSort((s) => ({ key, asc: s.key === key ? !s.asc : true }));
  const SortHead: React.FC<{ k: SortKey; children: React.ReactNode }> = ({ k, children }) => (
    <TableHead>
      <button type="button" onClick={() => sortBy(k)} className="flex items-center gap-1 font-semibold text-gray-900 min-h-[44px]">
        {children}
        {sort.key !== k ? <ChevronsUpDown className="h-4 w-4 text-gray-500" /> : sort.asc ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
    </TableHead>
  );

  const openVan = (tech: TechUser) => {
    if (!tech.truck_id) {
      toast({ title: 'No van assigned', description: `${techName(tech)} doesn't have a van yet. Assign one on the Assignments page.` });
      return;
    }
    setVanTech(tech);
  };

  return (
    <div className="space-y-6">
      {pageLoading ? (
        <Card className="text-center py-12">
          <CardContent>
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading technicians...</p>
          </CardContent>
        </Card>
      ) : (
        <>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Techs</p>
                <p className="text-3xl font-bold text-blue-600">{onlyTechs.length}</p>
              </div>
              <UserCheck className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Techs</p>
                <p className="text-3xl font-bold text-green-600">
                  {onlyTechs.filter(isActiveTech).length}
                </p>
              </div>
              <UserCheck className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Recent Activities</p>
                <p className="text-3xl font-bold text-orange-600">{activities.length}</p>
              </div>
              <Activity className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Technicians Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5" />
              Technicians
            </CardTitle>
            {isAdmin && (
              <Button className="h-14 px-5 text-base font-semibold bg-blue-700 hover:bg-blue-800 text-white" onClick={() => setShowAdd(true)}>
                <UserPlus className="h-5 w-5 mr-2" /> Add Technician
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row md:flex-wrap md:items-start gap-3">
            <div className="flex w-full sm:w-auto rounded-md border-2 border-gray-800 overflow-hidden shrink-0" role="tablist" aria-label="Show admins or techs">
              {(['all', 'admin', 'tech'] as RoleTab[]).map((r) => (
                <button key={r} type="button" role="tab" aria-selected={roleTab === r} onClick={() => setRoleTab(r)}
                  className={`min-h-[48px] flex-1 px-2 py-1 leading-tight sm:flex-none sm:px-4 text-base font-medium ${roleTab === r ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}>
                  {r === 'all' ? 'Everyone' : r === 'admin' ? 'Admins' : 'Techs'} ({roleCounts[r]})
                </button>
              ))}
            </div>
            <div className="flex w-full sm:w-auto rounded-md border-2 border-gray-800 overflow-hidden shrink-0" role="tablist" aria-label="Show technicians">
              {(['active', 'inactive', 'all'] as StatusTab[]).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                  className={`min-h-[48px] flex-1 px-2 py-1 leading-tight sm:flex-none sm:px-4 text-base font-medium ${tab === t ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}>
                  {t === 'active' ? 'Active' : t === 'inactive' ? 'Inactive' : 'All'} ({counts[t]})
                </button>
              ))}
            </div>
            <SearchBox className="flex-1" value={search} onChange={setSearch}
              placeholder="Search name, email, phone or van…" shown={visibleTechs.length} total={inTab.length} noun="technicians" />
          </div>
          {isAdmin && signInNote && (
            <p className="text-sm text-gray-700">Last sign-in and "Resend invite" aren't available yet: {signInNote}</p>
          )}
          <p className="text-sm text-gray-700">Click a technician to see the tools on their van.</p>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead k="name">Name</SortHead>
                <TableHead>Role</TableHead>
                <TableHead>Email</TableHead>
                <SortHead k="van">Assigned Van</SortHead>
                <TableHead>Tools</TableHead>
                <SortHead k="status">Status</SortHead>
                <SortHead k="lastSignIn">Last sign-in</SortHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleTechs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-gray-700">
                    {search ? 'No one matches your search.' : `No ${tab === 'all' ? '' : tab + ' '}${roleTab === 'admin' ? 'admins' : roleTab === 'tech' ? 'techs' : 'people'}.`}
                  </TableCell>
                </TableRow>
              )}
              {visibleTechs.map((tech) => (
                <TableRow key={tech.id} className="cursor-pointer hover:bg-gray-50" onClick={() => openVan(tech)}>
                  <TableCell className="font-medium">
                    {techName(tech)}
                    {tech.phone && <span className="block text-sm font-normal text-gray-600">{tech.phone}</span>}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {isAdmin && !isMe(tech) ? (
                      <div className="flex w-max overflow-hidden rounded-md border-2 border-gray-800" role="radiogroup" aria-label={`Role for ${techName(tech)}`}>
                        {(['tech', 'admin'] as AppRole[]).map((r) => (
                          <button key={r} type="button" role="radio" aria-checked={tech.role === r}
                            onClick={() => { if (tech.role !== r) setRoleChange({ person: tech, to: r }); }}
                            className={`h-11 px-3 text-sm font-semibold ${tech.role === r ? 'bg-gray-900 text-white' : 'bg-white text-gray-900 hover:bg-gray-100'}`}>
                            {r === 'tech' ? 'Tech' : 'Admin'}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <Badge variant={tech.role === 'admin' ? 'default' : 'outline'}>
                        {tech.role === 'admin' ? 'Admin' : 'Tech'}{isMe(tech) ? ' (you)' : ''}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{tech.email}</TableCell>
                  <TableCell>
                    {tech.truck_name ? (
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-blue-600" />
                        <span>{tech.truck_name}</span>
                        <Badge variant="outline" className="text-xs">{tech.truck_identifier}</Badge>
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">No van assigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Wrench className="h-4 w-4 text-gray-400" />
                      <span>{tech.tool_count || 0}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={isActiveTech(tech) ? 'default' : 'secondary'}>
                      {isActiveTech(tech) ? 'active' : 'inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {!signIn ? <span className="text-gray-500">—</span>
                      : lastSignIn(tech) ? new Date(lastSignIn(tech)!).toLocaleString()
                      : <span className="text-orange-700">Never</span>}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap gap-2">
                      {/* Admins only (the database enforces this too, migration 005). You can't
                          deactivate yourself, or the last active admin. */}
                      {isAdmin && !isMe(tech) && (
                        <Button
                          size="sm"
                          className="h-11"
                          variant={isActiveTech(tech) ? 'destructive' : 'default'}
                          onClick={() => toggleTechStatus(tech)}
                          disabled={loading || (isActiveTech(tech) && tech.role === 'admin' && activeAdmins <= 1)}
                          title={isActiveTech(tech) && tech.role === 'admin' && activeAdmins <= 1 ? 'The only active admin can’t be deactivated' : undefined}
                        >
                          {isActiveTech(tech) ? 'Deactivate' : 'Activate'}
                        </Button>
                      )}
                      {isAdmin && signIn && signIn[tech.id] && !lastSignIn(tech) && (
                        <Button size="sm" variant="outline" className="h-11 border-2" disabled={resendingId === tech.id}
                          onClick={() => resendInvite(tech)}>
                          {resendingId === tech.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Mail className="h-4 w-4 mr-1" />}
                          Resend invite
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      {vanTech && vanTech.truck_id && (
        <VanToolsDialog
          truck={{ id: vanTech.truck_id, name: vanTech.truck_name ?? 'Van', identifier: vanTech.truck_identifier ?? '' }}
          heading={`${techName(vanTech)}'s van`}
          techNames={techs.filter((t) => t.truck_id === vanTech.truck_id).map(techName)}
          onClose={() => setVanTech(null)}
          onToolsChanged={fetchTechs}
        />
      )}
      {roleChange && (
        <RoleChangeDialog
          userId={roleChange.person.id}
          name={techName(roleChange.person)}
          to={roleChange.to}
          onClose={() => setRoleChange(null)}
          onChanged={(to) => {
            const name = techName(roleChange.person);
            setTechs((prev) => prev.map((t) => (t.id === roleChange.person.id ? { ...t, role: to } : t)));
            setRoleChange(null);
            toast({ title: 'Role changed', description: `${name} is now ${to === 'admin' ? 'an admin' : 'a tech'}.` });
            fetchTechs();
            fetchTechActivities();
          }}
        />
      )}
      {deactivating && deactivating.truck_id && (
        <DeactivateTechDialog
          techId={deactivating.id}
          techName={techName(deactivating)}
          truck={{ id: deactivating.truck_id, name: deactivating.truck_name ?? 'Van', identifier: deactivating.truck_identifier ?? '' }}
          vanTechNames={techs.filter((t) => t.truck_id === deactivating.truck_id && isActiveTech(t)).map(techName)}
          companyId={userProfile?.company_id}
          userId={userProfile?.id}
          printedBy={[userProfile?.first_name, userProfile?.last_name].filter(Boolean).join(' ') || userProfile?.email || ''}
          onCancel={() => setDeactivating(null)}
          onToolsChanged={fetchTechs}
          onDeactivate={async () => {
            await setTechStatus(deactivating, 'inactive');
            setDeactivating(null);
            await fetchTechs();
            toast({ title: 'Technician deactivated', description: `${techName(deactivating)} is now inactive.` });
          }}
        />
      )}
      <AddTechnicianDialog
        open={showAdd}
        vans={trucks.map((t) => ({ ...t, techs: techs.filter((x) => x.truck_id === t.id).map(techName) }))}
        companyId={userProfile?.company_id}
        userId={userProfile?.id}
        onClose={() => setShowAdd(false)}
        onCreated={() => { fetchTechs(); fetchSignInStatus(); }}
        onVanCreated={(van) => setTrucks((prev) => [...prev, van])}
      />

      {/* Recent Activities */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Tool Activities
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {activities.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No recent activities</p>
            ) : (
              activities.map((activity) => (
                <div key={activity.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${
                      activity.action === 'transferred' ? 'bg-blue-100' :
                      activity.action === 'added' ? 'bg-green-100' : 'bg-orange-100'
                    }`}>
                      {activity.action === 'transferred' ? (
                        <ArrowRightLeft className="h-4 w-4 text-blue-600" />
                      ) : (
                        <Package className={`h-4 w-4 ${
                          activity.action === 'added' ? 'text-green-600' : 'text-orange-600'
                        }`} />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">
                        {activity.action === 'transferred' ? (
                          <>
                            {activity.user_name} transferred <span className="text-blue-600">{activity.item_name}</span>
                            {activity.details?.from && activity.details?.to && (
                              <span className="text-gray-600 text-sm">
                                {' '}from {activity.details.from} → {activity.details.to}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            {activity.user_name} {activity.action} {activity.item_name}
                          </>
                        )}
                      </p>
                      <p className="text-sm text-gray-500 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(activity.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Badge variant={
                    activity.action === 'transferred' ? 'default' :
                    activity.action === 'added' ? 'default' : 'secondary'
                  }>
                    {activity.action}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
};