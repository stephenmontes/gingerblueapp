import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, ChevronLeft, ChevronRight, Link2, Unlink, RefreshCw, Loader2, Package, ExternalLink, Check } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/utils/api";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function Scheduling({ user }) {
  const [searchParams] = useSearchParams();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [orders, setOrders] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calendarStatus, setCalendarStatus] = useState({ connected: false });
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);

  // Check if just connected
  useEffect(() => {
    if (searchParams.get("connected") === "true") {
      toast.success("Google Calendar connected successfully!");
      // Remove the query param
      window.history.replaceState({}, "", "/scheduling");
    }
  }, [searchParams]);

  useEffect(() => {
    fetchCalendarStatus();
    fetchOrdersWithDates();
  }, []);

  useEffect(() => {
    if (calendarStatus.connected) {
      fetchCalendarEvents();
    }
  }, [calendarStatus.connected, currentDate]);

  const fetchCalendarStatus = async () => {
    try {
      const res = await fetch(`${API}/calendar/status`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCalendarStatus(data);
      }
    } catch (err) {
      console.error("Failed to fetch calendar status");
    }
  };

  const fetchOrdersWithDates = async () => {
    try {
      const res = await fetch(`${API}/calendar/orders-with-dates`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
      }
    } catch (err) {
      console.error("Failed to fetch orders");
    } finally {
      setLoading(false);
    }
  };

  const fetchCalendarEvents = async () => {
    try {
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0);
      
      const res = await fetch(
        `${API}/calendar/events?start_date=${startOfMonth.toISOString()}&end_date=${endOfMonth.toISOString()}`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        setCalendarEvents(data.events || []);
      }
    } catch (err) {
      console.error("Failed to fetch calendar events");
    }
  };

  const handleConnectCalendar = async () => {
    setConnecting(true);
    try {
      const res = await fetch(`${API}/calendar/oauth/connect`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        // Redirect to Google OAuth
        window.location.href = data.authorization_url;
      } else {
        toast.error("Failed to initiate calendar connection");
        setConnecting(false);
      }
    } catch (err) {
      toast.error("Failed to connect calendar");
      setConnecting(false);
    }
  };

  const handleDisconnectCalendar = async () => {
    try {
      const res = await fetch(`${API}/calendar/disconnect`, { 
        method: "POST",
        credentials: "include" 
      });
      if (res.ok) {
        setCalendarStatus({ connected: false });
        setCalendarEvents([]);
        toast.success("Calendar disconnected");
      }
    } catch (err) {
      toast.error("Failed to disconnect calendar");
    }
  };

  const handleSyncToCalendar = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${API}/calendar/sync-orders`, {
        method: "POST",
        credentials: "include"
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Synced ${data.created} new, ${data.updated} updated events`);
        fetchCalendarEvents();
        fetchOrdersWithDates();
      } else {
        const error = await res.json();
        toast.error(error.detail || "Failed to sync orders");
      }
    } catch (err) {
      toast.error("Failed to sync orders to calendar");
    } finally {
      setSyncing(false);
    }
  };

  // Calendar calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const days = [];
    
    // Previous month days
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      days.push({
        day: daysInPrevMonth - i,
        isCurrentMonth: false,
        date: new Date(year, month - 1, daysInPrevMonth - i)
      });
    }
    
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        day: i,
        isCurrentMonth: true,
        date: new Date(year, month, i)
      });
    }
    
    // Next month days
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        day: i,
        isCurrentMonth: false,
        date: new Date(year, month + 1, i)
      });
    }
    
    return days;
  }, [year, month, firstDayOfMonth, daysInMonth, daysInPrevMonth]);

  // Get orders for a specific date
  const getOrdersForDate = (date) => {
    const dateStr = date.toISOString().split("T")[0];
    return orders.filter(o => o.requested_ship_date === dateStr);
  };

  // Get events for a specific date
  const getEventsForDate = (date) => {
    const dateStr = date.toISOString().split("T")[0];
    return calendarEvents.filter(e => {
      const eventDate = e.start?.date || e.start?.dateTime?.split("T")[0];
      return eventDate === dateStr;
    });
  };

  const isToday = (date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  const navigateMonth = (direction) => {
    setCurrentDate(new Date(year, month + direction, 1));
    setSelectedDate(null);
  };

  // Orders for selected date
  const selectedDateOrders = selectedDate ? getOrdersForDate(selectedDate) : [];

  return (
    <div className="space-y-6" data-testid="scheduling-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold">Scheduling</h1>
          <p className="text-muted-foreground">View and manage order ship dates</p>
        </div>
        <div className="flex items-center gap-2">
          {calendarStatus.connected ? (
            <>
              <div className="text-sm text-muted-foreground mr-2">
                Connected: <span className="text-foreground">{calendarStatus.connected_email}</span>
              </div>
              <Button
                onClick={handleSyncToCalendar}
                disabled={syncing}
                className="gap-2"
                data-testid="sync-calendar-btn"
              >
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Sync to Calendar
              </Button>
              <Button
                variant="outline"
                onClick={handleDisconnectCalendar}
                className="gap-2"
                data-testid="disconnect-calendar-btn"
              >
                <Unlink className="w-4 h-4" />
                Disconnect
              </Button>
            </>
          ) : (
            <Button
              onClick={handleConnectCalendar}
              disabled={connecting}
              className="gap-2"
              data-testid="connect-calendar-btn"
            >
              {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              Connect Company Calendar
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Orders with Ship Dates</p>
                <p className="text-2xl font-bold">{orders.length}</p>
              </div>
              <Calendar className="w-8 h-8 text-primary/60" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Synced to Calendar</p>
                <p className="text-2xl font-bold">{orders.filter(o => o.calendar_event_id).length}</p>
              </div>
              <Check className="w-8 h-8 text-green-500/60" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Not Synced</p>
                <p className="text-2xl font-bold">{orders.filter(o => !o.calendar_event_id).length}</p>
              </div>
              <Package className="w-8 h-8 text-orange-500/60" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Calendar Status</p>
                <p className="text-lg font-bold">
                  {calendarStatus.connected ? (
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Connected</Badge>
                  ) : (
                    <Badge variant="outline">Not Connected</Badge>
                  )}
                </p>
              </div>
              <Link2 className="w-8 h-8 text-muted-foreground/60" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <Card className="lg:col-span-2 bg-card border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                {MONTHS[month]} {year}
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => navigateMonth(-1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    setCurrentDate(new Date());
                    setSelectedDate(null);
                  }}
                >
                  Today
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigateMonth(1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {DAYS.map(day => (
                <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                  {day}
                </div>
              ))}
            </div>
            
            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((dayInfo, idx) => {
                const dayOrders = getOrdersForDate(dayInfo.date);
                const dayEvents = getEventsForDate(dayInfo.date);
                const hasOrders = dayOrders.length > 0;
                const hasEvents = dayEvents.length > 0;
                const isSelected = selectedDate && 
                  dayInfo.date.toDateString() === selectedDate.toDateString();
                
                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedDate(dayInfo.date)}
                    className={`
                      min-h-[80px] p-1 rounded-lg border cursor-pointer transition-colors
                      ${dayInfo.isCurrentMonth ? "bg-background" : "bg-muted/20"}
                      ${isToday(dayInfo.date) ? "border-primary" : "border-border"}
                      ${isSelected ? "ring-2 ring-primary" : ""}
                      hover:bg-muted/50
                    `}
                  >
                    <div className={`text-sm font-medium mb-1 ${
                      dayInfo.isCurrentMonth ? "" : "text-muted-foreground"
                    } ${isToday(dayInfo.date) ? "text-primary" : ""}`}>
                      {dayInfo.day}
                    </div>
                    
                    {/* Order indicators */}
                    {hasOrders && (
                      <div className="space-y-0.5">
                        {dayOrders.slice(0, 2).map((order, i) => (
                          <div
                            key={i}
                            className={`text-xs truncate px-1 py-0.5 rounded ${
                              order.calendar_event_id 
                                ? "bg-green-500/20 text-green-400" 
                                : order.source === "pos"
                                  ? "bg-blue-500/20 text-blue-400"
                                  : "bg-orange-500/20 text-orange-400"
                            }`}
                          >
                            #{order.order_number}
                          </div>
                        ))}
                        {dayOrders.length > 2 && (
                          <div className="text-xs text-muted-foreground px-1">
                            +{dayOrders.length - 2} more
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-border">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-orange-500/20 border border-orange-500/50" />
                <span className="text-xs text-muted-foreground">Shopify (not synced)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-blue-500/20 border border-blue-500/50" />
                <span className="text-xs text-muted-foreground">POS (not synced)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-green-500/20 border border-green-500/50" />
                <span className="text-xs text-muted-foreground">Synced to calendar</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Selected Date Details */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg">
              {selectedDate 
                ? selectedDate.toLocaleDateString("en-US", { 
                    weekday: "long", 
                    month: "long", 
                    day: "numeric" 
                  })
                : "Select a Date"
              }
            </CardTitle>
            <CardDescription>
              {selectedDate 
                ? `${selectedDateOrders.length} order${selectedDateOrders.length !== 1 ? "s" : ""} scheduled`
                : "Click a date to view orders"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedDate ? (
              selectedDateOrders.length > 0 ? (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {selectedDateOrders.map((order) => (
                    <div
                      key={order.order_id}
                      className="p-3 rounded-lg bg-muted/30 border border-border"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono font-semibold">
                          #{order.order_number}
                        </span>
                        {order.calendar_event_id ? (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                            Synced
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            Not Synced
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium">{order.customer_name}</p>
                      <p className="text-xs text-muted-foreground">{order.store_name}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-muted-foreground">
                          {order.items?.length || 0} items
                        </span>
                        <span className="text-sm font-semibold">
                          ${order.total_price?.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No orders scheduled for this date</p>
                </div>
              )
            ) : (
              <div className="text-center py-8">
                <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Select a date to view scheduled orders</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* All Orders with Ship Dates Table */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            All Scheduled Orders
          </CardTitle>
          <CardDescription>
            Orders with requested ship dates
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No orders with ship dates</p>
              <p className="text-sm text-muted-foreground mt-1">
                Set ship dates on the Orders page to see them here
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Order</th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Customer</th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Store</th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Ship Date</th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Items</th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Total</th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Calendar</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.order_id} className="border-b border-border hover:bg-muted/30">
                      <td className="py-3 px-2">
                        <span className="font-mono font-medium">#{order.order_number}</span>
                      </td>
                      <td className="py-3 px-2">{order.customer_name}</td>
                      <td className="py-3 px-2 text-sm text-muted-foreground">{order.store_name}</td>
                      <td className="py-3 px-2">
                        <span className="text-orange-400 font-medium">{order.requested_ship_date}</span>
                      </td>
                      <td className="py-3 px-2 text-sm">{order.items?.length || 0}</td>
                      <td className="py-3 px-2 font-semibold">${order.total_price?.toFixed(2)}</td>
                      <td className="py-3 px-2">
                        {order.calendar_event_id ? (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                            <Check className="w-3 h-3 mr-1" />
                            Synced
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Pending
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
