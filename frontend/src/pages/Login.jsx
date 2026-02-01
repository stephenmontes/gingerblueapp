import { Factory } from "lucide-react";
import { Button } from "@/components/ui/button";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH

export default function Login() {
  const handleGoogleLogin = () => {
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      data-testid="login-page"
    >
      {/* Background Image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1768661608008-74f74ad6923a?crop=entropy&cs=srgb&fm=jpg&q=85')",
        }}
      />
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/70" />

      {/* Login Card */}
      <div
        className="relative z-10 w-full max-w-md mx-4 p-8 rounded-xl bg-card/90 backdrop-blur-xl border border-white/10 animate-fade-in"
        data-testid="login-card"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-primary/20 mb-4">
            <Factory className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-heading font-bold mb-2">ShopFactory</h1>
          <p className="text-muted-foreground">
            Manufacturing & Fulfillment Hub
          </p>
        </div>

        {/* Login Section */}
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Welcome Back</h2>
            <p className="text-sm text-muted-foreground">
              Sign in with your company Google account to continue
            </p>
          </div>

          <Button
            onClick={handleGoogleLogin}
            className="w-full h-12 text-base font-semibold bg-white hover:bg-gray-100 text-gray-900 flex items-center justify-center gap-3 transition-all duration-200 shadow-lg hover:shadow-xl"
            data-testid="google-login-btn"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>

        {/* Features */}
        <div className="mt-8 pt-6 border-t border-border">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-heading font-bold text-primary">5</p>
              <p className="text-xs text-muted-foreground">Stores</p>
            </div>
            <div>
              <p className="text-2xl font-heading font-bold text-secondary">6</p>
              <p className="text-xs text-muted-foreground">Stages</p>
            </div>
            <div>
              <p className="text-2xl font-heading font-bold text-accent">∞</p>
              <p className="text-xs text-muted-foreground">Orders</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
