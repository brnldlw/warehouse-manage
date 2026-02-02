import { supabase } from '@/lib/supabase';

export const sendLowStockAlert = async (itemName: string, quantity: number, minQuantity: number, companyId: string) => {
  try {
    console.log(`Sending low stock alert for ${itemName}: ${quantity} remaining (min: ${minQuantity})`);
    
    // Get company settings including admin email
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('name, settings')
      .eq('id', companyId)
      .single();
    
    if (companyError) {
      console.error('Error fetching company:', companyError);
      return;
    }

    if (!company) {
      console.log('Company not found');
      return;
    }

    const settings = company.settings || {};
    const emailConfig = settings.emailNotifications || {};
    const adminEmail = emailConfig.adminEmail;
    const companyName = emailConfig.companyName || company.name || 'Inventory Management System';

    if (!adminEmail) {
      console.log('No admin email configured for company');
      return;
    }

    // Check if low stock alerts are enabled
    if (emailConfig.enableLowStockAlerts === false) {
      console.log('Low stock alerts are disabled for this company');
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('email-notifications', {
        body: {
          type: 'low_stock',
          to: adminEmail,
          subject: `Low Stock Alert - ${itemName}`,
          message: `Item "${itemName}" is running low with only ${quantity} units remaining. Minimum required: ${minQuantity}.`,
          companyName,
          companyId
        }
      });
      
      if (error) {
        console.error(`Low stock alert error for ${adminEmail}:`, error);
      } else {
        console.log(`Low stock alert sent successfully to ${adminEmail}:`, data);
      }
    } catch (emailError) {
      console.error(`Failed to send alert to ${adminEmail}:`, emailError);
    }
  } catch (error) {
    console.error('Failed to send low stock alert:', error);
  }
};

export const sendTechLowStockAlert = async (itemName: string, techEmail: string, quantity: number, minQuantity: number, companyId: string) => {
  try {
    console.log(`Sending tech low stock alert for ${itemName} (Technician: ${techEmail}): ${quantity} remaining (min: ${minQuantity})`);
    
    // Get company settings including admin email
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('name, settings')
      .eq('id', companyId)
      .single();
    
    if (companyError) {
      console.error('Error fetching company:', companyError);
      return;
    }

    if (!company) {
      console.log('Company not found');
      return;
    }

    const settings = company.settings || {};
    const emailConfig = settings.emailNotifications || {};
    const adminEmail = emailConfig.adminEmail;
    const companyName = emailConfig.companyName || company.name || 'Inventory Management System';

    if (!adminEmail) {
      console.log('No admin email configured for company');
      return;
    }

    // Check if low stock alerts are enabled
    if (emailConfig.enableLowStockAlerts === false) {
      console.log('Low stock alerts are disabled for this company');
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('email-notifications', {
        body: {
          type: 'tech_low_stock',
          to: adminEmail,
          subject: `Technician Low Stock Alert - ${itemName}`,
          techLowStockData: {
            itemName,
            techEmail,
            remainingQuantity: quantity,
            minQuantity,
            companyName
          },
          companyName,
          companyId
        }
      });
      
      if (error) {
        console.error(`Tech low stock alert error for ${adminEmail}:`, error);
      } else {
        console.log(`Tech low stock alert sent successfully to ${adminEmail}:`, data);
      }
    } catch (emailError) {
      console.error(`Failed to send tech alert to ${adminEmail}:`, emailError);
    }
  } catch (error) {
    console.error('Failed to send tech low stock alert:', error);
  }
};

export const checkAndSendTechLowStockAlert = async (itemId: string, techUserId: string, newRemainingQuantity: number, companyId: string) => {
  try {
    // Get item details including min_quantity and name
    const { data: item, error: itemError } = await supabase
      .from('inventory_items')
      .select('name, min_quantity')
      .eq('id', itemId)
      .single();
    
    if (itemError || !item) {
      console.error('Error fetching item for tech low stock check:', itemError);
      return;
    }

    // Get technician's email
    const { data: techProfile, error: techError } = await supabase
      .from('user_profiles')
      .select('email')
      .eq('id', techUserId)
      .single();
    
    if (techError || !techProfile) {
      console.error('Error fetching technician profile:', techError);
      return;
    }
    
    // Send alert if technician's remaining quantity is at or below minimum (including when it reaches 0)
    if (newRemainingQuantity <= item.min_quantity) {
      await sendTechLowStockAlert(
        item.name,
        techProfile.email,
        newRemainingQuantity,
        item.min_quantity,
        companyId
      );
    }
  } catch (error) {
    console.error('Error in checkAndSendTechLowStockAlert:', error);
  }
};

export const checkAndSendLowStockAlert = async (itemId: string, newQuantity: number) => {
  try {
    // Get item details including min_quantity and company_id
    const { data: item, error } = await supabase
      .from('inventory_items')
      .select('name, min_quantity, company_id')
      .eq('id', itemId)
      .single();
    
    if (error || !item) {
      console.error('Error fetching item for low stock check:', error);
      return;
    }

    if (!item.company_id) {
      console.error('Item has no company_id');
      return;
    }
    
    // Send alert if quantity is at or below minimum and greater than 0
    if (newQuantity <= item.min_quantity && newQuantity > 0) {
      await sendLowStockAlert(item.name, newQuantity, item.min_quantity, item.company_id);
    }
  } catch (error) {
    console.error('Error in checkAndSendLowStockAlert:', error);
  }
};