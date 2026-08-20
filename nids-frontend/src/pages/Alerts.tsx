import PageShell from "@/components/PageShell";
import AlertFeed from "@/components/AlertFeed";

const Alerts = () => (
  <PageShell title="Alerts">
    <AlertFeed archive pageSize={25} />
  </PageShell>
);
export default Alerts;