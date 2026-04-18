"use client";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { DateNav } from "@/components/DateNav";
import { Modal, FormRow, Field, inputCls } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";
import { IrData } from "@/lib/types";
import { today, fN, fmtIdDate, logAs } from "@/lib/utils";

const emptyIr: IrData = {
  date: today(),
  sosmed: "",
  tim: "",
  color: "#a78bfa",
  anggota: "",
  periode: "Minggu 1",
  bulan: today().slice(0, 7),
  realisasi: 0,
  realisasi_label: "Upload",
  output: 0,
  output_label: "Views",
  issue: "",
  level: "",
  status: "",
  izin: "",
};

export default function InputReportPage() {
  const { session } = useSession();
  const { toast } = useToast();
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<IrData[]>([]);
  const [modal, setModal] = useState<{ open: boolean; idx: number; data: IrData }>({
    open: false,
    idx: -1,
    data: emptyIr,
  });
  const isMember = session?.role === "member";
  const myName = session?.memberName || "";

  const load = async () => {
    let q = supabase.from("ir_data").select("*").eq("date", date);
    if (isMember) q = q.eq("anggota", myName);
    const { data } = await q;
    setRows((data as IrData[]) || []);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const openAdd = () =>
    setModal({
      open: true,
      idx: -1,
      data: { ...emptyIr, date, bulan: date.slice(0, 7), anggota: isMember ? myName : "" },
    });
  const openEdit = (r: IrData, i: number) => setModal({ open: true, idx: i, data: { ...r } });
  const close = () => setModal((m) => ({ ...m, open: false }));

  const save = async () => {
    const d = modal.data;
    if (!d.sosmed) return toast("Platform wajib dipilih", true);
    if (!d.anggota) return toast("Anggota wajib dipilih", true);
    const payload = { ...d };
    delete (payload as { id?: number }).id;
    if (modal.idx < 0) {
      const { error } = await supabase.from("ir_data").insert(payload);
      if (error) return toast("Gagal: " + error.message, true);
      logAs(session, "Tambah Input Report", "Input Report", `${d.anggota} · ${d.sosmed} · ${d.realisasi || 0} upload`);
      toast("Data ditambahkan");
    } else {
      const { error } = await supabase.from("ir_data").update(payload).eq("id", d.id!);
      if (error) return toast("Gagal: " + error.message, true);
      logAs(session, "Edit Input Report", "Input Report", `${d.anggota} · ${d.sosmed}`);
      toast("Data diperbarui");
    }
    close();
    load();
  };

  const remove = async (r: IrData) => {
    if (!confirm(`Hapus data ${r.anggota}?`)) return;
    const { error } = await supabase.from("ir_data").delete().eq("id", r.id!);
    if (error) return toast("Gagal: " + error.message, true);
    logAs(session, "Hapus Input Report", "Input Report", `${r.anggota} · ${r.sosmed}`);
    toast("Data dihapus");
    load();
  };

  return (
    <PageShell title="Input Report" desc="Data realisasi & output per anggota tim">
      <DateNav value={date} onChange={setDate} />

      <div className="mb-4 flex justify-between">
        <div className="text-sm text-fg-300">
          Total: <span className="font-bold text-fg-100">{rows.length}</span> entri ·{" "}
          <span className="text-brand-amber">{fN(rows.reduce((a, r) => a + r.realisasi, 0))}</span>{" "}
          upload ·{" "}
          <span className="text-brand-sky">{fN(rows.reduce((a, r) => a + r.output, 0))}</span> views
        </div>
        <button
          onClick={openAdd}
          className="rounded-lg bg-brand-sky px-4 py-2 text-sm font-bold text-bg-900 hover:opacity-90"
        >
          + Tambah Data
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-bg-700 bg-bg-800">
        <table className="w-full text-sm">
          <thead className="bg-bg-900 text-left text-xs uppercase text-fg-500">
            <tr>
              <th className="p-3">Anggota</th>
              <th className="p-3">Platform</th>
              <th className="p-3">Tim</th>
              <th className="p-3">Periode</th>
              <th className="p-3">Realisasi</th>
              <th className="p-3">Output</th>
              <th className="p-3">Issue</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-fg-500">
                  Belum ada data untuk tanggal {fmtIdDate(date)}
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t border-bg-700 hover:bg-bg-700/30">
                <td className="p-3 font-semibold text-fg-100">{r.anggota}</td>
                <td className="p-3">{r.sosmed}</td>
                <td className="p-3">{r.tim}</td>
                <td className="p-3 text-fg-300">{r.periode}</td>
                <td className="p-3 font-bold text-brand-amber">
                  {fN(r.realisasi)} {r.realisasi_label}
                </td>
                <td className="p-3 font-bold text-brand-sky">
                  {fN(r.output)} {r.output_label}
                </td>
                <td className="p-3 text-xs text-fg-500">{r.issue || "-"}</td>
                <td className="p-3 text-right">
                  <button
                    onClick={() => openEdit(r, i)}
                    className="mr-2 rounded bg-bg-700 px-3 py-1 text-xs font-semibold text-brand-sky hover:bg-bg-700/70"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(r)}
                    className="rounded bg-red-950/50 px-3 py-1 text-xs font-semibold text-brand-rose hover:bg-red-950/70"
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
        title={modal.idx < 0 ? "Tambah Input Report" : "Edit Input Report"}
      >
        <FormRow>
          <Field label="Tanggal">
            <input
              type="date"
              className={inputCls}
              value={modal.data.date}
              onChange={(e) =>
                setModal((m) => ({
                  ...m,
                  data: { ...m.data, date: e.target.value, bulan: e.target.value.slice(0, 7) },
                }))
              }
            />
          </Field>
          <Field label="Anggota">
            <input
              className={inputCls}
              value={modal.data.anggota}
              disabled={isMember}
              onChange={(e) =>
                setModal((m) => ({ ...m, data: { ...m.data, anggota: e.target.value } }))
              }
            />
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Platform">
            <select
              className={inputCls}
              value={modal.data.sosmed}
              onChange={(e) =>
                setModal((m) => ({ ...m, data: { ...m.data, sosmed: e.target.value } }))
              }
            >
              <option value="">-- pilih --</option>
              {["Instagram", "Facebook", "X (Twitter)", "TikTok", "YouTube", "LinkedIn", "Telegram"].map(
                (p) => (
                  <option key={p}>{p}</option>
                )
              )}
            </select>
          </Field>
          <Field label="Tim">
            <input
              className={inputCls}
              value={modal.data.tim}
              onChange={(e) =>
                setModal((m) => ({ ...m, data: { ...m.data, tim: e.target.value } }))
              }
            />
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Periode">
            <select
              className={inputCls}
              value={modal.data.periode}
              onChange={(e) =>
                setModal((m) => ({ ...m, data: { ...m.data, periode: e.target.value } }))
              }
            >
              {["Minggu 1", "Minggu 2", "Minggu 3", "Minggu 4", "Bulanan"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              className={inputCls}
              value={modal.data.status}
              onChange={(e) =>
                setModal((m) => ({ ...m, data: { ...m.data, status: e.target.value } }))
              }
            >
              <option value="">-</option>
              <option>Open</option>
              <option>Closed</option>
            </select>
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Realisasi (Upload)">
            <input
              type="number"
              className={inputCls}
              value={modal.data.realisasi}
              onChange={(e) =>
                setModal((m) => ({ ...m, data: { ...m.data, realisasi: +e.target.value } }))
              }
            />
          </Field>
          <Field label="Output (Views)">
            <input
              type="number"
              className={inputCls}
              value={modal.data.output}
              onChange={(e) =>
                setModal((m) => ({ ...m, data: { ...m.data, output: +e.target.value } }))
              }
            />
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Issue">
            <input
              className={inputCls}
              value={modal.data.issue}
              onChange={(e) =>
                setModal((m) => ({ ...m, data: { ...m.data, issue: e.target.value } }))
              }
            />
          </Field>
          <Field label="Level">
            <select
              className={inputCls}
              value={modal.data.level}
              onChange={(e) =>
                setModal((m) => ({ ...m, data: { ...m.data, level: e.target.value } }))
              }
            >
              <option value="">-</option>
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
            </select>
          </Field>
        </FormRow>
        <div className="mt-4 flex justify-end gap-2 border-t border-bg-700 pt-4">
          <button
            onClick={close}
            className="rounded-lg border border-bg-700 px-4 py-2 text-sm text-fg-300 hover:bg-bg-700"
          >
            Batal
          </button>
          <button
            onClick={save}
            className="rounded-lg bg-brand-sky px-6 py-2 text-sm font-bold text-bg-900 hover:opacity-90"
          >
            Simpan
          </button>
        </div>
      </Modal>
    </PageShell>
  );
}
