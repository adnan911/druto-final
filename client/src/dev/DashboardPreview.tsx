import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Eye, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { DashboardWorkspace } from "@/pages/Home";
import { dashboardPreviewLink } from "./dashboardPreviewLink";
import "./dashboardPreview.css";

export default function DashboardPreview({ onExit }: { onExit: () => void }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity },
    mutations: { retry: false },
  } }));
  const [client] = useState(() => trpc.createClient({ links: [dashboardPreviewLink()] }));
  useEffect(() => () => { queryClient.clear(); }, [queryClient]);
  if (!import.meta.env.DEV) return null;
  return <trpc.Provider client={client} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <div className="dashboard-dev-preview" onClickCapture={event => {
        const anchor = (event.target as HTMLElement).closest("a");
        if (anchor?.href.includes("arcscan")) {
          event.preventDefault();
          toast.info("This sample has no onchain transaction.");
        }
      }}>
        <section className="dashboard-preview-banner" aria-label="Development preview">
          <Eye size={18} aria-hidden="true" />
          <div><strong>Development preview</strong><span>Sample data · read-only · no account access</span></div>
          <button type="button" onClick={onExit}><X size={15} aria-hidden="true" /> Exit preview</button>
        </section>
        <DashboardWorkspace user={{ name: "Demo workspace", openId: "development-preview", email: "preview@example.invalid" }} onExitPreview={onExit} />
      </div>
    </QueryClientProvider>
  </trpc.Provider>;
}