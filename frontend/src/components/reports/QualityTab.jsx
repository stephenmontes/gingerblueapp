import { QualityMetrics } from "./QualityMetrics";
import { CostAnalysis } from "./CostAnalysis";
import { BatchPerformance } from "./BatchPerformance";

export function QualityTab({ productionKpis }) {
  const kpis = productionKpis || {};

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <QualityMetrics productionKpis={productionKpis} />
        <CostAnalysis productionKpis={productionKpis} />
      </div>
      <BatchPerformance batches={kpis?.batches} />
    </div>
  );
}
