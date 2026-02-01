import { Factory, Menu, X } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  LayoutDashboard,
  Package,
  Workflow,
  Users,
  BarChart3,
  Settings,
  LogOut,
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
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const navItems = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/orders", label: "Orders", icon: Package },
  { path: "/production", label: "Frame Production", icon: Workflow },
  { path: "/team", label: "Team", icon: Users },
  { path: "/reports", label: "Reports", icon: BarChart3 },
  { path: "/settings", label: "Settings", icon: Settings },
];

export default function Layout({ children, user, setUser }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await fetch(`${API}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      // Clear session storage
      sessionStorage.removeItem("shopfactory_user");
      setUser(null);
      toast.success("Logged out successfully");
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Logout error:", error);
      sessionStorage.removeItem("shopfactory_user");
      navigate("/login", { replace: true });
    }
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
    <div className="min-h-screen bg-[#09090B] flex" data-testid="app-layout">
      {/* Mobile menu button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-card border border-border"
        data-testid="mobile-menu-btn"
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-[#18181B] border-r border-border transform transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
        data-testid="sidebar"
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-border">
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
          <nav className="flex-1 p-4 space-y-1">
            {navItems.map((item) => (
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
          <div className="p-4 border-t border-border">
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
      <main className="flex-1 overflow-auto">
        <div className="p-6 md:p-8 lg:pl-8">{children}</div>
      </main>
    </div>
  );
}
