import { useState, useEffect } from 'react';
import { API } from '@/utils/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { 
  Settings, GitBranch, List, Plus, Trash2, Edit, GripVertical,
  Save, ChevronUp, ChevronDown, Palette, FileText, Zap
} from 'lucide-react';

const fieldTypes = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Text Area' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'percent', label: 'Percent' },
  { value: 'date', label: 'Date' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'picklist', label: 'Picklist' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'url', label: 'URL' }
];

const objectTypes = [
  { value: 'account', label: 'Account' },
  { value: 'contact', label: 'Contact' },
  { value: 'lead', label: 'Lead' },
  { value: 'opportunity', label: 'Opportunity' },
  { value: 'customer_crm', label: 'Customer (CRM)' }
];

const forecastCategories = [
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'best_case', label: 'Best Case' },
  { value: 'commit', label: 'Commit' },
  { value: 'closed', label: 'Closed' },
  { value: 'omitted', label: 'Omitted' }
];

export default function CRMSetupPage() {
  const [stages, setStages] = useState([]);
  const [picklists, setPicklists] = useState([]);
  const [customFields, setCustomFields] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Dialog states
  const [stageDialog, setStageDialog] = useState({ open: false, data: null });
  const [picklistDialog, setPicklistDialog] = useState({ open: false, data: null });
  const [fieldDialog, setFieldDialog] = useState({ open: false, data: null });
  const [optionDialog, setOptionDialog] = useState({ open: false, picklistId: null, data: null });

  useEffect(() => {
    fetchAllConfig();
  }, []);

  const fetchAllConfig = async () => {
    try {
      setLoading(true);
      const [stagesRes, picklistsRes, fieldsRes] = await Promise.all([
        fetch(`${API}/crm/admin/stages`, { credentials: 'include' }),
        fetch(`${API}/crm/admin/picklists`, { credentials: 'include' }),
        fetch(`${API}/crm/admin/fields`, { credentials: 'include' })
      ]);
      
      const stagesData = await stagesRes.json();
      const picklistsData = await picklistsRes.json();
      const fieldsData = await fieldsRes.json();
      
      setStages(stagesData.stages || []);
      setPicklists(picklistsData.picklists || []);
      setCustomFields(fieldsData.fields || []);
    } catch (error) {
      toast.error("Failed to load configuration");
    } finally {
      setLoading(false);
    }
  };

  // ==================== STAGES ====================
  
  const saveStage = async () => {
    const data = stageDialog.data;
    try {
      const isNew = !data.existing;
      const url = isNew 
        ? `${API}/crm/admin/stages`
        : `${API}/crm/admin/stages/${data.stage_id}`;
      
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          stage_id: data.stage_id,
          name: data.name,
          probability: parseInt(data.probability),
          forecast_category: data.forecast_category,
          order: parseInt(data.order),
          color: data.color,
          is_closed: data.is_closed,
          is_won: data.is_won
        })
      });
      
      if (!res.ok) throw new Error('Failed to save stage');
      
      toast.success(isNew ? "Stage created" : "Stage updated");
      setStageDialog({ open: false, data: null });
      fetchAllConfig();
    } catch (error) {
      toast.error("Failed to save stage");
    }
  };

  const deleteStage = async (stageId) => {
    if (!confirm('Are you sure you want to deactivate this stage?')) return;
    try {
      await fetch(`${API}/crm/admin/stages/${stageId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      toast.success("Stage deactivated");
      fetchAllConfig();
    } catch (error) {
      toast.error("Failed to delete stage");
    }
  };

  const moveStage = async (index, direction) => {
    const newStages = [...stages];
    const [removed] = newStages.splice(index, 1);
    newStages.splice(index + direction, 0, removed);
    
    const stageOrder = newStages.map(s => s.stage_id);
    
    try {
      await fetch(`${API}/crm/admin/stages/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ stage_order: stageOrder })
      });
      setStages(newStages);
    } catch (error) {
      toast.error("Failed to reorder stages");
    }
  };

  // ==================== PICKLISTS ====================

  const savePicklistOption = async () => {
    const { picklistId, data } = optionDialog;
    try {
      await fetch(`${API}/crm/admin/picklists/${picklistId}/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      toast.success("Option added");
      setOptionDialog({ open: false, picklistId: null, data: null });
      fetchAllConfig();
    } catch (error) {
      toast.error("Failed to add option");
    }
  };

  const deletePicklistOption = async (picklistId, optionValue) => {
    if (!confirm('Deactivate this option?')) return;
    try {
      await fetch(`${API}/crm/admin/picklists/${picklistId}/options/${optionValue}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      toast.success("Option deactivated");
      fetchAllConfig();
    } catch (error) {
      toast.error("Failed to delete option");
    }
  };

  // ==================== CUSTOM FIELDS ====================

  const saveCustomField = async () => {
    const data = fieldDialog.data;
    try {
      const isNew = !data.field_id;
      const url = isNew 
        ? `${API}/crm/admin/fields`
        : `${API}/crm/admin/fields/${data.field_id}`;
      
      const payload = {
        object_type: data.object_type,
        field_name: data.field_name,
        label: data.label,
        field_type: data.field_type,
        description: data.description,
        required: data.required || false,
        visible_on_list: data.visible_on_list || false
      };
      
      if (data.field_type === 'picklist' && data.picklist_options) {
        payload.picklist_options = data.picklist_options;
      }
      
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to save field');
      }
      
      toast.success(isNew ? "Field created" : "Field updated");
      setFieldDialog({ open: false, data: null });
      fetchAllConfig();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const deleteCustomField = async (fieldId) => {
    if (!confirm('Deactivate this field?')) return;
    try {
      await fetch(`${API}/crm/admin/fields/${fieldId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      toast.success("Field deactivated");
      fetchAllConfig();
    } catch (error) {
      toast.error("Failed to delete field");
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading configuration...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="crm-setup-page">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6" />
          CRM Setup
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure pipeline stages, picklists, custom fields, and automation
        </p>
      </div>

      <Tabs defaultValue="stages">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="stages" className="flex items-center gap-1">
            <GitBranch className="h-4 w-4" />
            Stages
          </TabsTrigger>
          <TabsTrigger value="picklists" className="flex items-center gap-1">
            <List className="h-4 w-4" />
            Picklists
          </TabsTrigger>
          <TabsTrigger value="fields" className="flex items-center gap-1">
            <FileText className="h-4 w-4" />
            Custom Fields
          </TabsTrigger>
          <TabsTrigger value="automation" className="flex items-center gap-1">
            <Zap className="h-4 w-4" />
            Automation
          </TabsTrigger>
        </TabsList>

        {/* STAGES TAB */}
        <TabsContent value="stages" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Pipeline Stages</CardTitle>
                <CardDescription>Define and order your opportunity stages</CardDescription>
              </div>
              <Button onClick={() => setStageDialog({ 
                open: true, 
                data: { 
                  stage_id: '', 
                  name: '', 
                  probability: 10, 
                  forecast_category: 'pipeline',
                  order: stages.length + 1,
                  color: '#6b7280',
                  is_closed: false,
                  is_won: false
                }
              })}>
                <Plus className="h-4 w-4 mr-1" />
                Add Stage
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {stages.map((stage, idx) => (
                  <div 
                    key={stage.stage_id}
                    className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex flex-col gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6"
                        disabled={idx === 0}
                        onClick={() => moveStage(idx, -1)}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6"
                        disabled={idx === stages.length - 1}
                        onClick={() => moveStage(idx, 1)}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </div>
                    <div 
                      className="w-4 h-4 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: stage.color }}
                    />
                    <div className="flex-1">
                      <div className="font-medium">{stage.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {stage.probability}% • {stage.forecast_category}
                        {stage.is_closed && (
                          <Badge variant="outline" className="ml-2">
                            {stage.is_won ? 'Won' : 'Lost'}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => setStageDialog({ open: true, data: { ...stage, existing: true } })}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {!stage.is_closed && (
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => deleteStage(stage.stage_id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PICKLISTS TAB */}
        <TabsContent value="picklists" className="space-y-4">
          {picklists.map(picklist => (
            <Card key={picklist.picklist_id}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-base">{picklist.name}</CardTitle>
                  <CardDescription className="text-xs">
                    {picklist.picklist_id} • Used by: {picklist.object_types?.join(', ')}
                  </CardDescription>
                </div>
                <Button 
                  size="sm"
                  onClick={() => setOptionDialog({ 
                    open: true, 
                    picklistId: picklist.picklist_id,
                    data: { value: '', label: '', color: '#6b7280', order: (picklist.options?.length || 0) + 1 }
                  })}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Option
                </Button>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {picklist.options?.filter(o => o.is_active !== false).map(option => (
                    <Badge 
                      key={option.value} 
                      variant="secondary"
                      className="flex items-center gap-1 px-3 py-1"
                      style={option.color ? { backgroundColor: option.color + '20', borderColor: option.color } : {}}
                    >
                      {option.color && (
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: option.color }} />
                      )}
                      {option.label}
                      <button
                        className="ml-1 hover:text-red-500"
                        onClick={() => deletePicklistOption(picklist.picklist_id, option.value)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* CUSTOM FIELDS TAB */}
        <TabsContent value="fields" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Custom Fields</CardTitle>
                <CardDescription>Add custom fields to CRM objects</CardDescription>
              </div>
              <Button onClick={() => setFieldDialog({ 
                open: true, 
                data: { 
                  object_type: 'opportunity',
                  field_name: '',
                  label: '',
                  field_type: 'text',
                  description: '',
                  required: false,
                  visible_on_list: false,
                  picklist_options: []
                }
              })}>
                <Plus className="h-4 w-4 mr-1" />
                Add Field
              </Button>
            </CardHeader>
            <CardContent>
              {customFields.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No custom fields defined yet. Click "Add Field" to create one.
                </div>
              ) : (
                <div className="space-y-2">
                  {customFields.map(field => (
                    <div 
                      key={field.field_id}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                    >
                      <div>
                        <div className="font-medium">
                          {field.label}
                          {field.required && <span className="text-red-500 ml-1">*</span>}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {field.object_type} • {field.field_type} • {field.field_name}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => setFieldDialog({ open: true, data: field })}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => deleteCustomField(field.field_id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AUTOMATION TAB */}
        <TabsContent value="automation" className="space-y-4">
          {/* Lead Assignment Rules */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Lead Assignment Rules</CardTitle>
                <CardDescription>Automatically assign new leads to sales reps</CardDescription>
              </div>
              <Button onClick={() => setAssignmentDialog({ 
                open: true, 
                data: { 
                  name: '', 
                  description: '',
                  method: 'round_robin',
                  conditions: {},
                  assignee_user_ids: [],
                  priority: 100,
                  status: 'active'
                }
              })}>
                <Plus className="h-4 w-4 mr-1" />
                Add Rule
              </Button>
            </CardHeader>
            <CardContent>
              {assignmentRules.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No lead assignment rules configured.
                  <br />
                  <span className="text-sm">Create rules to automatically assign leads based on territory, source, or round-robin</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {assignmentRules.map((rule) => (
                    <div 
                      key={rule.rule_id}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Zap className={`h-5 w-5 ${rule.status === 'active' ? 'text-green-500' : 'text-gray-400'}`} />
                        <div>
                          <div className="font-medium">{rule.name}</div>
                          <div className="text-sm text-muted-foreground">
                            Method: {rule.method?.replace('_', ' ')} • Priority: {rule.priority}
                            {rule.assignees?.length > 0 && (
                              <span className="ml-2">
                                • {rule.assignees.length} assignee(s)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={rule.status === 'active' ? 'default' : 'secondary'}>
                          {rule.status}
                        </Badge>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => setAssignmentDialog({ open: true, data: { ...rule, existing: true } })}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => deleteAssignmentRule(rule.rule_id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stale Opportunity Rules */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Stale Opportunity Reminders</CardTitle>
                <CardDescription>Get notified when opportunities have no activity</CardDescription>
              </div>
              <Button onClick={() => setStaleDialog({ 
                open: true, 
                data: { 
                  name: '', 
                  description: '',
                  days_threshold: 14,
                  applicable_stages: [],
                  notify_owner: true,
                  additional_notify_user_ids: [],
                  status: 'active'
                }
              })}>
                <Plus className="h-4 w-4 mr-1" />
                Add Rule
              </Button>
            </CardHeader>
            <CardContent>
              {staleRules.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No stale opportunity rules configured.
                  <br />
                  <span className="text-sm">Create rules to receive reminders for opportunities without recent activity</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {staleRules.map((rule) => (
                    <div 
                      key={rule.rule_id}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Zap className={`h-5 w-5 ${rule.status === 'active' ? 'text-orange-500' : 'text-gray-400'}`} />
                        <div>
                          <div className="font-medium">{rule.name}</div>
                          <div className="text-sm text-muted-foreground">
                            Threshold: {rule.days_threshold} days
                            {rule.applicable_stages?.length > 0 && (
                              <span className="ml-2">
                                • Stages: {rule.applicable_stages.join(', ')}
                              </span>
                            )}
                            {rule.notify_owner && <span className="ml-2">• Notifies owner</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={rule.status === 'active' ? 'default' : 'secondary'}>
                          {rule.status}
                        </Badge>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => setStaleDialog({ open: true, data: { ...rule, existing: true } })}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => deleteStaleRule(rule.rule_id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Manual Trigger */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Manual Triggers</CardTitle>
              <CardDescription>Run automation checks manually</CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                variant="outline"
                onClick={runStaleCheck}
                disabled={runningStaleCheck}
              >
                <Zap className="h-4 w-4 mr-2" />
                {runningStaleCheck ? 'Running...' : 'Run Stale Opportunity Check Now'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* STAGE DIALOG */}
      <Dialog open={stageDialog.open} onOpenChange={(open) => !open && setStageDialog({ open: false, data: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{stageDialog.data?.existing ? 'Edit Stage' : 'New Stage'}</DialogTitle>
          </DialogHeader>
          {stageDialog.data && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Stage ID</Label>
                  <Input 
                    value={stageDialog.data.stage_id}
                    onChange={(e) => setStageDialog({
                      ...stageDialog,
                      data: { ...stageDialog.data, stage_id: e.target.value.toLowerCase().replace(/\s+/g, '_') }
                    })}
                    disabled={stageDialog.data.existing}
                    placeholder="e.g., demo_scheduled"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Display Name</Label>
                  <Input 
                    value={stageDialog.data.name}
                    onChange={(e) => setStageDialog({
                      ...stageDialog,
                      data: { ...stageDialog.data, name: e.target.value }
                    })}
                    placeholder="e.g., Demo Scheduled"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Probability (%)</Label>
                  <Input 
                    type="number"
                    min="0"
                    max="100"
                    value={stageDialog.data.probability}
                    onChange={(e) => setStageDialog({
                      ...stageDialog,
                      data: { ...stageDialog.data, probability: e.target.value }
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Forecast Category</Label>
                  <Select 
                    value={stageDialog.data.forecast_category}
                    onValueChange={(v) => setStageDialog({
                      ...stageDialog,
                      data: { ...stageDialog.data, forecast_category: v }
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {forecastCategories.map(c => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="flex gap-2">
                    <Input 
                      type="color"
                      value={stageDialog.data.color}
                      onChange={(e) => setStageDialog({
                        ...stageDialog,
                        data: { ...stageDialog.data, color: e.target.value }
                      })}
                      className="w-14 h-10 p-1"
                    />
                    <Input 
                      value={stageDialog.data.color}
                      onChange={(e) => setStageDialog({
                        ...stageDialog,
                        data: { ...stageDialog.data, color: e.target.value }
                      })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Order</Label>
                  <Input 
                    type="number"
                    min="1"
                    value={stageDialog.data.order}
                    onChange={(e) => setStageDialog({
                      ...stageDialog,
                      data: { ...stageDialog.data, order: e.target.value }
                    })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch 
                    checked={stageDialog.data.is_closed}
                    onCheckedChange={(v) => setStageDialog({
                      ...stageDialog,
                      data: { ...stageDialog.data, is_closed: v }
                    })}
                  />
                  <Label>Is Closed Stage</Label>
                </div>
                {stageDialog.data.is_closed && (
                  <div className="flex items-center gap-2">
                    <Switch 
                      checked={stageDialog.data.is_won}
                      onCheckedChange={(v) => setStageDialog({
                        ...stageDialog,
                        data: { ...stageDialog.data, is_won: v }
                      })}
                    />
                    <Label>Is Won</Label>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStageDialog({ open: false, data: null })}>
              Cancel
            </Button>
            <Button onClick={saveStage}>
              <Save className="h-4 w-4 mr-1" />
              Save Stage
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PICKLIST OPTION DIALOG */}
      <Dialog open={optionDialog.open} onOpenChange={(open) => !open && setOptionDialog({ open: false, picklistId: null, data: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Picklist Option</DialogTitle>
          </DialogHeader>
          {optionDialog.data && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Value (API name)</Label>
                <Input 
                  value={optionDialog.data.value}
                  onChange={(e) => setOptionDialog({
                    ...optionDialog,
                    data: { ...optionDialog.data, value: e.target.value.toLowerCase().replace(/\s+/g, '_') }
                  })}
                  placeholder="e.g., new_option"
                />
              </div>
              <div className="space-y-2">
                <Label>Label (Display name)</Label>
                <Input 
                  value={optionDialog.data.label}
                  onChange={(e) => setOptionDialog({
                    ...optionDialog,
                    data: { ...optionDialog.data, label: e.target.value }
                  })}
                  placeholder="e.g., New Option"
                />
              </div>
              <div className="space-y-2">
                <Label>Color (optional)</Label>
                <div className="flex gap-2">
                  <Input 
                    type="color"
                    value={optionDialog.data.color || '#6b7280'}
                    onChange={(e) => setOptionDialog({
                      ...optionDialog,
                      data: { ...optionDialog.data, color: e.target.value }
                    })}
                    className="w-14 h-10 p-1"
                  />
                  <Input 
                    value={optionDialog.data.color || ''}
                    onChange={(e) => setOptionDialog({
                      ...optionDialog,
                      data: { ...optionDialog.data, color: e.target.value }
                    })}
                    placeholder="#6b7280"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOptionDialog({ open: false, picklistId: null, data: null })}>
              Cancel
            </Button>
            <Button onClick={savePicklistOption} disabled={!optionDialog.data?.value || !optionDialog.data?.label}>
              Add Option
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CUSTOM FIELD DIALOG */}
      <Dialog open={fieldDialog.open} onOpenChange={(open) => !open && setFieldDialog({ open: false, data: null })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{fieldDialog.data?.field_id ? 'Edit Field' : 'New Custom Field'}</DialogTitle>
          </DialogHeader>
          {fieldDialog.data && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Object Type</Label>
                <Select 
                  value={fieldDialog.data.object_type}
                  onValueChange={(v) => setFieldDialog({
                    ...fieldDialog,
                    data: { ...fieldDialog.data, object_type: v }
                  })}
                  disabled={!!fieldDialog.data.field_id}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {objectTypes.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Field Name (API)</Label>
                  <Input 
                    value={fieldDialog.data.field_name}
                    onChange={(e) => setFieldDialog({
                      ...fieldDialog,
                      data: { ...fieldDialog.data, field_name: e.target.value.toLowerCase().replace(/\s+/g, '_') }
                    })}
                    disabled={!!fieldDialog.data.field_id}
                    placeholder="e.g., custom_field"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Label</Label>
                  <Input 
                    value={fieldDialog.data.label}
                    onChange={(e) => setFieldDialog({
                      ...fieldDialog,
                      data: { ...fieldDialog.data, label: e.target.value }
                    })}
                    placeholder="e.g., Custom Field"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Field Type</Label>
                <Select 
                  value={fieldDialog.data.field_type}
                  onValueChange={(v) => setFieldDialog({
                    ...fieldDialog,
                    data: { ...fieldDialog.data, field_type: v }
                  })}
                  disabled={!!fieldDialog.data.field_id}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {fieldTypes.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea 
                  value={fieldDialog.data.description || ''}
                  onChange={(e) => setFieldDialog({
                    ...fieldDialog,
                    data: { ...fieldDialog.data, description: e.target.value }
                  })}
                  placeholder="Help text for this field"
                />
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch 
                    checked={fieldDialog.data.required}
                    onCheckedChange={(v) => setFieldDialog({
                      ...fieldDialog,
                      data: { ...fieldDialog.data, required: v }
                    })}
                  />
                  <Label>Required</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch 
                    checked={fieldDialog.data.visible_on_list}
                    onCheckedChange={(v) => setFieldDialog({
                      ...fieldDialog,
                      data: { ...fieldDialog.data, visible_on_list: v }
                    })}
                  />
                  <Label>Show in List View</Label>
                </div>
              </div>
              
              {fieldDialog.data.field_type === 'picklist' && (
                <div className="space-y-2">
                  <Label>Picklist Options (one per line: value|label)</Label>
                  <Textarea 
                    value={(fieldDialog.data.picklist_options || []).map(o => `${o.value}|${o.label}`).join('\n')}
                    onChange={(e) => {
                      const options = e.target.value.split('\n').filter(l => l.trim()).map((line, idx) => {
                        const [value, label] = line.split('|');
                        return { value: value?.trim() || '', label: label?.trim() || value?.trim() || '', order: idx + 1 };
                      });
                      setFieldDialog({
                        ...fieldDialog,
                        data: { ...fieldDialog.data, picklist_options: options }
                      });
                    }}
                    placeholder="option1|Option 1&#10;option2|Option 2"
                    rows={4}
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFieldDialog({ open: false, data: null })}>
              Cancel
            </Button>
            <Button 
              onClick={saveCustomField}
              disabled={!fieldDialog.data?.field_name || !fieldDialog.data?.label}
            >
              <Save className="h-4 w-4 mr-1" />
              Save Field
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
