import { useEffect, useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, LogOut } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AUTO_LOGOUT_TIMEOUT = 15 * 60 * 1000; // 15 minutes in milliseconds

export function DailyLimitWarning({ onLogout }) {
  const [showWarning, setShowWarning] = useState(false);
  const [hoursData, setHoursData] = useState(null);
  const [countdown, setCountdown] = useState(15 * 60); // 15 minutes in seconds
  const [loading, setLoading] = useState(false);
  const timeoutRef = useRef(null);
  const countdownRef = useRef(null);

  useEffect(() => {
    // Check daily hours periodically
    checkDailyHours();
    const interval = setInterval(checkDailyHours, 60000); // Check every minute
    
    return () => {
      clearInterval(interval);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  async function checkDailyHours() {
    try {
      // First check if already acknowledged today
      const ackRes = await fetch(`${API}/fulfillment/user/check-limit-acknowledged`, {
        credentials: "include"
      });
      
      if (ackRes.ok) {
        const ackData = await ackRes.json();
        if (ackData.acknowledged_today) {
          // Already acknowledged today, don't show warning again
          return;
        }
      }
      
      // Check hours
      const res = await fetch(`${API}/fulfillment/user/daily-hours-check`, {
        credentials: "include"
      });
      
      if (res.ok) {
        const data = await res.json();
        setHoursData(data);
        
        if (data.exceeds_limit && !showWarning) {
          setShowWarning(true);
          startAutoLogoutTimer();
        }
      }
    } catch (err) {
      console.error("Failed to check daily hours:", err);
    }
  }

  function startAutoLogoutTimer() {
    // Reset countdown
    setCountdown(15 * 60);
    
    // Start countdown display
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    // Set auto-logout timeout
    timeoutRef.current = setTimeout(() => {
      handleNoResponse();
    }, AUTO_LOGOUT_TIMEOUT);
  }

  function clearTimers() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }

  async function handleContinue() {
    setLoading(true);
    clearTimers();
    
    try {
      const res = await fetch(`${API}/fulfillment/user/acknowledge-limit-exceeded?continue_working=true`, {
        method: "POST",
        credentials: "include"
      });
      
      if (res.ok) {
        toast.success("You may continue working. Remember to take breaks!");
        setShowWarning(false);
      }
    } catch (err) {
      toast.error("Failed to acknowledge. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleStopWorking() {
    setLoading(true);
    clearTimers();
    
    try {
      const res = await fetch(`${API}/fulfillment/user/acknowledge-limit-exceeded?continue_working=false`, {
        method: "POST",
        credentials: "include"
      });
      
      if (res.ok) {
        toast.info("Timer stopped. Logging out...");
        setShowWarning(false);
        setTimeout(() => {
          onLogout?.();
        }, 1500);
      }
    } catch (err) {
      toast.error("Failed to stop timer");
    } finally {
      setLoading(false);
    }
  }

  function handleNoResponse() {
    clearTimers();
    toast.warning("No response received. Logging out for your safety.");
    setShowWarning(false);
    setTimeout(() => {
      onLogout?.();
    }, 1500);
  }

  const formatCountdown = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  if (!showWarning || !hoursData) return null;

  return (
    <Dialog open={showWarning} onOpenChange={() => {}}>
      <DialogContent className="max-w-md" hideCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-yellow-500">
            <AlertTriangle className="w-6 h-6" />
            Daily Hours Limit Exceeded
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">Hours worked today</span>
              <span className="text-2xl font-bold text-yellow-500">
                {hoursData.total_hours.toFixed(1)}h
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Daily limit</span>
              <span className="text-lg font-medium">
                {hoursData.daily_limit}h
              </span>
            </div>
          </div>
          
          <p className="text-sm text-muted-foreground">
            You have exceeded the daily limit of {hoursData.daily_limit} hours. 
            This is to ensure your well-being and accurate time tracking.
          </p>
          
          <p className="text-sm font-medium">
            Do you wish to continue working?
          </p>
          
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <Clock className="w-4 h-4 text-red-400" />
            <span className="text-sm text-red-400">
              Auto-logout in: <strong>{formatCountdown(countdown)}</strong>
            </span>
          </div>
        </div>
        
        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button 
            variant="outline" 
            onClick={handleStopWorking}
            disabled={loading}
            className="flex-1 gap-2"
          >
            <LogOut className="w-4 h-4" />
            No, Stop & Logout
          </Button>
          <Button 
            onClick={handleContinue}
            disabled={loading}
            className="flex-1 gap-2 bg-yellow-600 hover:bg-yellow-700"
          >
            Yes, Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
