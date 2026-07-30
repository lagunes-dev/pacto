import { useEffect, useMemo, type PropsWithChildren } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useRepositories } from "../../app/providers";
import { useAuth } from "../auth/queries/AuthProvider";
import { useMyPartnership } from "../partnership/queries";
import { createRealtimeLifecycle } from "./port";

export function RealtimeCoordinator({ children }: PropsWithChildren) {
  const { realtime } = useRepositories();
  const { session } = useAuth();
  const partnership = useMyPartnership().data;
  const client = useQueryClient();
  const lifecycle = useMemo(() => createRealtimeLifecycle(realtime, client), [realtime, client]);

  useEffect(() => {
    if (session && partnership?.status === "active") {
      lifecycle.start(session.user.id, partnership.id, true);
    } else {
      void lifecycle.stop();
    }
    return () => { void lifecycle.stop(); };
  }, [lifecycle, partnership?.id, partnership?.status, session]);

  return children;
}
