-- Database functions for managing technician inventory

-- Function to add items to technician inventory (consolidates existing records)
CREATE OR REPLACE FUNCTION add_to_technician_inventory(
  tech_user_id UUID,
  tech_company_id UUID,
  inventory_item_id UUID,
  inventory_item_name VARCHAR,
  add_quantity INTEGER,
  job_ref VARCHAR,
  stock_request_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  existing_record RECORD;
  new_quantity INTEGER;
  new_remaining_quantity INTEGER;
  updated_notes TEXT;
BEGIN
  -- Find existing active record for this item
  SELECT * INTO existing_record
  FROM technician_inventory
  WHERE user_id = tech_user_id
    AND company_id = tech_company_id
    AND item_id = inventory_item_id
    AND status = 'active'
    AND remaining_quantity > 0
  ORDER BY received_at DESC
  LIMIT 1;

  IF existing_record IS NOT NULL THEN
    -- Update existing record
    new_quantity := existing_record.quantity + add_quantity;
    new_remaining_quantity := existing_record.remaining_quantity + add_quantity;
    
    updated_notes := COALESCE(existing_record.notes, '') ||
      CASE 
        WHEN existing_record.notes IS NOT NULL AND existing_record.notes != '' THEN E'\n'
        ELSE ''
      END ||
      'Added ' || add_quantity || ' from job #' || job_ref || ' on ' || CURRENT_TIMESTAMP;

    UPDATE technician_inventory
    SET 
      quantity = new_quantity,
      remaining_quantity = new_remaining_quantity,
      notes = updated_notes,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = existing_record.id;
    
    RETURN TRUE;
  ELSE
    -- Create new record
    INSERT INTO technician_inventory (
      user_id,
      item_id,
      item_name,
      quantity,
      remaining_quantity,
      job_number,
      request_id,
      company_id,
      status,
      notes
    ) VALUES (
      tech_user_id,
      inventory_item_id,
      inventory_item_name,
      add_quantity,
      add_quantity,
      job_ref,
      stock_request_id,
      tech_company_id,
      'active',
      'Fulfilled from stock request #' || job_ref
    );
    
    RETURN TRUE;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to get technician's current inventory
CREATE OR REPLACE FUNCTION get_technician_inventory(tech_user_id UUID, tech_company_id UUID)
RETURNS TABLE (
  id UUID,
  item_id UUID,
  item_name VARCHAR,
  quantity INTEGER,
  remaining_quantity INTEGER,
  job_number VARCHAR,
  received_at TIMESTAMPTZ,
  status VARCHAR,
  notes TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ti.id,
    ti.item_id,
    ti.item_name,
    ti.quantity,
    ti.remaining_quantity,
    ti.job_number,
    ti.received_at,
    ti.status,
    ti.notes
  FROM technician_inventory ti
  WHERE ti.user_id = tech_user_id 
    AND ti.company_id = tech_company_id
    AND ti.status = 'active'
    AND ti.remaining_quantity > 0
  ORDER BY ti.received_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to use items from technician inventory
CREATE OR REPLACE FUNCTION use_technician_item(
  tech_user_id UUID,
  tech_company_id UUID,
  inventory_item_id UUID,
  use_quantity INTEGER,
  job_ref VARCHAR DEFAULT NULL,
  usage_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  available_quantity INTEGER;
  inventory_record RECORD;
BEGIN
  -- Find the oldest active inventory record for this item
  SELECT * INTO inventory_record
  FROM technician_inventory
  WHERE user_id = tech_user_id
    AND company_id = tech_company_id
    AND item_id = inventory_item_id
    AND status = 'active'
    AND remaining_quantity > 0
  ORDER BY received_at ASC
  LIMIT 1;

  -- Check if we have enough quantity
  IF inventory_record IS NULL OR inventory_record.remaining_quantity < use_quantity THEN
    RETURN FALSE;
  END IF;

  -- Update the inventory record
  UPDATE technician_inventory
  SET 
    used_quantity = used_quantity + use_quantity,
    remaining_quantity = remaining_quantity - use_quantity,
    status = CASE 
      WHEN remaining_quantity - use_quantity = 0 THEN 'used'
      ELSE 'active'
    END,
    notes = COALESCE(notes, '') || 
      CASE 
        WHEN notes IS NOT NULL AND notes != '' THEN E'\n'
        ELSE ''
      END ||
      'Used ' || use_quantity || ' on ' || CURRENT_TIMESTAMP ||
      CASE 
        WHEN job_ref IS NOT NULL THEN ' (Job: ' || job_ref || ')'
        ELSE ''
      END ||
      CASE 
        WHEN usage_notes IS NOT NULL THEN ' - ' || usage_notes
        ELSE ''
      END,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = inventory_record.id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to return unused items to main inventory
CREATE OR REPLACE FUNCTION return_technician_item(
  tech_user_id UUID,
  tech_company_id UUID,
  inventory_item_id UUID,
  return_quantity INTEGER,
  return_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  inventory_record RECORD;
BEGIN
  -- Find active inventory record for this item
  SELECT * INTO inventory_record
  FROM technician_inventory
  WHERE user_id = tech_user_id
    AND company_id = tech_company_id
    AND item_id = inventory_item_id
    AND status = 'active'
    AND remaining_quantity >= return_quantity
  ORDER BY received_at ASC
  LIMIT 1;

  -- Check if we have enough quantity to return
  IF inventory_record IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Update technician inventory
  UPDATE technician_inventory
  SET 
    remaining_quantity = remaining_quantity - return_quantity,
    status = CASE 
      WHEN remaining_quantity - return_quantity = 0 THEN 'returned'
      ELSE 'active'
    END,
    notes = COALESCE(notes, '') || 
      CASE 
        WHEN notes IS NOT NULL AND notes != '' THEN E'\n'
        ELSE ''
      END ||
      'Returned ' || return_quantity || ' on ' || CURRENT_TIMESTAMP ||
      CASE 
        WHEN return_notes IS NOT NULL THEN ' - ' || return_notes
        ELSE ''
      END,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = inventory_record.id;

  -- Add back to main inventory
  UPDATE inventory_items
  SET 
    quantity = quantity + return_quantity,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = inventory_item_id AND company_id = tech_company_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to get technician inventory summary
CREATE OR REPLACE FUNCTION get_technician_inventory_summary(tech_user_id UUID, tech_company_id UUID)
RETURNS TABLE (
  item_id UUID,
  item_name VARCHAR,
  total_received INTEGER,
  total_used INTEGER,
  total_remaining INTEGER,
  active_records INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ti.item_id,
    ti.item_name,
    SUM(ti.quantity)::INTEGER as total_received,
    SUM(ti.used_quantity)::INTEGER as total_used,
    SUM(ti.remaining_quantity)::INTEGER as total_remaining,
    COUNT(CASE WHEN ti.status = 'active' AND ti.remaining_quantity > 0 THEN 1 END)::INTEGER as active_records
  FROM technician_inventory ti
  WHERE ti.user_id = tech_user_id 
    AND ti.company_id = tech_company_id
  GROUP BY ti.item_id, ti.item_name
  ORDER BY ti.item_name;
END;
$$ LANGUAGE plpgsql;
