import Sidebar from "@/components/Sidebar";
import StatusBar from "@/components/StatusBar";
import Chatbot from "@/components/Chatbot";
import { useWebSocket } from "@/hooks/useWebSocket";
import type { ReactNode } from "react";

interface PageShellProps {
  title: string;
  children: ReactNode;
}

const PageShell = ({ title, children }: PageShellProps) => {
  const { isConnected } = useWebSocket();
  return (
    <div className="min-h-screen bg-surface flex">
      <Sidebar />
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        <StatusBar wsConnected={isConnected} />
        <main className="flex-1 p-6 space-y-6 max-w-[1600px] w-full mx-auto pt-20 lg:pt-6">
          <h1
            className="text-2xl font-bold"
            style={{ color: "#e8eafb", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            {title}
          </h1>
          {children}
        </main>
        <footer
          className="border-t px-6 py-4 flex justify-between items-center"
          style={{ borderColor: "rgba(255,255,255,0.05)" }}
        >
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
            © 2026 The Sentinel — NIDS Command Center v1.0.0
          </span>
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noreferrer"
            className="text-[10px] font-bold uppercase tracking-widest transition-colors"
            style={{ color: "rgba(255,255,255,0.2)" }}
          >
            API Docs
          </a>
        </footer>
      </div>
      <Chatbot />
    </div>
  );
};
export default PageShell;