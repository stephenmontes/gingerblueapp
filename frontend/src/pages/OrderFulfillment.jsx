import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Truck } from "lucide-react";
import { toast } from "sonner";
import { FulfillmentStageTab } from "@/components/fulfillment/FulfillmentStageTab";
import { FulfillmentSummary } from "@/components/fulfillment/FulfillmentSummary";
import { StageOrdersPopup } from "@/components/fulfillment/StageOrdersPopup";
import { FulfillmentTimerBanner } from "@/components/fulfillment/FulfillmentTimerBanner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function OrderFulfillment() {
  const [stages, setStages] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("fulfill_orders");
  const [popupStage, setPopupStage] = useState(null);
  const [timerVersion, setTimerVersion] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

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

      {/* Summary Cards - Now Clickable */}
      <FulfillmentSummary summary={summary} onStageClick={handleStageCardClick} />

      {/* Stage Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted/50 flex-wrap h-auto gap-1 p-1">
          {stages.map((stage) => (
            <TabsTrigger
              key={stage.stage_id}
              value={stage.stage_id}
              className="gap-2 data-[state=active]:bg-background"
              data-testid={`tab-${stage.stage_id}`}
            >
              <div 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: stage.color }}
              />
              {stage.name}
              <Badge 
                variant="secondary" 
                className="ml-1 text-xs h-5 px-1.5"
              >
                {getStageCount(stage.stage_id)}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {stages.map((stage) => (
          <TabsContent key={stage.stage_id} value={stage.stage_id}>
            <FulfillmentStageTab
              stage={stage}
              stages={stages}
              onRefresh={loadData}
            />
          </TabsContent>
        ))}
      </Tabs>

      {/* Stage Orders Popup */}
      <StageOrdersPopup 
        stage={popupStage} 
        onClose={() => setPopupStage(null)}
        onViewOrder={handleViewOrderFromPopup}
      />
    </div>
  );
}
