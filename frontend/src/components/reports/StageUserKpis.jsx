import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, TrendingUp, Users, Layers } from "lucide-react";
import { toast } from "sonner";
import { StageKpiCard } from "./StageKpiCard";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = BACKEND_URL + "/api";

export function StageUserKpis() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openStages, setOpenStages] = useState({});

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch(API + "/stats/stage-user-kpis", {
          credentials: "include",
        });
        if (res.ok) {
          const result = await res.json();
          setData(result);
          const openState = {};
          for (let i = 0; i < result.stages.length; i++) {
            openState[result.stages[i].stage_id] = true;
          }
          setOpenStages(openState);
        }
      } catch (err) {
        toast.error("Failed to load stage KPIs");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  function toggleStage(stageId) {
    setOpenStages(function(prev) {
      const newState = Object.assign({}, prev);
      newState[stageId] = !prev[stageId];
      return newState;
    });
  }

  if (loading) {
    return <LoadingState />;
  }

  if (!data || !data.stages || data.stages.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-4" data-testid="stage-user-kpis">
      <SummaryCards summary={data.summary} />
      <StageList 
        stages={data.stages} 
        openStages={openStages} 
        toggleStage={toggleStage} 
      />
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="h-32 bg-muted/30 animate-pulse rounded-lg" />
      <div className="h-32 bg-muted/30 animate-pulse rounded-lg" />
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-8 text-center text-muted-foreground">
        <Layers className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No stage KPI data available yet</p>
        <p className="text-sm mt-2">Start tracking time to see metrics</p>
      </CardContent>
    </Card>
  );
}

function SummaryCards({ summary }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <SummaryCard 
        icon={Layers} 
        iconColor="text-primary" 
        label="Stages" 
        value={summary.total_stages} 
      />
      <SummaryCard 
        icon={Users} 
        iconColor="text-blue-400" 
        label="Workers" 
        value={summary.total_users_tracked} 
      />
      <SummaryCard 
        icon={Clock} 
        iconColor="text-green-400" 
        label="Total Hours" 
        value={summary.total_hours + "h"} 
      />
      <SummaryCard 
        icon={TrendingUp} 
        iconColor="text-purple-400" 
        label="Total Items" 
        value={summary.total_items} 
      />
    </div>
  );
}

function SummaryCard({ icon: Icon, iconColor, label, value }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={"w-4 h-4 " + iconColor} />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function StageList({ stages, openStages, toggleStage }) {
  return (
    <div className="space-y-3">
      {stages.map(function(stage) {
        return (
          <StageKpiCard
            key={stage.stage_id}
            stage={stage}
            isOpen={openStages[stage.stage_id]}
            onToggle={function() { toggleStage(stage.stage_id); }}
          />
        );
      })}
    </div>
  );
}
