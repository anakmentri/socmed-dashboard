"use client";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { Modal, FormRow, Field, inputCls } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { useSession } from "@/hooks/useSession";
import {
  getAllMembers,
  refreshMembersFromDb,
  upsertMember,
  deleteMember,
  COLORS,
  TeamMember,
} from "@/lib/auth";
import { initials, logAs } from "@/lib/utils";

const ALL_PLATFORMS = [
  "Instagram",
  "Facebook",
  "X (Twitter)",
  "TikTok",
  "YouTube",
  "LinkedIn",
  "Telegram",
];

const ROLES = [
  "Team Leader",
  "Content Creator",
  "Video Editor",
  "Editor Video",
  "Graphic Designer",
  "Social Media Specialist",
  "Copywriter",
  "Photographer",
  "Admin",
  "Lainnya",
];

const emptyMember: TeamMember = {
  username: "",
  password: "",
  name: "",
  role: "Content Creator",
  color: "#38bdf8",
  platforms: [],
};

export default function TeamPage() {
  const { session } = useSession();
  const { toast } = useToast();
  const isAdmin = session?.role === "admin";

  const [members, setMembers] = useState<TeamMember[]>(getAllMembers());

  useEffect(() => {
    refreshMembersFromDb().then(setMembers);
  }, []);

  const [showPw, setShowPw] = useState<Record<string, boolean>>({});
  const [modal, setModal] = useState<{
    open: boolean;
    editIdx: number;
    data: TeamMember;
  }>({ open: false, editIdx: -1, data: emptyMember });

  const openAdd = () =>
    setModal({
      open: true,
      editIdx: -1,
      data: { ...emptyMember, color: COLORS[members.length % COLORS.length] },
    });

  const openEdit = (idx: number) => {
    const m = members[idx];
    if (!m) return;
    setModal({ open: true, editIdx: idx, data: { ...m } });
  };

  const close = () => setModal((m) => ({ ...m, open: false }));

  const save = async () => {
    const d = modal.data;
    if (!d.name.trim()) return toast("Nama wajib diisi", true);
    if (!d.username.trim()) return toast("Username wajib diisi", true);
    if (!d.password.trim()) return toast("Password wajib diisi", true);

    const username = d.username.trim().toLowerCase();
    const dupIdx = members.findIndex((t) => t.username === username);
    if (dupIdx >= 0 && dupIdx !== modal.editIdx) {
      return toast(`Username "${username}" sudah dipakai oleh ${members[dupIdx].name}`, true);
    }

    const member: TeamMember = { ...d, username, name: d.name.trim() };
    try {
      await upsertMember(member);
    } catch (e) {
      return toast("Gagal simpan: " + (e instanceof Error ? e.message : "error"), true);
    }
    const refreshed = await refreshMembersFromDb();
    setMembers(refreshed);
    close();
    logAs(
      session,
      modal.editIdx >= 0 ? "Edit Anggota" : "Tambah Anggota",
      "Anggota Tim",
      `${member.name} (${member.role})`
    );
    toast(modal.editIdx >= 0 ? "Anggota diperbarui" : "Anggota baru ditambahkan");
  };

  const remove = async (idx: number) => {
    const m = members[idx];
    if (!m) return;
    if (!confirm(`Hapus anggota "${m.name}" dari dashboard?`)) return;
    await deleteMember(m.username);
    const refreshed = await refreshMembersFromDb();
    setMembers(refreshed);
    logAs(session, "Hapus Anggota", "Anggota Tim", `${m.name} (${m.role})`);
    toast(`${m.name} dihapus`);
  };

  return (
    <PageShell title="Anggota Tim" desc="Kelola daftar anggota tim dashboard">
      <div className="mb-5 flex items-center justify-between">
        <div className="text-sm text-fg-300">
          Total: <span className="font-bold text-fg-100">{members.length}</span> anggota
        </div>
        {isAdmin && (
          <button
            onClick={openAdd}
            className="rounded-lg bg-brand-sky px-4 py-2 text-sm font-bold text-bg-900"
          >
            + Tambah Anggota
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {members.map((m, i) => (
          <div
            key={m.username + i}
            className="group relative overflow-hidden rounded-xl border border-bg-700 bg-bg-800 transition hover:border-bg-600"
          >
            <div
              className="absolute left-0 top-0 h-full w-1"
              style={{ background: m.color }}
            />
            <div className="p-4 pl-5">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-xl text-base font-bold text-white shadow-sm"
                  style={{ backgroundColor: m.color }}
                >
                  {initials(m.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-bold text-fg-100">{m.name}</div>
                  <div className="truncate text-xs text-fg-500">{m.role}</div>
                </div>
              </div>

              <div className="mt-3 space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-16 text-fg-500">Username</span>
                  <span className="font-mono text-fg-200">{m.username}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-16 text-fg-500">Password</span>
                  <span className="font-mono text-fg-200">
                    {showPw[m.username] ? m.password : "••••••••"}
                  </span>
                  <button
                    onClick={() =>
                      setShowPw((p) => ({ ...p, [m.username]: !p[m.username] }))
                    }
                    className="text-[10px] text-brand-sky hover:underline"
                  >
                    {showPw[m.username] ? "Sembunyikan" : "Lihat"}
                  </button>
                </div>
                <div className="flex items-start gap-2 pt-1">
                  <span className="w-16 shrink-0 text-fg-500">Sosmed</span>
                  <div className="flex flex-wrap gap-1">
                    {(m.platforms && m.platforms.length > 0) ? m.platforms.map((p) => (
                      <span
                        key={p}
                        className="rounded bg-bg-700 px-1.5 py-0.5 text-[10px] font-semibold text-fg-200"
                      >
                        {p}
                      </span>
                    )) : (
                      <span className="text-[10px] text-fg-600">Belum diatur</span>
                    )}
                  </div>
                </div>
              </div>

              {isAdmin && (
                <div className="mt-3 flex gap-2 border-t border-bg-700 pt-3">
                  <button
                    onClick={() => openEdit(i)}
                    className="rounded bg-bg-700 px-3 py-1 text-xs text-brand-sky hover:bg-bg-600"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(i)}
                    className="rounded bg-red-950/50 px-3 py-1 text-xs text-brand-rose hover:bg-red-950"
                  >
                    Hapus
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={modal.open}
        onClose={close}
        title={modal.editIdx >= 0 ? "Edit Anggota" : "Tambah Anggota Baru"}
      >
        <FormRow>
          <Field label="Nama Lengkap">
            <input
              className={inputCls}
              value={modal.data.name}
              placeholder="Contoh: Budi"
              onChange={(e) =>
                setModal((m) => ({ ...m, data: { ...m.data, name: e.target.value } }))
              }
            />
          </Field>
          <Field label="Role / Jabatan">
            <select
              className={inputCls}
              value={modal.data.role}
              onChange={(e) =>
                setModal((m) => ({ ...m, data: { ...m.data, role: e.target.value } }))
              }
            >
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Username (Login)">
            <input
              className={inputCls}
              value={modal.data.username}
              placeholder="huruf kecil, tanpa spasi"
              onChange={(e) =>
                setModal((m) => ({
                  ...m,
                  data: { ...m.data, username: e.target.value.replace(/\s/g, "") },
                }))
              }
            />
          </Field>
          <Field label="Password (Login)">
            <input
              className={inputCls}
              value={modal.data.password}
              placeholder="minimal 6 karakter"
              onChange={(e) =>
                setModal((m) => ({ ...m, data: { ...m.data, password: e.target.value } }))
              }
            />
          </Field>
        </FormRow>
        <div className="mb-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-300">
            Pemegang Sosial Media
          </label>
          <div className="flex flex-wrap gap-2">
            {ALL_PLATFORMS.map((p) => {
              const selected = modal.data.platforms?.includes(p) || false;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() =>
                    setModal((m) => {
                      const cur = m.data.platforms || [];
                      const next = selected
                        ? cur.filter((x) => x !== p)
                        : [...cur, p];
                      return { ...m, data: { ...m.data, platforms: next } };
                    })
                  }
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    selected
                      ? "bg-brand-sky text-bg-900"
                      : "border border-bg-700 bg-bg-900 text-fg-400 hover:border-bg-600"
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mb-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-300">
            Warna Avatar
          </label>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() =>
                  setModal((m) => ({ ...m, data: { ...m.data, color: c } }))
                }
                className={`h-8 w-8 rounded-lg border-2 transition ${
                  modal.data.color === c ? "border-white scale-110" : "border-transparent"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <div className="mb-4 rounded-lg border border-bg-700 bg-bg-900 p-3">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-fg-500">Preview</div>
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ backgroundColor: modal.data.color }}
            >
              {modal.data.name ? initials(modal.data.name) : "?"}
            </div>
            <div>
              <div className="text-sm font-bold text-fg-100">
                {modal.data.name || "Nama Anggota"}
              </div>
              <div className="text-[10px] text-fg-500">{modal.data.role}</div>
            </div>
          </div>
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
            {modal.editIdx >= 0 ? "Simpan" : "Tambah Anggota"}
          </button>
        </div>
      </Modal>
    </PageShell>
  );
}
