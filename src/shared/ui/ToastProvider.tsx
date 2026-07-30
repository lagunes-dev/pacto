import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";

export type ToastMessage = { title: string; message: string };

const ToastContext = createContext<{ show: (message: ToastMessage) => void } | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<(ToastMessage & { id: number }) | null>(null);
  const nextId = useRef(0);

  const show = useCallback((message: ToastMessage) => {
    setToast({ ...message, id: ++nextId.current });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 5_000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <div key={toast.id} className="toast" role="status" aria-live="polite" aria-atomic="true">
          <strong>{toast.title}</strong>
          <span>{toast.message}</span>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
