import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { BarChart3, FileText, Download, Calendar } from 'lucide-react';
import { dbOperations } from '@/lib/dbUtils';
import { showErrorNotification, showSuccessNotification } from '@/lib/notificationUtils';
import { useAuth } from '@/contexts/AuthContext';
interface ReportData {
  id: string;
  type: string;
  data: any;
  generated_at: string;
}

export const ReportsPanel: React.FC = () => {
  const { userProfile } = useAuth();
  const [reportType, setReportType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [truckFilter, setTruckFilter] = useState('');
  const [reports, setReports] = useState<ReportData[]>([]);
  const [loading, setLoading] = useState(false);

  const generateReport = async () => {
    if (!reportType) return;
    
    if (!userProfile?.company_id) {
      showErrorNotification(new Error('Company information not found'), 'Cannot generate report');
      return;
    }
    
    setLoading(true);
    
    try {
      const filters = { dateFrom, dateTo, truckFilter };
      const response = await dbOperations.getStockRequests(filters);
      const data = (Array.isArray(response) ? response : []) as any[];
      
      const reportData = {
        type: reportType,
        data: Array.isArray(data) ? data : [],
        filters,
        summary: generateSummary(Array.isArray(data) ? data : [], reportType)
      };
      
      setReports([{
        id: Date.now().toString(),
        type: reportType,
        data: reportData,
        generated_at: new Date().toISOString()
      }, ...reports]);
      
      showSuccessNotification('Report generated successfully');
      
    } catch (error) {
      showErrorNotification(error, 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const generateSummary = (data: any[] = [], type: string) => {
    switch (type) {
      case 'usage':
        const totalRequests = data.length;
        const uniqueParts = new Set(data.map(d => d.item_id)).size;
        const totalQuantity = data.reduce((sum, d) => sum + d.quantity, 0);
        return { totalRequests, uniqueParts, totalQuantity };
      
      case 'inventory':
        return { totalItems: data.length };
      
      case 'trucks':
        const uniqueTrucks = new Set(data.map(d => d.truck_id)).size;
        return { uniqueTrucks, totalRequests: data.length };
      
      default:
        return {};
    }
  };

  const exportReport = (report: ReportData) => {
    const csvContent = convertToCSV(report.data.data);
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.type}_report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatItems = (items: any) => {
    if (!items) return 'No items';
    if (typeof items === 'string') {
      try {
        items = JSON.parse(items);
      } catch (e) {
        return items || 'No items';
      }
    }
    if (Array.isArray(items)) {
      return items.map(item => {
        const quantity = item.quantity || 1;
        const name = item.name || item.item_name || 'Unknown Item';
        return `${quantity}x ${name}`;
      }).join(', ');
    }
    if (typeof items === 'object') {
      const quantity = items.quantity || 1;
      const name = items.name || items.item_name || 'Unknown Item';
      return `${quantity}x ${name}`;
    }
    return items.toString() || 'No items';
  };

  const formatStatus = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const convertToCSV = (data: any[]) => {
    if (!data.length) return '';
    
    // Define custom headers mapping
    const headerMap: { [key: string]: string } = {
      job_number: 'Job Number',
      notes: 'Notes',
      items: 'Items Requested',
      status: 'Status',
      created_at: 'Created Date',
      fulfilled_at: 'Fulfilled Date',
      received_at: 'Received Date'
    };
    
    // Select and order the columns we want to show
    const columns = ['job_number', 'notes', 'items', 'status', 'created_at', 'fulfilled_at', 'received_at'];
    const headers = columns.map(col => headerMap[col] || col).join(',');
    
    const rows = data.map(row => {
      return columns.map(col => {
        let value = row[col];
        
        // Format different types of values
        if (col === 'items') {
          value = formatItems(value);
        } else if (col.includes('_at')) {
          value = formatDate(value);
        } else if (col === 'status') {
          value = formatStatus(value);
        }
        
        // Handle empty values and format them
        if (value === null || value === undefined || value === '') {
          switch (col) {
            case 'notes':
              value = 'No notes';
              break;
            case 'fulfilled_at':
              value = status === 'pending' ? 'Not fulfilled yet' : 'N/A';
              break;
            case 'received_at':
              value = status === 'received' ? value : 'Not received yet';
              break;
            default:
              value = 'N/A';
          }
        }

        // Escape and quote strings
        if (typeof value === 'string') {
          value = `"${value.replace(/"/g, '""')}"`;
        }
        
        return value;
      }).join(',');
    });
    
    return [headers, ...rows].join('\n');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Generate Reports
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Report Type</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select report type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="usage">Parts Usage Report</SelectItem>
                  <SelectItem value="inventory">Current Inventory</SelectItem>
                  <SelectItem value="trucks">Truck Activity</SelectItem>
                  <SelectItem value="requests">Request Log</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="truck_filter">Truck Filter (Optional)</Label>
              <Input
                id="truck_filter"
                placeholder="Truck ID"
                value={truckFilter}
                onChange={(e) => setTruckFilter(e.target.value)}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="date_from">From Date</Label>
              <Input
                id="date_from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="date_to">To Date</Label>
              <Input
                id="date_to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
          
          <Button 
            onClick={generateReport} 
            disabled={loading || !reportType}
            className="w-full"
          >
            {loading ? 'Generating...' : 'Generate Report'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Generated Reports
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {reports.map((report) => (
              <div key={report.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-semibold capitalize">{report.type} Report</h3>
                    <p className="text-sm text-gray-600 flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {new Date(report.generated_at).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportReport(report)}
                    className="flex items-center gap-1"
                  >
                    <Download className="h-4 w-4" />
                    Export CSV
                  </Button>
                </div>
                
                <div className="space-y-4">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-3 gap-4">
                    {Object.entries(report.data.summary).map(([key, value]) => (
                      <div key={key} className="text-center">
                        <div className="text-2xl font-bold text-blue-600">{value as number}</div>
                        <div className="text-sm text-gray-600 capitalize">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Preview Table */}
                  <div className="mt-4 border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left">Job Number</th>
                            <th className="px-4 py-2 text-left">Items</th>
                            <th className="px-4 py-2 text-left">Status</th>
                            <th className="px-4 py-2 text-left">Created</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {report.data.data.slice(0, 3).map((item: any, index: number) => (
                            <tr key={index} className="hover:bg-gray-50">
                              <td className="px-4 py-2">{item.job_number}</td>
                              <td className="px-4 py-2">{formatItems(item.items)}</td>
                              <td className="px-4 py-2">
                                <Badge variant={
                                  item.status === 'received' ? 'default' :
                                  item.status === 'fulfilled' ? 'secondary' : 'outline'
                                }>
                                  {formatStatus(item.status)}
                                </Badge>
                              </td>
                              <td className="px-4 py-2">{formatDate(item.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {report.data.data.length > 3 && (
                      <div className="p-2 text-center text-sm text-gray-500 border-t">
                        And {report.data.data.length - 3} more entries...
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {reports.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No reports generated yet. Create your first report above.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};