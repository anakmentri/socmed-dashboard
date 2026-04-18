"use client";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { Modal, FormRow, Field, inputCls } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { supabase } from "@/lib/supabase";
import { Platform } from "@/lib/types";
import { fN } from "@/lib/utils";

const empty: Platform = {
  name: "",
  icon: "",
  color: "ig-bg",
  followers: 0,
  following: 0,
  posts: 0,
  eng: 0,
  growth: 0,
  growth_pct: 0,
  hex: "#38bdf8",
};

export default function PlatformsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Platform[]>([]);
  const [modal, setModal] = useState<{ open: boolean; idx: number; data: Platform }>({
    open: false,
    idx: -1,
    data: empty,
  });

  const load = async () => {
    const { data } = await supabase.from("platforms").select("*");
    setRows((data as Platform[]) || []);
  };
  useEffect(() => {
    load();
  }, []);

  const openAdd = () => setModal({ open: true, idx: -1, data: empty });
  const openEdit = (r: Platform, i: number) => setModal({ open: true, idx: i, data: { ...r } });
  const close = () => setModal((m) => ({ ...m, open: false }));

  const save = async () => {
    const d = modal.data;
    if (!d.name) return toast("Nama platform wajib", true);
    const payload = { ...d };
    delete (payload as { id?: number }).id;
    if (modal.idx < 0) {
      const { error } = await supabase.from("platforms").insert(payload);
      if (error) return toast(error.message, true);
    } else {
      const { error } = await supabase.from("platforms").update(payload).eq("id", d.id!);
      if (error) return toast(error.message, true);
    }
    toast("Platform tersimpan");
    close();
    load();
  };

  const remove = async (r: Platform) => {
    if (!confirm(`Hapus ${r.name}?`)) return;
    await supabase.from("platforms").delete().eq("id", r.id!);
    toast("Platform dihapus");
    load();
  };

  const removeAll = async () => {
    if (!confirm(`Hapus SEMUA ${rows.length} platform?`)) return;
    for (const r of rows) await supabase.from("platforms").delete().eq("id", r.id!);
    toast("Semua platform dihapus");
    load();
  };

  return (
    <PageShell title="Platform" desc="Kelola akun dan data setiap platform">
      <div className="mb-4 flex justify-between">
        <h3 className="text-lg font-bold text-fg-100">Kelola Platform</h3>
        <div className="flex gap-2">
          <button
            onClick={removeAll}
            className="rounded-lg border border-red-900 px-4 py-2 text-sm text-brand-rose hover:bg-red-950/20"
          >
            🗑 Hapus Semua
          </button>
          <button onClick={openAdd} className="rounded-lg bg-brand-sky px-4 py-2 text-sm font-bold text-bg-900">
            + Tambah Platform
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-bg-700 bg-bg-900 p-8 text-center text-fg-500 md:col-span-2 xl:col-span-3">
            📦 Belum ada platform. Klik + Tambah Platform untuk menambahkan.
          </div>
        )}
        {rows.map((r, i) => (
          <div key={r.id} className="rounded-xl border border-bg-700 bg-bg-800 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="font-bold text-fg-100">{r.name}</div>
                <div className="text-xs text-fg-500">{fN(r.followers)} followers</div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => openEdit(r, i)}
                  className="rounded bg-bg-700 px-3 py-1 text-xs text-brand-sky"
                >
                  Edit
                </button>
                <button
                  onClick={() => remove(r)}
                  className="rounded bg-red-950/50 px-3 py-1 text-xs text-brand-rose"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                Engagement: <span className="font-bold text-brand-emerald">{r.eng}%</span>
              </div>
              <div>
                Growth: <span className="font-bold text-brand-sky">+{fN(r.growth)}</span>
              </div>
              <div>
                Following: <span className="font-bold">{fN(r.following)}</span>
              </div>
              <div>
                Posts: <span className="font-bold">{fN(r.posts)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal open={modal.open} onClose={close} title={modal.idx < 0 ? "Tambah Platform" : "Edit Platform"}>
        <FormRow>
          <Field label="Nama">
            <input
              className={inputCls}
              value={modal.data.name}
              onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, name: e.target.value } }))}
            />
          </Field>
          <Field label="Icon (2 huruf)">
            <input
              className={inputCls}
              value={modal.data.icon}
              maxLength={3}
              onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, icon: e.target.value } }))}
            />
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Followers">
            <input
              type="number"
              className={inputCls}
              value={modal.data.followers}
              onChange={(e) =>
                setModal((m) => ({ ...m, data: { ...m.data, followers: +e.target.value } }))
              }
            />
          </Field>
          <Field label="Following">
            <input
              type="number"
              className={inputCls}
              value={modal.data.following}
              onChange={(e) =>
                setModal((m) => ({ ...m, data: { ...m.data, following: +e.target.value } }))
              }
            />
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Engagement %">
            <input
              type="number"
              step="0.1"
              className={inputCls}
              value={modal.data.eng}
              onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, eng: +e.target.value } }))}
            />
          </Field>
          <Field label="Growth">
            <input
              type="number"
              className={inputCls}
              value={modal.data.growth}
              onChange={(e) =>
                setModal((m) => ({ ...m, data: { ...m.data, growth: +e.target.value } }))
              }
            />
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Posts">
            <input
              type="number"
              className={inputCls}
              value={modal.data.posts}
              onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, posts: +e.target.value } }))}
            />
          </Field>
          <Field label="Hex Color">
            <input
              className={inputCls}
              value={modal.data.hex}
              onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, hex: e.target.value } }))}
            />
          </Field>
        </FormRow>
        <div className="flex justify-end gap-2 border-t border-bg-700 pt-4">
          <button onClick={close} className="rounded-lg border border-bg-700 px-4 py-2 text-sm text-fg-300">
            Batal
          </button>
          <button onClick={save} className="rounded-lg bg-brand-sky px-6 py-2 text-sm font-bold text-bg-900">
            Simpan
          </button>
        </div>
      </Modal>
    </PageShell>
  );
}
