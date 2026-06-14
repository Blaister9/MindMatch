import { MoodTrendChart } from "./MoodTrendChart";
import { AlertsChart } from "./AlertsChart";
import { MatchingMetrics } from "./MatchingMetrics";
import { AdoptionFunnel } from "./AdoptionFunnel";

export function AnalyticsPage({ token }: { token: string }) {
  return (
    <section aria-label="Analítica institucional" className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Analítica institucional</h2>
        <p className="text-sm text-slate-500">
          Series históricas y estado operativo actual. Las métricas se generan con
          <code className="mx-1 rounded bg-slate-100 px-1">analytics:refresh</code>
          y al simular un día.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <MoodTrendChart token={token} />
        <AlertsChart token={token} />
        <MatchingMetrics token={token} />
        <AdoptionFunnel token={token} />
      </div>
    </section>
  );
}
