import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/groups/$gid")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Couldn't load clubhouse: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6">Group not found</div>,
});
