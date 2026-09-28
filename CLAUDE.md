# Warehouse Manager: project rules
- Live production app used by real companies. Develop and test ONLY against staging. Never run anything against production except through npm run migrate -- prod when I explicitly say so.
- Dev machine is Windows + PowerShell. Scripts are Node .mjs run through npm scripts; no bash, no Docker.
- Every database change is a new migration in supabase/migrations/ named 00N_description.sql. Additive and non-destructive: never drop columns or tables holding data. Include a commented rollback section. The currently deployed app must keep working after each migration.
- Multi-company: every table has company_id. Isolation is enforced by RLS in the database, never only by client-side filters. A user can never read or write another company's rows, change their own company_id, or change their own role.
- All tool movements go through Postgres RPC functions that are atomic, check company and role server-side, and write to the append-only tool_events table.
- No new heavy dependencies without telling me why. Prefer existing ones: xlsx, qrcode, jsbarcode, @yudiel/react-qr-scanner, date-fns, shadcn/ui.
- Warehouse and field screens: buttons at least 56px, high contrast, work on a cheap tablet or phone.
- End of every phase: npm run build and npm run lint pass, give me a plain-English summary of what changed and how to test it, then commit with message "Phase N: <name>". Explain things simply; I'm not a database expert.

# Target design: low-touch tool control
Techs do NO data entry. A few accountable roles keep the records, and a monthly supervisor van check catches anything that slips.

Tool classes:
A. loadout: tools assigned permanently to a van. Assigned once, tech signs for them, never checked in/out day to day.
B. shared: specialty/expensive tools locked in the warehouse. Issued and returned ONLY by the tool_room role, with a due date. Overdue list.
C. consumable: cheap tools and supplies. Not tracked individually.

Roles: admin; tool_room (issues/returns shared tools, can be several people); supervisor (runs van checks); tech (read-only, signs van checks). Platform owner has super_admin to create companies.

Every tool always has a responsible person. Every change is logged with who did it.

Van check: supervisor checks each van against its list about every 30 days. Tech signs. Missing items go to a review queue showing the last responsible person.

Offboarding: a tech can't be deactivated until a final van check is done and every tool is returned, reassigned, or marked missing.

Tags: metal
