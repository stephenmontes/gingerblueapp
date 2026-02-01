import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Truck, Users, Clock, FileText, ChevronDown, ChevronUp, Settings } from "lucide-react";
import { toast } from "sonner";
import { FulfillmentStageTab } from "@/components/fulfillment/FulfillmentStageTab";
import { FulfillmentSummary } from "@/components/fulfillment/FulfillmentSummary";
import { StageOrdersPopup } from "@/components/fulfillment/StageOrdersPopup";
import { FulfillmentTimerBanner } from "@/components/fulfillment/FulfillmentTimerBanner";
import { FulfillmentKpiBanner } from "@/components/fulfillment/FulfillmentKpiBanner";
import { OrderKpiReport } from "@/components/fulfillment/OrderKpiReport";
import { TimeEntryManager } from "@/components/fulfillment/TimeEntryManager";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function OrderFulfillment() {
  const [stages, setStages] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("fulfill_orders");
  const [popupStage, setPopupStage] = useState(null);
  const [timerVersion, setTimerVersion] = useState(0);
  const [showReport, setShowReport] = useState(false);
  const [showTimeManager, setShowTimeManager] = useState(false);

  useEffect(() => {
    loadData();
    // Auto-stop inactive timers on page load
    autoStopInactiveTimers();
  }, []);

  async function autoStopInactiveTimers() {
    try {
      await fetch(`${API}/fulfillment/timers/auto-stop-inactive`, {
        method: "POST",
        credentials: "include"
      });
    } catch (err) {
      // Silently fail - this is a background cleanup task
    }
  }

  function handleTimerChange() {
    setTimerVersion(v => v + 1);
    loadData();
  }

  async function loadData() {
    try {
      const [stagesRes, summaryRes] = await Promise.all([
        fetch(`${API}/fulfillment/stages`, { credentials: "include" }),
        fetch(`${API}/fulfillment/summary`, { credentials: "include" }),
      ]);

      if (stagesRes.ok) {
        const stagesData = await stagesRes.json();
        setStages(stagesData);
        if (stagesData.length > 0 && !activeTab) {
          setActiveTab(stagesData[0].stage_id);
        }
      }
      if (summaryRes.ok) {
        setSummary(await summaryRes.json());
      }
    } catch (err) {
      toast.error("Failed to load fulfillment data");
    } finally {
      setLoading(false);
    }
  }

  function getStageCount(stageId) {
    if (!summary?.stages) return 0;
    const stage = summary.stages.find(s => s.stage_id === stageId);
    return stage?.count || 0;
  }

  function handleStageCardClick(stage) {
    setPopupStage(stage);
  }

  function handleViewOrderFromPopup(order) {
    // Switch to the stage tab and the popup will close
    if (order.fulfillment_stage_id) {
      setActiveTab(order.fulfillment_stage_id);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6" data-testid="fulfillment-loading">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="order-fulfillment-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold flex items-center gap-3">
            <Truck className="w-8 h-8 text-primary" />
            Order Fulfillment
          </h1>
          <p className="text-muted-foreground mt-1">
            Track orders through print, mount, finish, and shipping stages
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={loadData} 
          className="gap-2"
          data-testid="refresh-fulfillment-btn"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* Active Timer Banner */}
      <FulfillmentTimerBanner onTimerChange={handleTimerChange} />

      {/* KPI Banner */}
      <FulfillmentKpiBanner />

      {/* Order KPI Report Toggle */}
      <div className="border border-border rounded-lg">
        <Button
          variant="ghost"
          onClick={() => setShowReport(!showReport)}
          className="w-full justify-between h-12"
          data-testid="toggle-order-report"
        >
          <span className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Order Time & Cost Report
          </span>
          {showReport ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
        
        {showReport && (
          <div className="p-4 pt-0">
            <OrderKpiReport />
          </div>
        )}
      </div>

      {/* Time Entry Manager Toggle (Admin/Manager only) */}
      <div className="border border-border rounded-lg">
        <Button
          variant="ghost"
          onClick={() => setShowTimeManager(!showTimeManager)}
          className="w-full justify-between h-12"
          data-testid="toggle-time-manager"
        >
          <span className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Time Entry Management (Admin)
          </span>
          {showTimeManager ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
        
        {showTimeManager && (
          <div className="p-4 pt-0">
            <TimeEntryManager />
          </div>
        )}
      </div>

      {/* Stage Tabs - Button Style with Stage Colors */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {stages.map((stage) => (
          <Button
            key={stage.stage_id}
            variant={activeTab === stage.stage_id ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab(stage.stage_id)}
            className={`flex items-center gap-2 whitespace-nowrap rounded-lg transition-all`}
            style={activeTab === stage.stage_id ? {
              backgroundColor: stage.color,
              borderColor: stage.color
            } : {
              borderColor: `${stage.color}50`
            }}
            data-testid={`tab-${stage.stage_id}`}
          >
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: activeTab === stage.stage_id ? '#fff' : stage.color }}
            />
            {stage.name}
            <Badge 
              variant="secondary" 
              className="text-xs"
              style={activeTab === stage.stage_id ? { backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff' } : {}}
            >
              {getStageCount(stage.stage_id)}
            </Badge>
          </Button>
        ))}
      </div>

      {/* Stage Content */}
      {stages.map((stage) => (
        activeTab === stage.stage_id && (
          <FulfillmentStageTab
            key={stage.stage_id}
            stage={stage}
            stages={stages}
            onRefresh={loadData}
            onTimerChange={handleTimerChange}
          />
        )
      ))}

      {/* Stage Orders Popup */}
      <StageOrdersPopup 
        stage={popupStage} 
        onClose={() => setPopupStage(null)}
        onViewOrder={handleViewOrderFromPopup}
      />
    </div>
  );
}
