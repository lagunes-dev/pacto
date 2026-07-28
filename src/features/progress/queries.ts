import { useQuery } from "@tanstack/react-query";

import { useRepositories } from "../../app/providers";
import { useAuth } from "../auth/queries/AuthProvider";

export function usePersonalProgress() {
  const { progress } = useRepositories();
  const { session } = useAuth();
  return useQuery({
    queryKey: ["progress", session?.user.id ?? "anonymous"],
    queryFn: () => progress.getMine(),
    enabled: Boolean(session),
  });
}
