import { Factory, Menu, X, ShoppingCart, Clock, AlertTriangle } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  LayoutDashboard,
  Package,
  Workflow,
  Boxes,
  Users,
  BarChart3,
  Settings,
  LogOut,
  Truck,
  ShoppingBag,
  Calendar,
  UserCircle,
  ListTodo,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { TimerRecoveryDialog } from "@/components/TimerRecoveryDialog";
import { API } from "@/utils/api";

const navItems = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/orders", label: "Orders", icon: Package },
  { path: "/pos", label: "Point of Sale", icon: ShoppingCart },
  { path: "/customers", label: "Customers", icon: UserCircle },
  { path: "/tasks", label: "Tasks", icon: ListTodo },
  { path: "/products", label: "Products", icon: ShoppingBag },
  { path: "/production", label: "Frame Production", icon: Workflow },
  { path: "/fulfillment", label: "Order Fulfillment", icon: Truck },
  { path: "/inventory", label: "Frame Inventory", icon: Boxes },
  { path: "/scheduling", label: "Scheduling", icon: Calendar, roles: ["admin", "manager"] },
  { path: "/team", label: "Team", icon: Users, roles: ["admin", "manager"] },
  { path: "/reports", label: "Reports", icon: BarChart3, roles: ["admin", "manager"] },
  { path: "/settings", label: "Settings", icon: Settings, roles: ["admin", "manager"] },
];

// Session timeout settings
const SESSION_TIMEOUT_HOURS = 9;
const SESSION_TIMEOUT_MS = SESSION_TIMEOUT_HOURS * 60 * 60 * 1000; // 9 hours in ms
const WARNING_COUNTDOWN_SECONDS = 60;

export default function Layout({ children, user, setUser }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const heartbeatIntervalRef = useRef(null);
  const sessionTimeoutRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  
  // Auto-logout state
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(WARNING_COUNTDOWN_SECONDS);

  // Stop all active timers before logout
  const stopAllTimers = useCallback(async () => {
    try {
      // Stop fulfillment timers
      await fetch(`${API}/fulfillment/timers/stop-all`, {
        method: "POST",
        credentials: "include"
      });
    } catch (err) {
      console.error("Error stopping fulfillment timers:", err);
    }

    try {
      // Stop production timers
      await fetch(`${API}/production/timers/stop-all`, {
        method: "POST",
        credentials: "include"
      });
    } catch (err) {
      console.error("Error stopping production timers:", err);
    }
  }, []);

  // Perform logout
  const performLogout = useCallback(async () => {
    // Stop all timers first
    await stopAllTimers();
    
    // Clear session
    try {
      await fetch(`${API}/auth/logout`, {
        method: "POST",
        credentials: "include"
      });
    } catch (err) {
      console.error("Logout error:", err);
    }
    
    // Clear local state
    setUser(null);
    localStorage.removeItem("sessionStartTime");
    navigate("/");
    toast.info("Session ended. Please log in again.");
  }, [navigate, setUser, stopAllTimers]);

  // Handle session timeout
  const handleSessionTimeout = useCallback(() => {
    setShowTimeoutWarning(true);
    setCountdownSeconds(WARNING_COUNTDOWN_SECONDS);
    
    // Start countdown
    countdownIntervalRef.current = setInterval(() => {
      setCountdownSeconds(prev => {
        if (prev <= 1) {
          // Time's up - logout
          clearInterval(countdownIntervalRef.current);
          setShowTimeoutWarning(false);
          performLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [performLogout]);

  // Continue session (user clicked "Continue")
  const handleContinueSession = () => {
    // Clear countdown
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    setShowTimeoutWarning(false);
    
    // Reset session timer
    const newStartTime = Date.now();
    localStorage.setItem("sessionStartTime", newStartTime.toString());
    
    // Set new timeout
    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current);
    }
    sessionTimeoutRef.current = setTimeout(handleSessionTimeout, SESSION_TIMEOUT_MS);
    
    toast.success("Session extended for 9 more hours");
  };

  // Initialize session timeout tracking
  useEffect(() => {
    if (!user) return;

    // Get or set session start time
    let sessionStartTime = localStorage.getItem("sessionStartTime");
    if (!sessionStartTime) {
      sessionStartTime = Date.now().toString();
      localStorage.setItem("sessionStartTime", sessionStartTime);
    }

    const startTime = parseInt(sessionStartTime);
    const elapsed = Date.now() - startTime;
    const remaining = SESSION_TIMEOUT_MS - elapsed;

    if (remaining <= 0) {
      // Session already expired
      handleSessionTimeout();
    } else {
      // Set timeout for remaining time
      sessionTimeoutRef.current = setTimeout(handleSessionTimeout, remaining);
    }

    return () => {
      if (sessionTimeoutRef.current) {
        clearTimeout(sessionTimeoutRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [user, handleSessionTimeout]);

  // Track user activity with heartbeat every minute
  useEffect(() => {
    if (!user) return;

    const sendHeartbeat = async () => {
      try {
        await fetch(`${API}/activity/heartbeat`, {
          method: "POST",
          credentials: "include"
        });
      } catch (err) {
        // Silently fail - don't disrupt user experience
        console.debug("Heartbeat failed:", err);
      }
    };

    // Send initial heartbeat
    sendHeartbeat();

    // Set up interval for every 60 seconds
    heartbeatIntervalRef.current = setInterval(sendHeartbeat, 60000);

    // Cleanup on unmount
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [user]);

  const handleSaveTimers = async () => {
    try {
      const res = await fetch(`${API}/timer-recovery/save-all`, {
        method: "POST",
        credentials: "include"
      });
      if (res.ok) {
        const result = await res.json();
        if (result.saved_count > 0) {
          toast.success(`Saved ${result.saved_count} timer(s). You can resume after logging back in.`);
        }
        return result.saved_count;
      }
    } catch (err) {
      console.error("Failed to save timers:", err);
    }
    return 0;
  };

  const handleLogout = async () => {
    try {
      // Stop all active timers before logout
      await stopAllTimers();
      
      await fetch(`${API}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      // Clear session storage
      sessionStorage.removeItem("shopfactory_user");
      localStorage.removeItem("sessionStartTime");
      setUser(null);
      toast.success("Logged out successfully");
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Logout error:", error);
      sessionStorage.removeItem("shopfactory_user");
      localStorage.removeItem("sessionStartTime");
      navigate("/login", { replace: true });
    }
  };

  const handleTimerRestored = (workflowType) => {
    // Trigger a page refresh to pick up the restored timer
    window.location.reload();
  };

  const getInitials = (name) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="min-h-screen bg-background flex" data-testid="app-layout">
      {/* Training Mode Banner */}
      {user?.training_mode && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-yellow-500 text-black text-center py-1 px-4 text-sm font-bold">
          ⚠️ TRAINING MODE - Data will not affect production
        </div>
      )}
      
      {/* Mobile menu button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className={`lg:hidden fixed ${user?.training_mode ? 'top-12' : 'top-4'} left-4 z-50 p-2 rounded-lg bg-card border border-border`}
        data-testid="mobile-menu-btn"
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-card border-r border-border transform transition-transform duration-200 ${user?.training_mode ? 'pt-8' : ''} ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
        data-testid="sidebar"
      >
        <div className="flex flex-col h-full max-h-screen overflow-hidden">
          {/* Logo */}
          <div className="p-6 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <Factory className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="font-heading font-bold text-lg">ShopFactory</h1>
                <p className="text-xs text-muted-foreground">Manufacturing Hub</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto min-h-0">
            {navItems
              .filter((item) => !item.roles || item.roles.includes(user?.role))
              .map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                    isActive
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`
                }
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <item.icon size={20} />
                <span className="font-medium">{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-border flex-shrink-0">
            <div className="flex items-center justify-between mb-3 px-3">
              <span className="text-xs text-muted-foreground">Theme</span>
              <ThemeToggle />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted/50 transition-colors"
                  data-testid="user-menu-trigger"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={user?.picture} alt={user?.name} />
                    <AvatarFallback className="bg-primary/20 text-primary">
                      {getInitials(user?.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium truncate">{user?.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSaveTimers}
                  className="cursor-pointer"
                  data-testid="save-timers-btn"
                >
                  <Save className="mr-2 h-4 w-4" />
                  Save Active Timers
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-destructive focus:text-destructive cursor-pointer"
                  data-testid="logout-btn"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className={`flex-1 overflow-auto ${user?.training_mode ? 'pt-8' : ''}`}>
        {/* Top bar with notifications */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-6 py-3 flex items-center justify-end gap-2">
          <NotificationBell />
          <ThemeToggle />
        </div>
        <div className="p-6 md:p-8 lg:pl-8">{children}</div>
      </main>

      {/* Timer Recovery Dialog - shows when user has saved timers */}
      <TimerRecoveryDialog onTimerRestored={handleTimerRestored} />

      {/* Session Timeout Warning Dialog */}
      <AlertDialog open={showTimeoutWarning} onOpenChange={() => {}}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-orange-500">
              <AlertTriangle className="w-5 h-5" />
              Session Expiring
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                Your session has been active for {SESSION_TIMEOUT_HOURS} hours and will expire soon.
                All active timers will be stopped.
              </p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Auto logout in:
                  </span>
                  <span className="font-mono text-lg font-bold text-orange-500">
                    {countdownSeconds}s
                  </span>
                </div>
                <Progress 
                  value={(countdownSeconds / WARNING_COUNTDOWN_SECONDS) * 100} 
                  className="h-2"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={performLogout}
              className="w-full sm:w-auto"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Log Out Now
            </Button>
            <Button
              onClick={handleContinueSession}
              className="w-full sm:w-auto bg-green-600 hover:bg-green-700"
            >
              Continue Working
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
