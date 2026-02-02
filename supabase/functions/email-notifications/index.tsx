export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    console.log('Email notification request received');
    const requestBody = await req.json();
    console.log('Request body:', JSON.stringify(requestBody, null, 2));
    const { type, to, subject, message, purchaseData, items, activityData, companyName, companyId, requestData, techLowStockData } = requestBody;
    const sendGridApiKey = Deno.env.get("SENDGRID_API_KEY");
    console.log('SendGrid API key exists:', !!sendGridApiKey);
    if (!sendGridApiKey) {
      console.error('SendGrid API key not found in environment variables');
      throw new Error('SendGrid API key not configured');
    }
    let emailSubject = subject;
    let emailContent = message;
    let recipient = to || 'indytradingpost@comcast.net';
    console.log('Email type:', type);
    console.log('Recipient:', recipient);
    // Generate email content based on type
    switch(type){
      case 'stock_request':
        emailSubject = subject || `[${companyName || 'Company'}] New Stock Request - Job #${requestData?.jobNumber}`;
        emailContent = `
          <h2>New Stock Request - ${companyName || 'Your Company'}</h2>
          <p>A new stock request has been submitted by a technician.</p>
          <h3>Request Details:</h3>
          <ul>
            <li><strong>Company:</strong> ${companyName || 'N/A'}</li>
            <li><strong>User:</strong> ${requestData?.userName || 'Unknown'}</li>
            <li><strong>Job Number:</strong> ${requestData?.jobNumber || 'N/A'}</li>
            <li><strong>Date:</strong> ${requestData?.date || new Date().toLocaleString()}</li>
          </ul>
          <h3>Requested Items:</h3>
          <ul>
            ${requestData?.items?.map((item)=>`
              <li><strong>${item.itemName}</strong> - Quantity: ${item.quantity}</li>
            `).join('') || '<li>No items specified</li>'}
          </ul>
          ${requestData?.notes ? `<h3>Notes:</h3><p>${requestData.notes}</p>` : ''}
          <p>Please review and process this request in the admin panel.</p>
        `;
        break;
      case 'purchase':
        emailSubject = `New Purchase - ${companyName || 'Inventory System'}`;
        emailContent = `
          <h2>New Purchase Notification</h2>
          <p>A new purchase has been made from the company store.</p>
          <h3>Purchase Details:</h3>
          <ul>
            <li><strong>User:</strong> ${purchaseData?.userName || 'Unknown'}</li>
            <li><strong>Item:</strong> ${purchaseData?.itemName || 'Unknown'}</li>
            <li><strong>Quantity:</strong> ${purchaseData?.quantity || 0}</li>
            <li><strong>Total:</strong> $${purchaseData?.total || 0}</li>
            <li><strong>Date:</strong> ${new Date().toLocaleString()}</li>
          </ul>
          <p>The item has been removed from the user's inventory.</p>
        `;
        break;
      case 'low_stock':
        emailSubject = subject || `[${companyName || 'Company'}] Low Stock Alert`;
        if (items && Array.isArray(items)) {
          emailContent = `
            <h2>Low Stock Alert - ${companyName || 'Your Company'}</h2>
            <p>The following items are running low in stock:</p>
            <ul>
              ${items.map((item)=>`
                <li><strong>${item.name}</strong> - Only ${item.quantity} remaining (Min: ${item.min_quantity || 'N/A'})</li>
              `).join('')}
            </ul>
            <p>Please consider restocking these items.</p>
          `;
        } else {
          emailContent = `
            <h2>Low Stock Alert - ${companyName || 'Your Company'}</h2>
            <p>${message || 'Low stock alert triggered.'}</p>
          `;
        }
        break;
      case 'tech_low_stock':
        emailSubject = subject || `[${companyName || 'Company'}] Technician Low Stock Alert`;
        emailContent = `
          <h2>Technician Low Stock Alert - ${companyName || 'Your Company'}</h2>
          <p>A technician's inventory is running low and requires attention.</p>
          <h3>Alert Details:</h3>
          <ul>
            <li><strong>Technician:</strong> ${techLowStockData?.techEmail || 'Unknown'}</li>
            <li><strong>Item:</strong> ${techLowStockData?.itemName || 'Unknown'}</li>
            <li><strong>Remaining Quantity:</strong> ${techLowStockData?.remainingQuantity || 0}</li>
            <li><strong>Minimum Required:</strong> ${techLowStockData?.minQuantity || 'N/A'}</li>
            <li><strong>Alert Time:</strong> ${new Date().toLocaleString()}</li>
          </ul>
          <p>Please consider processing a stock request for this technician or contact them directly to manage their inventory levels.</p>
        `;
        break;
      case 'user_activity':
        emailSubject = `User Activity Alert - ${companyName || 'Inventory System'}`;
        emailContent = `
          <h2>User Activity Notification</h2>
          <p><strong>User:</strong> ${activityData?.userName || 'Unknown'}</p>
          <p><strong>Action:</strong> ${activityData?.action || 'Unknown'}</p>
          <p><strong>Details:</strong> ${activityData?.details || 'No details'}</p>
          <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        `;
        break;
      case 'test':
        emailSubject = subject || `Test Email - ${companyName || 'Inventory System'}`;
        emailContent = message || 'This is a test email from your inventory system.';
        break;
      default:
        emailSubject = subject || `Notification - ${companyName || 'Inventory System'}`;
        emailContent = message || 'You have a new notification.';
    }
    // Send email using SendGrid API
    const emailData = {
      personalizations: [
        {
          to: [
            {
              email: recipient
            }
          ],
          subject: emailSubject
        }
      ],
      from: {
        email: 'noreply@inventory-system.com',
        name: companyName || 'Inventory System'
      },
      content: [
        {
          type: 'text/html',
          value: emailContent
        }
      ]
    };
    console.log('Sending email with data:', JSON.stringify(emailData, null, 2));
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sendGridApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailData)
    });
    console.log('SendGrid response status:', response.status);
    if (!response.ok) {
      const errorText = await response.text();
      console.error('SendGrid error response:', errorText);
      throw new Error(`SendGrid API error: ${response.status} - ${errorText}`);
    }
    console.log('Email sent successfully to:', recipient);
    return new Response(JSON.stringify({
      success: true,
      message: 'Email sent successfully',
      type,
      recipient
    }), {
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error('Email notification error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to send email',
      message: error.message,
      details: error.toString()
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
});