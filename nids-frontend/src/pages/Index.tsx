import PageShell from "@/components/PageShell";
import KPICards from "@/components/KPICards";
import TrafficChart from "@/components/TrafficChart";
import AttackTimeline from "@/components/AttackTimeline";
import AttackPieChart from "@/components/AttackPieChart";
import AlertFeed from "@/components/AlertFeed";
import IPLeaderboard from "@/components/IPLeaderboard";
import { useWebSocket } from "@/hooks/useWebSocket";

const Index = () => {
  const { alertHistory } = useWebSocket();
  return (
    <PageShell title="Dashboard">
      <KPICards />
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8">
          <TrafficChart alertHistory={alertHistory} />
        </div>
        <div className="col-span-12 lg:col-span-4">
          <AttackPieChart />
        </div>
        <div className="col-span-12 lg:col-span-9" style={{ minHeight: 440 }}>
          <AlertFeed history={alertHistory} />
        </div>
        <div className="col-span-12 lg:col-span-3">
          <IPLeaderboard />
        </div>
        <div className="col-span-12">
          <AttackTimeline />
        </div>
      </div>
    </PageShell>
  );
};
export default Index;