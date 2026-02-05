-- Migration: Convert inventory system from consumable to transferable tools
-- Date: 2026-02-05
-- Description: Add columns to track individual tools with locations and transfer history

-- =====================================================
-- STEP 1: Add new columns to inventory_items table
-- =====================================================

-- Serial number for unique tool identification
ALTER TABLE public.inventory_items 
ADD COLUMN IF NOT EXISTS serial_number VARCHAR(100);

-- Condition of the tool (good, fair, poor, damaged)
ALTER TABLE public.inventory_items 
ADD COLUMN IF NOT EXISTS condition VARCHAR(20) DEFAULT 'good' 
CHECK (condition IN ('good', 'fair', 'poor', 'damaged'));

-- Location type (warehouse or truck)
ALTER TABLE public.inventory_items 
ADD COLUMN IF NOT EXISTS location_type VARCHAR(20) DEFAULT 'warehouse' 
CHECK (location_type IN ('warehouse', 'truck'));

-- Which truck the tool is assigned to (null = warehouse)
ALTER TABLE public.inventory_items 
ADD COLUMN IF NOT EXISTS assigned_truck_id UUID REFERENCES public.trucks(id) ON DELETE SET NULL;

-- When was the tool last assigned/transferred
ALTER TABLE public.inventory_items 
ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP WITH TIME ZONE;

-- Who made the last assignment/transfer
ALTER TABLE public.inventory_items 
ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES public.user_profiles(id);

-- =====================================================
-- STEP 2: Create index for faster lookups
-- =====================================================

-- Index for finding tools by truck
CREATE INDEX IF NOT EXISTS idx_inventory_items_assigned_truck 
ON public.inventory_items(assigned_truck_id) 
WHERE assigned_truck_id IS NOT NULL;

-- Index for finding tools by location type
CREATE INDEX IF NOT EXISTS idx_inventory_items_location_type 
ON public.inventory_items(location_type);

-- Index for serial number lookups
CREATE INDEX IF NOT EXISTS idx_inventory_items_serial_number 
ON public.inventory_items(serial_number) 
WHERE serial_number IS NOT NULL;

-- =====================================================
-- STEP 3: Set quantity to 1 for transferable tools
-- (Each row = 1 individual tool)
-- =====================================================

-- For existing items, we'll keep their quantity as-is
-- New items should be added with quantity = 1

-- =====================================================
-- STEP 4: Update RLS policies for the new columns
-- =====================================================

-- Enable users to see tools assigned to their truck
DROP POLICY IF EXISTS "Users can view tools on their assigned truck" ON public.inventory_items;

CREATE POLICY "Users can view tools on their assigned truck"
ON public.inventory_items
FOR SELECT
USING (
  company_id IN (
    SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
  )
);

-- =====================================================
-- STEP 5: Create function to log tool transfers
-- =====================================================

CREATE OR REPLACE FUNCTION log_tool_transfer()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if assigned_truck_id or location_type changed
  IF (OLD.assigned_truck_id IS DISTINCT FROM NEW.assigned_truck_id) OR 
     (OLD.location_type IS DISTINCT FROM NEW.location_type) THEN
    
    INSERT INTO public.activity_logs (
      user_id,
      action,
      item_id,
      truck_id,
      details,
      company_id,
      timestamp
    ) VALUES (
      NEW.assigned_by,
      'tool_transfer',
      NEW.id,
      NEW.assigned_truck_id,
      jsonb_build_object(
        'tool_name', NEW.name,
        'serial_number', NEW.serial_number,
        'from_location', CASE 
          WHEN OLD.location_type = 'warehouse' THEN 'Warehouse'
          ELSE (SELECT name FROM public.trucks WHERE id = OLD.assigned_truck_id)
        END,
        'to_location', CASE 
          WHEN NEW.location_type = 'warehouse' THEN 'Warehouse'
          ELSE (SELECT name FROM public.trucks WHERE id = NEW.assigned_truck_id)
        END,
        'previous_truck_id', OLD.assigned_truck_id,
        'new_truck_id', NEW.assigned_truck_id
      ),
      NEW.company_id,
      NOW()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-log transfers
DROP TRIGGER IF EXISTS trigger_log_tool_transfer ON public.inventory_items;

CREATE TRIGGER trigger_log_tool_transfer
AFTER UPDATE ON public.inventory_items
FOR EACH ROW
EXECUTE FUNCTION log_tool_transfer();

-- =====================================================
-- STEP 6: Helper view for tools with truck info
-- =====================================================

CREATE OR REPLACE VIEW public.tools_with_location AS
SELECT 
  i.id,
  i.name,
  i.description,
  i.serial_number,
  i.barcode,
  i.condition,
  i.location_type,
  i.assigned_truck_id,
  i.assigned_at,
  i.assigned_by,
  i.category_id,
  i.unit_price,
  i.image_url,
  i.company_id,
  i.created_at,
  i.updated_at,
  t.name AS truck_name,
  t.identifier AS truck_identifier,
  c.name AS category_name,
  c.color AS category_color,
  CASE 
    WHEN i.location_type = 'warehouse' THEN 'Warehouse'
    ELSE COALESCE(t.name, 'Unknown Truck')
  END AS current_location
FROM public.inventory_items i
LEFT JOIN public.trucks t ON i.assigned_truck_id = t.id
LEFT JOIN public.categories c ON i.category_id = c.id;

-- =====================================================
-- NOTES FOR FRONTEND CHANGES:
-- =====================================================
-- 1. Each inventory_items row now represents ONE individual tool
-- 2. quantity field is kept for backward compatibility but should be 1
-- 3. Use location_type + assigned_truck_id to determine where tool is
-- 4. Transfer history is automatically logged to activity_logs
-- 5. techs can only VIEW tools assigned to their truck
-- 6. admins can transfer tools between warehouse and trucks
-- =====================================================
