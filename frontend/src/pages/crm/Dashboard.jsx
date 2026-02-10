import { useState, useEffect } from 'react';
import { API } from '@/utils/api';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { toast } from "sonner";
import { 
  LayoutDashboard, TrendingUp, DollarSign, Users, 
  Target, Clock, Calendar, AlertTriangle, CheckCircle2, ArrowRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function CRMDashboard() {
  const [period, setPeriod] = useState('this_month');
  const [dashboard, setDashboard] = useState(null);
  const [staleOpps, setStaleOpps] = useState([]);
  const [closingSoon, setClosingSoon] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboardData();
  }, [period]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [dashRes, staleRes, closingRes] = await Promise.all([
        fetch(`${API}/crm/reports/dashboard?period=${period}`, { credentials: 'include' }),
        fetch(`${API}/crm/reports/stale-opportunities?days=14`, { credentials: 'include' }),
        fetch(`${API}/crm/reports/closing-soon?days=30`, { credentials: 'include' })
      ]);
      
      const dashData = await dashRes.json();
      const staleData = await staleRes.json();
      const closingData = await closingRes.json();
      
      setDashboard(dashData);
      setStaleOpps(staleData.opportunities || []);
      setClosingSoon(closingData.opportunities || []);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load dashboard", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD', 
      maximumFractionDigits: 0 
    }).format(amount || 0);
  };

  const formatPercent = (value) => `${value?.toFixed(1) || 0}%`;

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading dashboard...</div>
      </div>
    );
  }

  const metrics = dashboard?.metrics || {};
  const pipelineByStage = dashboard?.pipeline_by_stage || {};

  return (
    <div className="p-6 space-y-6" data-testid="crm-dashboard">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6" />
            Sales Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            {dashboard?.period_label || 'This Month'} Overview
          </p>
        </div>
        
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="this_week">This Week</SelectItem>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="this_quarter">This Quarter</SelectItem>
            <SelectItem value="this_year">This Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm opacity-90">Total Pipeline</div>
                <div className="text-2xl font-bold">{formatCurrency(metrics.total_pipeline)}</div>
              </div>
              <DollarSign className="h-8 w-8 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm opacity-90">Closed Won</div>
                <div className="text-2xl font-bold">{formatCurrency(metrics.closed_won)}</div>
                <div className="text-xs opacity-75">{metrics.closed_won_count} deals</div>
              </div>
              <CheckCircle2 className="h-8 w-8 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm opacity-90">Win Rate</div>
                <div className="text-2xl font-bold">{formatPercent(metrics.win_rate)}</div>
              </div>
              <Target className="h-8 w-8 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm opacity-90">Weighted Pipeline</div>
                <div className="text-2xl font-bold">{formatCurrency(metrics.weighted_pipeline)}</div>
              </div>
              <TrendingUp className="h-8 w-8 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold">{metrics.open_opportunities}</div>
            <div className="text-sm text-muted-foreground">Open Opps</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold">{metrics.new_leads}</div>
            <div className="text-sm text-muted-foreground">New Leads</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold">{metrics.converted_leads}</div>
            <div className="text-sm text-muted-foreground">Converted</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold">{formatPercent(metrics.conversion_rate)}</div>
            <div className="text-sm text-muted-foreground">Conversion</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-red-500">{metrics.tasks_overdue}</div>
            <div className="text-sm text-muted-foreground">Tasks Overdue</div>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline by Stage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Pipeline by Stage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(pipelineByStage).map(([stage, data]) => {
              const stageNames = {
                prospecting: 'Prospecting',
                qualification: 'Qualification',
                needs_analysis: 'Needs Analysis',
                proposal: 'Proposal',
                negotiation: 'Negotiation'
              };
              const stageColors = {
                prospecting: 'bg-gray-500',
                qualification: 'bg-blue-500',
                needs_analysis: 'bg-purple-500',
                proposal: 'bg-yellow-500',
                negotiation: 'bg-green-500'
              };
              const maxAmount = Math.max(...Object.values(pipelineByStage).map(d => d.amount || 0), 1);
              const width = ((data.amount || 0) / maxAmount * 100);
              
              return (
                <div key={stage} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{stageNames[stage] || stage}</span>
                    <span className="text-muted-foreground">
                      {data.count || 0} deals · {formatCurrency(data.amount || 0)}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${stageColors[stage] || 'bg-gray-500'} rounded-full transition-all`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Stale Opportunities */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Stale Opportunities
            </CardTitle>
            <Badge variant="secondary">{staleOpps.length}</Badge>
          </CardHeader>
          <CardContent>
            {staleOpps.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">
                No stale opportunities
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {staleOpps.slice(0, 5).map(opp => (
                  <div 
                    key={opp.opportunity_id}
                    className="p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted"
                    onClick={() => navigate('/crm/opportunities')}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-sm">{opp.name}</div>
                        <div className="text-xs text-muted-foreground">{opp.account_name}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-green-600">{formatCurrency(opp.amount)}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(opp.updated_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {staleOpps.length > 5 && (
                  <Button 
                    variant="ghost" 
                    className="w-full text-sm"
                    onClick={() => navigate('/crm/opportunities')}
                  >
                    View all {staleOpps.length} stale opportunities
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Closing Soon */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-500" />
              Closing This Month
            </CardTitle>
            <div className="text-right">
              <Badge variant="secondary">{closingSoon.length} deals</Badge>
              <div className="text-xs text-muted-foreground">{formatCurrency(closingSoon.reduce((s, o) => s + (o.amount || 0), 0))}</div>
            </div>
          </CardHeader>
          <CardContent>
            {closingSoon.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">
                No deals closing soon
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {closingSoon.slice(0, 5).map(opp => (
                  <div 
                    key={opp.opportunity_id}
                    className="p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted"
                    onClick={() => navigate('/crm/opportunities')}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-sm">{opp.name}</div>
                        <div className="text-xs text-muted-foreground">{opp.account_name}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-green-600">{formatCurrency(opp.amount)}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {opp.close_date}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {closingSoon.length > 5 && (
                  <Button 
                    variant="ghost" 
                    className="w-full text-sm"
                    onClick={() => navigate('/crm/opportunities')}
                  >
                    View all {closingSoon.length} opportunities
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate('/crm/leads')}>
              <Users className="h-4 w-4 mr-2" />
              View Leads
            </Button>
            <Button variant="outline" onClick={() => navigate('/crm/accounts')}>
              <Target className="h-4 w-4 mr-2" />
              View Accounts
            </Button>
            <Button variant="outline" onClick={() => navigate('/crm/opportunities')}>
              <TrendingUp className="h-4 w-4 mr-2" />
              View Pipeline
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
