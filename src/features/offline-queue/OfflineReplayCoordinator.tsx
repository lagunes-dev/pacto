import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useOptionalRepositories, useRepositories } from "../../app/providers";
import { useConnectivity } from "../../pwa/useConnectivity";
import { useAuth } from "../auth/queries/AuthProvider";
import type { QueueRecord } from "./model";

export function OfflineReplayCoordinator() {
  const { session } = useAuth();
  const { offlineQueue, recovery } = useRepositories();
  const online = useConnectivity();
  const queryClient = useQueryClient();
  const [version, setVersion] = useState(0);

  useEffect(() => typeof offlineQueue.subscribe === "function" ? offlineQueue.subscribe(() => setVersion((value) => value + 1)) : undefined, [offlineQueue]);
  useEffect(() => {
    const actorId = session?.user.id;
    if (!actorId || !online || typeof indexedDB === "undefined" || typeof offlineQueue.replay !== "function") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void offlineQueue.replay(actorId, async (record, signal) => {
      if (signal.aborted || record.kind !== "recovery") return;
      await recovery.save({ ...record.payload, operationId: record.operationId });
      await queryClient.invalidateQueries({ queryKey: ["recovery"] });
    }).then(async () => {
      const next = (await offlineQueue.list(actorId)).find((record) => record.status === "pending");
      if (next) timer = setTimeout(() => setVersion((value) => value + 1), Math.max(0, next.nextAttemptAt - Date.now()));
    }).catch(() => undefined);
    return () => { if (timer) clearTimeout(timer); };
  }, [offlineQueue, online, queryClient, recovery, session?.user.id, version]);

  return null;
}

export type OfflineSyncState = "idle" | "pending" | "replaying" | "conflict" | "failed";

export function useOfflineSyncStatus() {
  const { session } = useAuth();
  const offlineQueue = useOptionalRepositories()?.offlineQueue;
  const [records, setRecords] = useState<readonly QueueRecord[]>([]);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      const actorId = session?.user.id;
      if (!actorId || !offlineQueue || typeof indexedDB === "undefined") return setRecords([]);
      void offlineQueue.list(actorId).then((next) => { if (active) setRecords(next); }).catch(() => { if (active) setRecords([]); });
    };
    refresh();
    const unsubscribe = typeof offlineQueue?.subscribe === "function" ? offlineQueue.subscribe(refresh) : () => undefined;
    return () => { active = false; unsubscribe(); };
  }, [offlineQueue, session?.user.id]);

  return useMemo(() => {
    const priority: OfflineSyncState[] = ["conflict", "failed", "replaying", "pending"];
    return { state: priority.find((status) => records.some((record) => record.status === status)) ?? "idle", count: records.length };
  }, [records]);
}
