-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  item_id uuid,
  truck_id uuid,
  details jsonb,
  timestamp timestamp with time zone DEFAULT now(),
  company_id uuid,
  CONSTRAINT activity_logs_pkey PRIMARY KEY (id),
  CONSTRAINT activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(id),
  CONSTRAINT activity_logs_truck_id_fkey FOREIGN KEY (truck_id) REFERENCES public.trucks(id),
  CONSTRAINT activity_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  action character varying NOT NULL,
  target_type character varying NOT NULL,
  target_id uuid,
  details jsonb DEFAULT '{}'::jsonb,
  ip_address inet,
  created_at timestamp with time zone DEFAULT now(),
  company_id uuid,
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT audit_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL UNIQUE,
  description text,
  color character varying DEFAULT '#6B7280'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  image_url text,
  company_id uuid,
  CONSTRAINT categories_pkey PRIMARY KEY (id),
  CONSTRAINT categories_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.companies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL UNIQUE,
  domain character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT true,
  settings jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT companies_pkey PRIMARY KEY (id)
);
CREATE TABLE public.inventory_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  description text,
  barcode character varying UNIQUE,
  quantity integer DEFAULT 0,
  min_quantity integer DEFAULT 5,
  category_id uuid,
  location character varying,
  unit_price numeric,
  supplier character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  image_url text,
  company_id uuid,
  CONSTRAINT inventory_items_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.refrigerant_usage (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  request_id uuid,
  refrigerant_type character varying,
  amount_used numeric,
  amount_recovered numeric,
  unit character varying DEFAULT 'lbs'::character varying,
  job_number character varying,
  created_at timestamp without time zone DEFAULT now(),
  tech_name character varying,
  notes text,
  date_recorded timestamp without time zone DEFAULT now(),
  company_id uuid,
  CONSTRAINT refrigerant_usage_pkey PRIMARY KEY (id),
  CONSTRAINT refrigerant_usage_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.stock_requests(id),
  CONSTRAINT refrigerant_usage_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  report_type character varying,
  parameters jsonb,
  generated_by uuid,
  created_at timestamp without time zone DEFAULT now(),
  company_id uuid,
  CONSTRAINT reports_pkey PRIMARY KEY (id),
  CONSTRAINT reports_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES public.user_profiles(id),
  CONSTRAINT reports_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.stock_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  job_number text NOT NULL,
  notes text,
  items jsonb NOT NULL,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'fulfilled'::text, 'received'::text])),
  created_at timestamp with time zone DEFAULT now(),
  fulfilled_at timestamp with time zone,
  received_at timestamp with time zone,
  company_id uuid,
  CONSTRAINT stock_requests_pkey PRIMARY KEY (id),
  CONSTRAINT stock_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT stock_requests_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.truck_inventory (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  truck_id uuid,
  item_name character varying NOT NULL,
  category_id uuid,
  quantity integer DEFAULT 0,
  unit_price numeric,
  barcode character varying,
  description text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  company_id uuid,
  CONSTRAINT truck_inventory_pkey PRIMARY KEY (id),
  CONSTRAINT truck_inventory_truck_id_fkey FOREIGN KEY (truck_id) REFERENCES public.trucks(id),
  CONSTRAINT truck_inventory_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id),
  CONSTRAINT truck_inventory_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.trucks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  identifier character varying NOT NULL UNIQUE,
  company_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT trucks_pkey PRIMARY KEY (id),
  CONSTRAINT trucks_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.user_profiles (
  id uuid NOT NULL,
  email character varying,
  first_name character varying,
  last_name character varying,
  role character varying DEFAULT 'user'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  is_active boolean,
  phone character varying,
  status text,
  specialty character varying,
  company_id uuid,
  CONSTRAINT user_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
  CONSTRAINT user_profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.user_truck_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  truck_id uuid,
  assigned_at timestamp with time zone DEFAULT now(),
  assigned_by uuid,
  company_id uuid,
  CONSTRAINT user_truck_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT user_truck_assignments_truck_id_fkey FOREIGN KEY (truck_id) REFERENCES public.trucks(id),
  CONSTRAINT user_truck_assignments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.technician_inventory (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item_id uuid NOT NULL,
  item_name character varying NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  job_number character varying,
  request_id uuid,
  received_at timestamp with time zone DEFAULT now(),
  used_quantity integer DEFAULT 0,
  remaining_quantity integer DEFAULT 0,
  status character varying DEFAULT 'active' CHECK (status = ANY (ARRAY['active'::text, 'used'::text, 'returned'::text])),
  notes text,
  company_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT technician_inventory_pkey PRIMARY KEY (id),
  CONSTRAINT technician_inventory_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(id),
  CONSTRAINT technician_inventory_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.inventory_items(id),
  CONSTRAINT technician_inventory_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.stock_requests(id),
  CONSTRAINT technician_inventory_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.warranties (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  request_id uuid,
  part_id uuid,
  warranty_period integer,
  warranty_start_date date DEFAULT CURRENT_DATE,
  warranty_end_date date,
  customer_info text,
  installation_notes text,
  created_at timestamp without time zone DEFAULT now(),
  job_number numeric,
  notes text,
  part_name text,
  serial_number numeric,
  status text,
  warranty_end timestamp without time zone,
  warranty_start timestamp without time zone,
  company_id uuid,
  CONSTRAINT warranties_pkey PRIMARY KEY (id),
  CONSTRAINT warranties_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.stock_requests(id),
  CONSTRAINT warranties_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);