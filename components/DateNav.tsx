"use client";
import { fmtIdDate, dayName, today } from "@/lib/utils";

export function DateNav({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const shift = (d: number) => {
    const date = new Date(value || new Date());
    date.setDate(date.getDate() + d);
    onChange(date.toISOString().split("T")[0]);
  };
  const isToday = value === today();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <button
        onClick={() => shift(-1)}
        className="rounded-lg border border-bg-700 bg-bg-800 px-3 py-2 text-sm hover:bg-bg-700"
      >
        ◀
      </button>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-bg-700 bg-bg-800 px-4 py-2 text-sm text-fg-100 outline-none"
      />
      <button
        onClick={() => shift(1)}
        className="rounded-lg border border-bg-700 bg-bg-800 px-3 py-2 text-sm hover:bg-bg-700"
      >
        ▶
      </button>
      <button
        onClick={() => onChange(today())}
        className="rounded-lg border border-bg-700 bg-bg-800 px-3 py-2 text-sm hover:bg-bg-700"
      >
        Hari Ini
      </button>
      <div className="ml-auto rounded-lg border-l-4 border-brand-sky bg-bg-800 px-4 py-2">
        <span className="mr-3 rounded bg-brand-sky px-2 py-0.5 text-[10px] font-bold uppercase text-bg-900">
          {dayName(value)}
        </span>
        <span className="text-sm font-bold text-fg-100">{fmtIdDate(value)}</span>
        {isToday && <span className="ml-2 text-xs text-brand-emerald">(Hari Ini)</span>}
      </div>
    </div>
  );
}
