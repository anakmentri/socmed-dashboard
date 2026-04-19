"use client";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { DateNav } from "@/components/DateNav";
import { Modal, FormRow, Field, inputCls } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";
import { DailyWork } from "@/lib/types";
import { today, fmtIdDate } from "@/lib/utils";

const PLATFORMS = [
  "Instagram",
  "Facebook",
  "X (Twitter)",
  "TikTok",
  "YouTube",
  "LinkedIn",
  "Telegram",
  "Semprot",
];

const empty: DailyWork = {
  date: today(),
  name: "",
  platform: "Instagram",
  activity: "",
  status: "done",
  notes: "",
};

export default function ContentPage() {
  const { session } = useSession();
  const { toast } = useToast();
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<DailyWork[]>([]);
  const [modal, setModal] = useState<{ open: boolean; idx: number; data: DailyWork }>({
    open: false,
    idx: -1,
    data: empty,
  });
  const isMember = session?.role === "member";
  const myName = session?.memberName || "";

  const load = async () => {
    let q = supabase.from("daily_work").select("*").eq("date", date);
    if (isMember) q = q.eq("name", myName);
    const { data } = await q;
    setRows((data as DailyWork[]) || []);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const openAdd = () =>
    setModal({
      open: true,
      idx: -1,
      data: { ...empty, date, name: isMember ? myName : "" },
    });
  const openEdit = (r: DailyWork, i: number) =>
    setModal({ open: true, idx: i, data: { ...r } });
  const close = () => setModal((m) => ({ ...m, open: false }));

  const save = async () => {
    const d = modal.data;
    if (!d.activity) return toast("Aktivitas wajib diisi", true);
    if (!d.name) return toast("Nama anggota wajib diisi", true);
    const payload = { ...d };
    delete (payload as { id?: number }).id;
    if (modal.idx < 0) {
      const { error } = await supabase.from("daily_work").insert(payload);
      if (error) return toast(error.message, true);
      toast("Aktivitas ditambahkan");
    } else {
      const { error } = await supabase.from("daily_work").update(payload).eq("id", d.id!);
      if (error) return toast(error.message, true);
      toast("Aktivitas diperbarui");
    }
    close();
    load();
  };

  const changeStatus = async (r: DailyWork, status: DailyWork["status"]) => {
    await supabase.from("daily_work").update({ status }).eq("id", r.id!);
    load();
  };

  const remove = async (r: DailyWork) => {
    if (!confirm("Hapus aktivitas ini?")) return;
    await supabase.from("daily_work").delete().eq("id", r.id!);
    toast("Aktivitas dihapus");
    load();
  };

  const statusColor = (s: string) =>
    s === "done"
      ? "bg-emerald-950 text-brand-emerald"
      : s === "progress"
      ? "bg-amber-950/50 text-brand-amber"
      : "bg-bg-700 text-fg-300";

  return (
    <PageShell title="Pengerjaan" desc="Data pengerjaan harian sosial media per tanggal">
      <DateNav value={date} onChange={setDate} />
      <div className="mb-4 flex justify-between">
        <div className="text-sm text-fg-300">
          Total: <span className="font-bold text-fg-100">{rows.length}</span> aktivitas
        </div>
        <button
          onClick={openAdd}
          className="rounded-lg bg-brand-sky px-4 py-2 text-sm font-bold text-bg-900"
        >
          + Tambah Aktivitas
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-bg-700 bg-bg-800">
        <table className="w-full text-sm">
          <thead className="bg-bg-900 text-left text-xs uppercase text-fg-500">
            <tr>
              <th className="p-3">Anggota</th>
              <th className="p-3">Platform</th>
              <th className="p-3">Aktivitas</th>
              <th className="p-3">Status</th>
              <th className="p-3">Catatan</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-fg-500">
                  Belum ada aktivitas untuk {fmtIdDate(date)}
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t border-bg-700 hover:bg-bg-700/30">
                <td className="p-3 font-semibold text-fg-100">{r.name}</td>
                <td className="p-3">{r.platform}</td>
                <td className="p-3 text-fg-300">{r.activity}</td>
                <td className="p-3">
                  <select
                    value={r.status}
                    onChange={(e) => changeStatus(r, e.target.value as DailyWork["status"])}
                    className={`rounded px-2 py-1 text-[11px] font-bold uppercase ${statusColor(
                      r.status
                    )}`}
                  >
                    <option value="done">Selesai</option>
                    <option value="progress">Dikerjakan</option>
                    <option value="pending">Pending</option>
                  </select>
                </td>
                <td className="p-3 text-xs text-fg-500">{r.notes || "-"}</td>
                <td className="p-3 text-right">
                  <button
                    onClick={() => openEdit(r, i)}
                    className="mr-2 rounded bg-bg-700 px-3 py-1 text-xs font-semibold text-brand-sky"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(r)}
                    className="rounded bg-red-950/50 px-3 py-1 text-xs font-semibold text-brand-rose"
                  >
                    Hapus
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={modal.open}
        onClose={close}
        title={modal.idx < 0 ? "Tambah Aktivitas" : "Edit Aktivitas"}
      >
        <FormRow>
          <Field label="Tanggal">
            <input
              type="date"
              className={inputCls}
              value={modal.data.date}
              onChange={(e) =>
                setModal((m) => ({ ...m, data: { ...m.data, date: e.target.value } }))
              }
            />
          </Field>
          <Field label="Anggota">
            <input
              className={inputCls}
              value={modal.data.name}
              disabled={isMember}
              onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, name: e.target.value } }))}
            />
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Platform">
            <select
              className={inputCls}
              value={modal.data.platform}
              onChange={(e) =>
                setModal((m) => ({ ...m, data: { ...m.data, platform: e.target.value } }))
              }
            >
              {PLATFORMS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              className={inputCls}
              value={modal.data.status}
              onChange={(e) =>
                setModal((m) => ({
                  ...m,
                  data: { ...m.data, status: e.target.value as DailyWork["status"] },
                }))
              }
            >
              <option value="done">Selesai</option>
              <option value="progress">Dikerjakan</option>
              <option value="pending">Pending</option>
            </select>
          </Field>
        </FormRow>
        <div className="mb-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-300">
            Aktivitas
          </label>
          <textarea
            className={inputCls + " min-h-[80px]"}
            value={modal.data.activity}
            onChange={(e) =>
              setModal((m) => ({ ...m, data: { ...m.data, activity: e.target.value } }))
            }
          />
        </div>
        <div className="mb-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-300">
            Catatan (opsional)
          </label>
          <input
            className={inputCls}
            value={modal.data.notes}
            onChange={(e) =>
              setModal((m) => ({ ...m, data: { ...m.data, notes: e.target.value } }))
            }
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-bg-700 pt-4">
          <button
            onClick={close}
            className="rounded-lg border border-bg-700 px-4 py-2 text-sm text-fg-300"
          >
            Batal
          </button>
          <button
            onClick={save}
            className="rounded-lg bg-brand-sky px-6 py-2 text-sm font-bold text-bg-900"
          >
            Simpan
          </button>
        </div>
      </Modal>
    </PageShell>
  );
}
