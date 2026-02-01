import { Card, CardContent } from "@/components/ui/card";
import { Package, Layers, Barcode, Tag, TrendingUp } from "lucide-react";

export function ProductStats({ stats }) {
  if (!stats) return null;

  const statCards = [
    {
      label: "Total Products",
      value: stats.total_products,
      icon: Package,
      color: "text-blue-500"
    },
    {
      label: "Total Variants",
      value: stats.total_variants,
      icon: Layers,
      color: "text-purple-500"
    },
    {
      label: "With SKU",
      value: stats.variants_with_sku,
      icon: Tag,
      color: "text-green-500"
    },
    {
      label: "With Barcode",
      value: stats.variants_with_barcode,
      icon: Barcode,
      color: "text-orange-500"
    },
    {
      label: "Total Inventory",
      value: stats.total_inventory?.toLocaleString(),
      icon: TrendingUp,
      color: "text-cyan-500"
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {statCards.map((stat) => (
        <Card key={stat.label} className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
              <span className="text-2xl font-bold">{stat.value}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{stat.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
