"use client";

// Lightweight in-app toast + undo (presentation only — no new dependency, no
// lib/* logic, no network). Used for forgiveness affordances: "Removed X · Undo".
// The Undo action just calls back into the existing add path the caller passes.

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastAction = { label: string; onClick: () => void };
type Toast = { id: number; message: string; action?: ToastAction };
type ToastApi = { show: (message: string, action?: ToastAction) => void };

const ToastContext = createContext<ToastApi | null>(null);
const TOAST_TTL_MS = 7000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message: string, action?: ToastAction) => {
      nextId.current += 1;
      const id = nextId.current;
      setToasts((current) => [...current, { id, message, action }]);
      if (typeof window !== "undefined") {
        window.setTimeout(() => dismiss(id), TOAST_TTL_MS);
      }
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="toast-viewport" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast" data-testid="toast">
            <span className="toast-message">{toast.message}</span>
            {toast.action ? (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  toast.action?.onClick();
                  dismiss(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
            <button
              type="button"
              className="toast-close"
              aria-label="Dismiss"
              onClick={() => dismiss(toast.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Tolerant: returns a no-op outside a provider so isolated renders never crash.
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? { show: () => undefined };
}
