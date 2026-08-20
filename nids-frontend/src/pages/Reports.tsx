import PageShell from "@/components/PageShell";
import AttackPieChart from "@/components/AttackPieChart";
import IPLeaderboard from "@/components/IPLeaderboard";
import AttackTimeline from "@/components/AttackTimeline";

const Reports = () => (
  <PageShell title="Reports">
    <div className="grid grid-cols-1 gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AttackPieChart />
        <IPLeaderboard />
      </div>
      <AttackTimeline />
    </div>
  </PageShell>
);
export default Reports;