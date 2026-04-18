"use client";
import { createContext, useCallback, useContext, useState, ReactNode } from "react";

type ToastState = { msg: string; error?: boolean } | null;
type ToastCtx = { toast: (msg: string, error?: boolean) => void };

const Ctx = createContext<ToastCtx>({ toast: () => {} });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToastState>(null);

  const toast = useCallback((msg: string, error = false) => {
    setState({ msg, error });
    setTimeout(() => setState(null), 3000);
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      {state && <div className={`toast${state.error ? " error" : ""}`}>{state.error ? "⚠ " : "✓ "}{state.msg}</div>}
    </Ctx.Provider>
  );
}
