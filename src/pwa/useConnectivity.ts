import { useEffect, useState } from "react";

function readConnectivity() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function useConnectivity() {
  const [isOnline, setOnline] = useState(readConnectivity);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
