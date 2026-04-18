"use client";
import { ReactNode } from "react";

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 600,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full rounded-2xl border border-bg-700 bg-bg-800 shadow-2xl"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-bg-700 px-6 py-4">
          <h3 className="text-lg font-bold text-fg-100">{title}</h3>
          <button
            onClick={onClose}
            className="text-2xl leading-none text-fg-500 hover:text-fg-100"
          >
            ×
          </button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

export function FormRow({ children }: { children: ReactNode }) {
  return <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>;
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-300">
        {label}
      </label>
      {children}
    </div>
  );
}

export const inputCls =
  "w-full rounded-lg border border-bg-700 bg-bg-900 px-4 py-2.5 text-sm text-fg-100 outline-none focus:border-brand-sky";
