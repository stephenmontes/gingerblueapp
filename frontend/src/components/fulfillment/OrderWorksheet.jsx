import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowRight, Check, Printer, X, Package, User, Clock, Play, Pause, StopCircle } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Size sort order
const SIZE_ORDER = { 'S': 0, 'L': 1, 'XL': 2, 'HS': 3, 'HX': 4, 'XX': 5, 'XXX': 6 };

function getSizeFromSku(sku) {
  if (!sku) return "—";
  const parts = sku.replace(/_/g, '-').replace(/\./g, '-').split('-').filter(p => p.trim());
  if (parts.length >= 2) return parts[parts.length - 2].toUpperCase();
  return parts[0]?.toUpperCase() || "—";
}

function sortBySize(items) {
  return [...items].sort((a, b) => {
    const sizeA = getSizeFromSku(a.sku);
    const sizeB = getSizeFromSku(b.sku);
    const orderA = SIZE_ORDER[sizeA] ?? 99;
    const orderB = SIZE_ORDER[sizeB] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return sizeA.localeCompare(sizeB);
  });
}

export function OrderWorksheet({ order, stages, currentStage, onClose, onMoveToNextStage, onRefresh, onTimerChange }) {
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [activeTimer, setActiveTimer] = useState(null);
  const [timerLoading, setTimerLoading] = useState(false);

  useEffect(() => {
    if (order) {
      const orderItems = order.items || order.line_items || [];
      const sorted = sortBySize(orderItems.map((item, idx) => ({
        ...item,
        item_index: idx,
        qty_done: item.qty_done || 0,
        is_complete: item.is_complete || false
      })));
      setItems(sorted);
      checkActiveTimer();
    }
  }, [order]);

  async function checkActiveTimer() {
    try {
      const res = await fetch(`${API}/fulfillment/user/active-timer`, { credentials: "include" });
      if (res.ok) {
        const timers = await res.json();
        setActiveTimer(timers.length > 0 ? timers[0] : null);
      }
    } catch (err) {
      console.error("Failed to check timer:", err);
    }
  }

  async function handleStartTimer() {
    if (!currentStage || !order) return;
    setTimerLoading(true);
    try {
      const orderNum = order.order_number || order.order_id?.slice(-8);
      const res = await fetch(
        `${API}/fulfillment/stages/${currentStage.stage_id}/start-timer?order_id=${order.order_id}&order_number=${encodeURIComponent(orderNum)}`, 
        { method: "POST", credentials: "include" }
      );
      if (res.ok) {
        toast.success(`Timer started for Order #${orderNum}`);
        checkActiveTimer();
        onTimerChange?.();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to start timer");
      }
    } catch (err) {
      toast.error("Failed to start timer");
    } finally {
      setTimerLoading(false);
    }
  }

  async function handlePauseTimer() {
    if (!activeTimer) return;
    try {
      const res = await fetch(`${API}/fulfillment/stages/${activeTimer.stage_id}/pause-timer`, {
        method: "POST", credentials: "include"
      });
      if (res.ok) {
        toast.info("Timer paused");
        checkActiveTimer();
        onTimerChange?.();
      }
    } catch (err) {
      toast.error("Failed to pause timer");
    }
  }

  async function handleResumeTimer() {
    if (!activeTimer) return;
    try {
      const res = await fetch(`${API}/fulfillment/stages/${activeTimer.stage_id}/resume-timer`, {
        method: "POST", credentials: "include"
      });
      if (res.ok) {
        toast.success("Timer resumed");
        checkActiveTimer();
        onTimerChange?.();
      }
    } catch (err) {
      toast.error("Failed to resume timer");
    }
  }

  async function handleStopTimer() {
    if (!activeTimer) return;
    const itemsCompleted = items.filter(i => i.is_complete).length;
    try {
      const res = await fetch(`${API}/fulfillment/stages/${activeTimer.stage_id}/stop-timer?orders_processed=1&items_processed=${itemsCompleted}`, {
        method: "POST", credentials: "include"
      });
      if (res.ok) {
        toast.success("Timer stopped");
        setActiveTimer(null);
        onTimerChange?.();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to stop timer");
      }
    } catch (err) {
      toast.error("Failed to stop timer");
    }
  }

  if (!order) return null;

  const allComplete = items.length > 0 && items.every(item => item.is_complete);
  const completedCount = items.filter(item => item.is_complete).length;
  const currentStageIndex = stages.findIndex(s => s.stage_id === currentStage?.stage_id);
  const nextStage = stages[currentStageIndex + 1];
  
  // Timer requirement check
  const isOrdersStage = currentStage?.stage_id === "fulfill_orders";
  const hasActiveTimerForStage = activeTimer && activeTimer.stage_id === currentStage?.stage_id;
  const timerRequired = !isOrdersStage;

  function requiresTimer() {
    if (!timerRequired) return false;
    if (!hasActiveTimerForStage) {
      toast.error("Start a timer before completing tasks", {
        icon: <Clock className="w-4 h-4" />,
        description: "Timer is required to track your work"
      });
      return true;
    }
    return false;
  }

  async function handleSaveProgress() {
    if (requiresTimer()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/fulfillment/orders/${order.order_id}/worksheet`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ items: items.map(i => ({ 
          item_index: i.item_index, 
          qty_done: i.qty_done, 
          is_complete: i.is_complete 
        }))})
      });
      if (res.ok) {
        toast.success("Progress saved");
        onRefresh();
      } else {
        toast.error("Failed to save progress");
      }
    } catch (err) {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleMoveToNext() {
    if (requiresTimer()) return;
    if (!allComplete) {
      toast.error("Complete all items before moving to next stage");
      return;
    }
    await handleSaveProgressInternal();
    onMoveToNextStage(order.order_id);
    onClose();
  }
  
  // Internal save without timer check (called from handleMoveToNext after timer is validated)
  async function handleSaveProgressInternal() {
    setSaving(true);
    try {
      const res = await fetch(`${API}/fulfillment/orders/${order.order_id}/worksheet`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ items: items.map(i => ({ 
          item_index: i.item_index, 
          qty_done: i.qty_done, 
          is_complete: i.is_complete 
        }))})
      });
      if (res.ok) {
        onRefresh();
      }
    } catch (err) {
      console.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function updateItem(index, field, value) {
    if (timerRequired && !hasActiveTimerForStage) {
      toast.error("Start a timer before making changes");
      return;
    }
    setItems(prev => prev.map((item, i) => 
      i === index ? { ...item, [field]: value } : item
    ));
  }

  function markItemComplete(index, complete) {
    if (timerRequired && !hasActiveTimerForStage) {
      toast.error("Start a timer before marking items complete");
      return;
    }
    setItems(prev => prev.map((item, i) => 
      i === index ? { ...item, is_complete: complete, qty_done: complete ? (item.qty || item.quantity || 1) : item.qty_done } : item
    ));
  }

  function markAllComplete() {
    if (timerRequired && !hasActiveTimerForStage) {
      toast.error("Start a timer before marking items complete");
      return;
    }
    setItems(prev => prev.map(item => ({ 
      ...item, 
      is_complete: true, 
      qty_done: item.qty || item.quantity || 1 
    })));
  }

  return (
    <Dialog open={!!order} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Package className="w-5 h-5 text-primary" />
            Order Worksheet
            <Badge variant="outline" className="font-mono">
              #{order.order_number || order.order_id?.slice(-8)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <OrderInfo order={order} currentStage={currentStage} />
        
        {/* Timer Section - Only for non-Orders stages */}
        {currentStage?.stage_id !== "fulfill_orders" && (
          <WorksheetTimer 
            activeTimer={activeTimer}
            currentStage={currentStage}
            timerLoading={timerLoading}
            onStart={handleStartTimer}
            onPause={handlePauseTimer}
            onResume={handleResumeTimer}
            onStop={handleStopTimer}
          />
        )}
        
        <ProgressBar completed={completedCount} total={items.length} />

        <div className="flex justify-between items-center mb-2">
          <p className="text-sm text-muted-foreground">
            Items sorted by size: S → L → XL → HS → HX → XX → XXX
          </p>
          <Button variant="outline" size="sm" onClick={markAllComplete}>
            <Check className="w-4 h-4 mr-1" /> Mark All Done
          </Button>
        </div>

        <ItemsWorksheet items={items} onUpdateItem={updateItem} onMarkComplete={markItemComplete} />

        <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
          <Button variant="outline" onClick={() => window.print()} className="gap-2">
            <Printer className="w-4 h-4" /> Print
          </Button>
          <Button variant="secondary" onClick={handleSaveProgress} disabled={saving}>
            Save Progress
          </Button>
          {nextStage && (
            <Button 
              onClick={handleMoveToNext} 
              disabled={!allComplete}
              className={allComplete ? "bg-green-600 hover:bg-green-700" : ""}
            >
              <ArrowRight className="w-4 h-4 mr-2" />
              Move to {nextStage.name}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrderInfo({ order, currentStage }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-3 bg-muted/30 rounded-lg mb-4">
      <div>
        <p className="text-xs text-muted-foreground">Customer</p>
        <p className="font-medium">{order.customer_name || "N/A"}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Email</p>
        <p className="text-sm">{order.customer_email || "—"}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Batch</p>
        <p className="font-medium">{order.batch_name || "—"}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Current Stage</p>
        <Badge style={{ backgroundColor: currentStage?.color + "20", color: currentStage?.color }}>
          {currentStage?.name || order.fulfillment_stage_name}
        </Badge>
      </div>
    </div>
  );
}

function ProgressBar({ completed, total }) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="mb-4">
      <div className="flex justify-between text-sm mb-1">
        <span>{completed} of {total} items complete</span>
        <span className="font-medium">{percent}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all ${percent === 100 ? 'bg-green-500' : 'bg-primary'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function ItemsWorksheet({ items, onUpdateItem, onMarkComplete }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border">
          <TableHead className="w-16">Done</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>SKU</TableHead>
          <TableHead>Item</TableHead>
          <TableHead className="text-center">Qty Needed</TableHead>
          <TableHead className="text-center w-24">Qty Done</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item, idx) => (
          <WorksheetRow 
            key={idx} 
            item={item} 
            index={idx}
            onUpdate={onUpdateItem}
            onMarkComplete={onMarkComplete}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function WorksheetRow({ item, index, onUpdate, onMarkComplete }) {
  const size = getSizeFromSku(item.sku);
  const qtyNeeded = item.qty || item.quantity || 1;
  
  return (
    <TableRow className={`border-border ${item.is_complete ? 'bg-green-500/10' : ''}`}>
      <TableCell>
        <Checkbox 
          checked={item.is_complete}
          onCheckedChange={(checked) => onMarkComplete(index, checked)}
          className={item.is_complete ? "border-green-500 bg-green-500" : ""}
        />
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="font-mono font-bold">{size}</Badge>
      </TableCell>
      <TableCell className="font-mono text-sm">{item.sku}</TableCell>
      <TableCell className={item.is_complete ? "line-through text-muted-foreground" : ""}>
        {item.name}
      </TableCell>
      <TableCell className="text-center font-medium">{qtyNeeded}</TableCell>
      <TableCell>
        <Input
          type="number"
          min="0"
          max={qtyNeeded * 2}
          value={item.qty_done}
          onChange={(e) => onUpdate(index, 'qty_done', parseInt(e.target.value) || 0)}
          className="w-20 text-center h-8"
        />
      </TableCell>
    </TableRow>
  );
}

function WorksheetTimer({ activeTimer, currentStage, timerLoading, onStart, onPause, onResume, onStop }) {
  const hasTimerForThisStage = activeTimer && activeTimer.stage_id === currentStage?.stage_id;
  const hasTimerForOtherStage = activeTimer && activeTimer.stage_id !== currentStage?.stage_id;
  const isPaused = activeTimer?.is_paused;

  if (hasTimerForOtherStage) {
    return (
      <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <p className="font-medium text-yellow-400">Timer Active Elsewhere</p>
              <p className="text-sm text-muted-foreground">
                Currently tracking: <strong>{activeTimer.stage_name}</strong>
                {activeTimer.order_number && <span> • Order #{activeTimer.order_number}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isPaused ? (
              <Button 
                size="sm" 
                onClick={onResume}
                disabled={timerLoading}
                className="gap-1 bg-green-600 hover:bg-green-700"
              >
                <Play className="w-4 h-4" /> Resume
              </Button>
            ) : (
              <Button 
                size="sm" 
                variant="secondary"
                onClick={onPause}
                disabled={timerLoading}
                className="gap-1"
              >
                <Pause className="w-4 h-4" /> Pause
              </Button>
            )}
            <Button 
              size="sm" 
              variant="destructive"
              onClick={onStop}
              disabled={timerLoading}
              className="gap-1"
            >
              <StopCircle className="w-4 h-4" /> Stop
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!hasTimerForThisStage) {
    return (
      <div className="p-4 bg-primary/5 border-2 border-dashed border-primary/30 rounded-lg mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">Timer Required</p>
              <p className="text-sm text-muted-foreground">Start tracking your time on this order</p>
            </div>
          </div>
          <Button 
            size="default" 
            onClick={onStart}
            disabled={timerLoading}
            className="gap-2"
            data-testid="worksheet-start-timer"
          >
            <Play className="w-4 h-4" />
            Start Timer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-3 rounded-lg mb-4 ${isPaused ? "bg-yellow-500/10 border border-yellow-500/30" : "bg-primary/10 border border-primary/30"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isPaused ? "bg-yellow-500/20" : "bg-primary/20"}`}>
            <Clock className={`w-4 h-4 ${isPaused ? "text-yellow-400" : "text-primary animate-pulse"}`} />
          </div>
          <div>
            <div className="text-sm font-medium flex items-center gap-2">
              <span>Timer {isPaused ? "paused" : "running"}</span>
              {isPaused && <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-400">PAUSED</Badge>}
            </div>
            <WorksheetLiveTimer 
              startedAt={activeTimer.started_at} 
              isPaused={isPaused}
              accumulatedMinutes={activeTimer.accumulated_minutes || 0}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isPaused ? (
            <Button size="sm" onClick={onResume} className="gap-1 bg-green-600 hover:bg-green-700">
              <Play className="w-4 h-4" /> Resume
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={onPause} className="gap-1">
              <Pause className="w-4 h-4" /> Pause
            </Button>
          )}
          <Button size="sm" variant="destructive" onClick={onStop} className="gap-1">
            <StopCircle className="w-4 h-4" /> Stop
          </Button>
        </div>
      </div>
    </div>
  );
}

function WorksheetLiveTimer({ startedAt, isPaused, accumulatedMinutes }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (isPaused) {
      setElapsed(Math.floor(accumulatedMinutes * 60));
      return;
    }

    const start = new Date(startedAt).getTime();
    const accSec = Math.floor(accumulatedMinutes * 60);

    function tick() {
      const now = Date.now();
      const secs = Math.floor((now - start) / 1000) + accSec;
      setElapsed(secs);
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt, isPaused, accumulatedMinutes]);

  const hrs = Math.floor(elapsed / 3600);
  const mins = Math.floor((elapsed % 3600) / 60);
  const secs = elapsed % 60;

  const formatted = hrs > 0 
    ? `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${mins}:${String(secs).padStart(2, '0')}`;

  return <span className="font-mono text-sm text-primary">{formatted}</span>;
}

