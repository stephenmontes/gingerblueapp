import { useEffect, useState, useRef } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { API } from "@/utils/api";

// Pages
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Orders from "@/pages/Orders";
import Production from "@/pages/Production";
import OrderFulfillment from "@/pages/OrderFulfillment";
import FrameInventory from "@/pages/FrameInventory";
import Products from "@/pages/Products";
import Team from "@/pages/Team";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import Layout from "@/components/Layout";

// Dynamic backend URL: Use env variable for preview, or same origin for custom domain deployments
const getBackendUrl = () => {
  const envUrl = process.env.REACT_APP_BACKEND_URL;
  // If we're on a preview domain, use the env variable
  if (window.location.hostname.includes('preview.emergentagent.com')) {
    return envUrl;
  }
  // For custom domains (deployed), use same origin since backend is served from same domain
  if (!window.location.hostname.includes('localhost')) {
    return window.location.origin;
  }
  // Fallback to env variable
  return envUrl;
};

const BACKEND_URL = getBackendUrl();
const API = `${BACKEND_URL}/api`;

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH

// Auth Callback Component - Handles OAuth redirect
const AuthCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processAuth = async () => {
      const hash = location.hash;
      const sessionIdMatch = hash.match(/session_id=([^&]+)/);
      
      if (sessionIdMatch) {
        const sessionId = sessionIdMatch[1];
        
        try {
          const response = await fetch(`${API}/auth/session`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ session_id: sessionId }),
          });
          
          if (response.ok) {
            const user = await response.json();
            // Store user in sessionStorage for persistence
            sessionStorage.setItem("shopfactory_user", JSON.stringify(user));
            // Clear the hash from URL
            window.history.replaceState(null, "", "/dashboard");
            navigate("/dashboard", { state: { user }, replace: true });
          } else {
            console.error("Auth failed");
            navigate("/login", { replace: true });
          }
        } catch (error) {
          console.error("Auth error:", error);
          navigate("/login", { replace: true });
        }
      } else {
        navigate("/login", { replace: true });
      }
    };

    processAuth();
  }, [location, navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-muted-foreground">Authenticating...</p>
      </div>
    </div>
  );
};

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Skip if user passed from AuthCallback
    if (location.state?.user) {
      setUser(location.state.user);
      setIsAuthenticated(true);
      // Clear location state to avoid reusing stale data
      window.history.replaceState({}, document.title);
      return;
    }

    // Check sessionStorage for cached user
    const cachedUser = sessionStorage.getItem("shopfactory_user");
    
    const checkAuth = async () => {
      try {
        const response = await fetch(`${API}/auth/me`, {
          credentials: "include",
        });
        
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
          setIsAuthenticated(true);
          // Update session storage
          sessionStorage.setItem("shopfactory_user", JSON.stringify(userData));
        } else {
          // Clear session storage on auth failure
          sessionStorage.removeItem("shopfactory_user");
          setIsAuthenticated(false);
          navigate("/login", { replace: true });
        }
      } catch (error) {
        console.error("Auth check error:", error);
        // If we have cached user data, use it temporarily
        if (cachedUser) {
          try {
            setUser(JSON.parse(cachedUser));
            setIsAuthenticated(true);
            return;
          } catch (e) {
            // Invalid cached data
          }
        }
        sessionStorage.removeItem("shopfactory_user");
        setIsAuthenticated(false);
        navigate("/login", { replace: true });
      }
    };

    checkAuth();
  }, [location, navigate]);

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // Update setUser to also update sessionStorage
  const handleSetUser = (newUser) => {
    setUser(newUser);
    if (newUser) {
      sessionStorage.setItem("shopfactory_user", JSON.stringify(newUser));
    } else {
      sessionStorage.removeItem("shopfactory_user");
    }
  };

  return children({ user, setUser: handleSetUser });
};

// Role-protected route - redirects workers from admin/manager pages
const RoleProtectedRoute = ({ children, allowedRoles = ["admin", "manager"] }) => {
  return (
    <ProtectedRoute>
      {({ user, setUser }) => {
        if (!allowedRoles.includes(user?.role)) {
          return (
            <Layout user={user} setUser={setUser}>
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold mb-2">Access Restricted</h2>
                <p className="text-muted-foreground mb-4">This page is only available to managers and administrators.</p>
                <a href="/dashboard" className="text-primary hover:underline">Return to Dashboard</a>
              </div>
            </Layout>
          );
        }
        return children({ user, setUser });
      }}
    </ProtectedRoute>
  );
};

// App Router Component
function AppRouter() {
  const location = useLocation();

  // Check for session_id in URL fragment synchronously
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            {({ user, setUser }) => (
              <Layout user={user} setUser={setUser}>
                <Dashboard user={user} />
              </Layout>
            )}
          </ProtectedRoute>
        }
      />
      <Route
        path="/orders"
        element={
          <ProtectedRoute>
            {({ user, setUser }) => (
              <Layout user={user} setUser={setUser}>
                <Orders user={user} />
              </Layout>
            )}
          </ProtectedRoute>
        }
      />
      <Route
        path="/production"
        element={
          <ProtectedRoute>
            {({ user, setUser }) => (
              <Layout user={user} setUser={setUser}>
                <Production user={user} />
              </Layout>
            )}
          </ProtectedRoute>
        }
      />
      <Route
        path="/fulfillment"
        element={
          <ProtectedRoute>
            {({ user, setUser }) => (
              <Layout user={user} setUser={setUser}>
                <OrderFulfillment user={user} />
              </Layout>
            )}
          </ProtectedRoute>
        }
      />
      <Route
        path="/inventory"
        element={
          <ProtectedRoute>
            {({ user, setUser }) => (
              <Layout user={user} setUser={setUser}>
                <FrameInventory user={user} />
              </Layout>
            )}
          </ProtectedRoute>
        }
      />
      <Route
        path="/team"
        element={
          <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
            {({ user, setUser }) => (
              <Layout user={user} setUser={setUser}>
                <Team user={user} />
              </Layout>
            )}
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
            {({ user, setUser }) => (
              <Layout user={user} setUser={setUser}>
                <Reports user={user} />
              </Layout>
            )}
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
            {({ user, setUser }) => (
              <Layout user={user} setUser={setUser}>
                <Settings user={user} />
              </Layout>
            )}
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/products"
        element={
          <ProtectedRoute>
            {({ user, setUser }) => (
              <Layout user={user} setUser={setUser}>
                <Products user={user} />
              </Layout>
            )}
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider>
      <div className="App">
        <div className="noise-overlay"></div>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </div>
    </ThemeProvider>
  );
}

export default App;
