import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Save, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/utils/api";


export function SaveTimersButton({ variant = "outline", size = "default", className = "" }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSaveTimers() {
    setSaving(true);
    try {
      const res = await fetch(`${API}/timer-recovery/save-all`, {
        method: "POST",
        credentials: "include"
      });
      
      if (res.ok) {
        const result = await res.json();
        if (result.saved_count > 0) {
          toast.success(`Saved ${result.saved_count} active timer(s). You can resume after logging back in.`);
          setSaved(true);
          setTimeout(() => setSaved(false), 3000);
        } else {
          toast.info("No active timers to save");
        }
      } else {
        toast.error("Failed to save timers");
      }
    } catch (err) {
      toast.error("Failed to save timers");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleSaveTimers}
      disabled={saving}
      className={`gap-2 ${className}`}
      data-testid="save-timers-btn"
    >
      {saving ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : saved ? (
        <Check className="w-4 h-4 text-green-500" />
      ) : (
        <Save className="w-4 h-4" />
      )}
      {saving ? "Saving..." : saved ? "Saved!" : "Save Timers"}
    </Button>
  );
}
