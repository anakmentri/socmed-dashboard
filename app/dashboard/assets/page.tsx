"use client";
import { useState, useEffect } from "react";
import { PageShell } from "@/components/PageShell";
import { Modal, FormRow, Field, inputCls } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";
import { Asset } from "@/lib/types";
import { DateNav } from "@/components/DateNav";
import { today, fmtIdDate, packAssetUrl, unpackAssetUrl, logAs } from "@/lib/utils";
import { useCachedData } from "@/hooks/useCachedData";
import { invalidateCache } from "@/lib/cache";

type Row = Asset & { id: number };

const empty: Asset = {
  title: "",
  type: "foto",
  caption: "",
  link: "",
  image: "",
  date: today(),
  provider: "",
  notes: "",
  status: "available",
};

const ASSETS_CACHE_KEY = "assets_all";

export default function AssetsPage() {
  const { session } = useSession();
  const { toast } = useToast();
  const [date, setDate] = useState(today());
  const [modal, setModal] = useState<{ open: boolean; idx: number; data: Asset }>({
    open: false,
    idx: -1,
    data: empty,
  });
  const isMember = session?.role === "member";
  const myName = session?.memberName || (session?.role === "admin" ? "admin" : "");
  const ALLOWED_UPLOADERS = ["Tlegu", "Rully"];
  const canUpload =
    session?.role === "admin" || ALLOWED_UPLOADERS.includes(session?.memberName || "");

  // Fetcher dengan logging error spesifik
  const fetchAssets = async (): Promise<Row[]> => {
    const { data, error } = await supabase
      .from("assets")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[assets] fetch error:", error);
      throw error;
    }
    if (!data || !Array.isArray(data)) {
      console.warn("[assets] empty/invalid response", data);
      return [];
    }
    const mapped = (data as Array<{
      id: number;
      name: string;
      type: string;
      url: string;
      uploaded_by: string;
    }>).map((a) => {
      const u = unpackAssetUrl(a.url);
      return {
        id: a.id,
        title: a.name,
        type: (a.type as "foto" | "video") || "foto",
        caption: u.caption,
        link: u.link,
        image: u.image,
        date: u.date,
        provider: a.uploaded_by,
        notes: u.notes,
        status: u.status as "available" | "used",
      };
    });
    console.log(`[assets] loaded ${mapped.length} rows`);
    return mapped;
  };

  // Fetcher untuk CACHE: strip image (base64 gede) biar muat di localStorage
  const fetchAssetsLight = async (): Promise<Row[]> => {
    const fullRows = await fetchAssets();
    return fullRows.map((r) => ({ ...r, image: r.image ? "[cached]" : "" }));
  };

  const {
    data: rowsCached,
    loading,
    refresh,
    isStale,
    mutate,
  } = useCachedData<Row[]>({
    key: ASSETS_CACHE_KEY,
    fetcher: fetchAssetsLight, // cache versi tanpa image base64
    preserveOnEmpty: true,
  });

  // Local fresh state — diisi dari fetch full (dengan image) saat mount
  const [freshRows, setFreshRows] = useState<Row[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchAssets()
      .then((rows) => {
        if (!cancelled) setFreshRows(rows);
      })
      .catch((e) => console.error("[assets] full fetch failed:", e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pakai fresh kalau ada (dengan image full), fallback ke cache
  const rows: Row[] = freshRows || rowsCached || [];

  // Force fresh dari server (refresh cache + freshRows)
  const load = async () => {
    invalidateCache(ASSETS_CACHE_KEY);
    const [, full] = await Promise.all([refresh(), fetchAssets()]);
    setFreshRows(full);
  };

  // Optimistic update — pakai setelah add/edit/delete supaya UI tidak flicker
  const optimisticAdd = (newRow: Row) => {
    setFreshRows((prev) => [newRow, ...(prev || [])]);
    mutate((prev) => [newRow, ...(prev || [])]);
  };
  const optimisticUpdate = (id: number, patch: Partial<Row>) => {
    setFreshRows((prev) => (prev || []).map((r) => (r.id === id ? { ...r, ...patch } : r)));
    mutate((prev) => (prev || []).map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const optimisticRemove = (id: number) => {
    setFreshRows((prev) => (prev || []).filter((r) => r.id !== id));
    mutate((prev) => (prev || []).filter((r) => r.id !== id));
  };

  const [typeFilter, setTypeFilter] = useState<"all" | "foto" | "video">("all");
  const [providerFilter, setProviderFilter] = useState<"all" | "Tlegu" | "Rully" | "Lainnya">("all");
  const [showAllDates, setShowAllDates] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = rows.filter((r) => {
    if (!showAllDates && r.date !== date) return false;
    if (typeFilter !== "all" && r.type !== typeFilter) return false;
    if (providerFilter !== "all") {
      if (providerFilter === "Lainnya") {
        if (r.provider === "Tlegu" || r.provider === "Rully") return false;
      } else if (r.provider !== providerFilter) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const hay = `${r.title} ${r.caption} ${r.provider} ${r.notes}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const baseRows = showAllDates ? rows : rows.filter((r) => r.date === date);
  const fotoCount = baseRows.filter((r) => r.type === "foto").length;
  const videoCount = baseRows.filter((r) => r.type === "video").length;
  const tleguCount = baseRows.filter((r) => r.provider === "Tlegu").length;
  const rullyCount = baseRows.filter((r) => r.provider === "Rully").length;
  const lainnyaCount = baseRows.filter(
    (r) => r.provider !== "Tlegu" && r.provider !== "Rully"
  ).length;
  const totalAllDates = rows.length;

  const openAdd = () => {
    if (!canUpload) {
      toast("Hanya Tlegu & Rully yang bisa menambahkan asset", true);
      return;
    }
    setModal({ open: true, idx: -1, data: { ...empty, provider: myName, date } });
  };
  const openEdit = (r: Row, i: number) => {
    if (!canUpload) { toast("Hanya Tlegu & Rully yang bisa edit asset", true); return; }
    setModal({ open: true, idx: i, data: { ...r } });
  };
  const close = () => setModal((m) => ({ ...m, open: false }));

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast("Maks 2 MB", true);
    const reader = new FileReader();
    reader.onload = () =>
      setModal((m) => ({ ...m, data: { ...m.data, image: String(reader.result || "") } }));
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!canUpload) return toast("Hanya Tlegu & Rully yang bisa menambahkan asset", true);
    const d = modal.data;
    if (!d.title) return toast("Title wajib diisi", true);
    if (!d.caption) return toast("Caption wajib diisi", true);
    if (d.type === "foto" && !d.image) return toast("Upload gambar wajib untuk tipe Foto", true);
    if (d.type === "video" && !d.link) return toast("Link video wajib untuk tipe Video", true);
    if (!confirm(`Pastikan tanggal sudah benar:\n\n→ ${fmtIdDate(d.date)}\n\nTitle: ${d.title}\n\nLanjut simpan?`))
      return;

    const payload = {
      name: d.title,
      type: d.type,
      url: packAssetUrl(d),
      uploaded_by: d.provider || myName,
    };
    if (modal.idx < 0) {
      const { data: inserted, error } = await supabase
        .from("assets")
        .insert(payload)
        .select()
        .single();
      if (error) return toast(error.message, true);
      // Optimistic add — UI langsung ke-update tanpa nunggu refetch
      if (inserted) {
        const newRow: Row = {
          id: inserted.id,
          title: d.title,
          type: d.type,
          caption: d.caption,
          link: d.link,
          image: d.image,
          date: d.date,
          provider: d.provider || myName,
          notes: d.notes,
          status: d.status,
        };
        optimisticAdd(newRow);
      }
      logAs(session, `Tambah Asset ${d.type}`, "Asset", `${d.title}`);
      toast("Asset ditambahkan");
    } else {
      const targetId = rows[modal.idx].id;
      const { error } = await supabase.from("assets").update(payload).eq("id", targetId);
      if (error) return toast(error.message, true);
      // Optimistic update
      optimisticUpdate(targetId, {
        title: d.title,
        type: d.type,
        caption: d.caption,
        link: d.link,
        image: d.image,
        date: d.date,
        provider: d.provider || myName,
        notes: d.notes,
      });
      logAs(session, `Edit Asset ${d.type}`, "Asset", `${d.title}`);
      toast("Asset diperbarui");
    }
    close();
    // Background refresh untuk sync data baru, tapi UI sudah update dulu
    fetchAssets().then(setFreshRows).catch(() => {});
    refresh();
  };

  const remove = async (r: Row) => {
    if (!canUpload) { toast("Hanya Tlegu & Rully yang bisa hapus asset", true); return; }
    if (!confirm(`Hapus asset "${r.title}"?`)) return;
    // Optimistic: hilangkan dulu di UI, baru DB
    optimisticRemove(r.id);
    const { error } = await supabase.from("assets").delete().eq("id", r.id);
    if (error) {
      // Rollback kalau gagal — revalidate dari server
      toast(`Gagal hapus: ${error.message}`, true);
      fetchAssets().then(setFreshRows).catch(() => {});
      refresh();
      return;
    }
    logAs(session, "Hapus Asset", "Asset", r.title);
    toast("Asset dihapus");
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast(`${label} di-copy`);
  };

  return (
    <PageShell title="Asset Library" desc="Database asset postingan: gambar, link, dan caption siap pakai">
      {!showAllDates && <DateNav value={date} onChange={setDate} />}

      {/* Toggle: Tampil per tanggal / Semua tanggal + search */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-bg-700 bg-bg-800 p-1">
          <button
            onClick={() => setShowAllDates(false)}
            className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
              !showAllDates ? "bg-brand-sky text-bg-900" : "text-fg-400 hover:text-fg-100"
            }`}
          >
            📅 Tanggal ini
          </button>
          <button
            onClick={() => setShowAllDates(true)}
            className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
              showAllDates ? "bg-brand-sky text-bg-900" : "text-fg-400 hover:text-fg-100"
            }`}
          >
            🗂 Semua Tanggal ({totalAllDates})
          </button>
        </div>

        <div className="relative min-w-[220px] flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-500">
            🔍
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari judul, caption, uploader..."
            className="w-full rounded-lg border border-bg-700 bg-bg-800 py-2 pl-9 pr-3 text-sm text-fg-100 outline-none focus:border-brand-sky"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-500 hover:text-fg-100"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Provider tabs — pisahkan postingan Tlegu & Rully */}
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <button
          onClick={() => setProviderFilter("all")}
          className={`rounded-xl border p-3 text-left transition ${
            providerFilter === "all"
              ? "border-brand-sky bg-brand-sky/10"
              : "border-bg-700 bg-bg-800 hover:border-bg-600"
          }`}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-500">
            Semua Asset
          </div>
          <div className="mt-1 text-2xl font-extrabold text-fg-100">
            {fotoCount + videoCount}
          </div>
        </button>
        <button
          onClick={() => setProviderFilter("Tlegu")}
          className={`rounded-xl border p-3 text-left transition ${
            providerFilter === "Tlegu"
              ? "border-sky-400 bg-sky-500/10"
              : "border-bg-700 bg-bg-800 hover:border-bg-600"
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500 text-xs font-bold text-white">
              T
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-500">
                Tlegu
              </div>
              <div className="text-xl font-extrabold text-sky-400">{tleguCount}</div>
            </div>
          </div>
        </button>
        <button
          onClick={() => setProviderFilter("Rully")}
          className={`rounded-xl border p-3 text-left transition ${
            providerFilter === "Rully"
              ? "border-pink-400 bg-pink-500/10"
              : "border-bg-700 bg-bg-800 hover:border-bg-600"
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-pink-500 text-xs font-bold text-white">
              R
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-500">
                Rully
              </div>
              <div className="text-xl font-extrabold text-pink-400">{rullyCount}</div>
            </div>
          </div>
        </button>
        <button
          onClick={() => setProviderFilter("Lainnya")}
          className={`rounded-xl border p-3 text-left transition ${
            providerFilter === "Lainnya"
              ? "border-fg-400 bg-bg-700"
              : "border-bg-700 bg-bg-800 hover:border-bg-600"
          }`}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-500">
            Lainnya
          </div>
          <div className="mt-1 text-2xl font-extrabold text-fg-300">{lainnyaCount}</div>
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTypeFilter("all")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              typeFilter === "all"
                ? "bg-brand-sky text-bg-900"
                : "border border-bg-700 bg-bg-800 text-fg-300 hover:border-bg-600"
            }`}
          >
            Semua ({fotoCount + videoCount})
          </button>
          <button
            onClick={() => setTypeFilter("foto")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              typeFilter === "foto"
                ? "bg-sky-500 text-white"
                : "border border-bg-700 bg-bg-800 text-fg-300 hover:border-bg-600"
            }`}
          >
            📷 Foto ({fotoCount})
          </button>
          <button
            onClick={() => setTypeFilter("video")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              typeFilter === "video"
                ? "bg-violet-500 text-white"
                : "border border-bg-700 bg-bg-800 text-fg-300 hover:border-bg-600"
            }`}
          >
            🎬 Video ({videoCount})
          </button>
        </div>
        <div className="flex items-center gap-2">
          {/* Cache status indicator + manual refresh */}
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-bg-700 bg-bg-800 px-3 py-1.5 text-xs text-fg-400 hover:border-bg-600 hover:text-fg-100 disabled:opacity-50"
            title={
              isStale
                ? "Data mungkin sudah lama. Klik untuk refresh."
                : "Data masih fresh. Klik untuk refresh manual."
            }
          >
            <span className={loading ? "animate-spin" : ""}>🔄</span>
            {loading ? "Refreshing..." : isStale ? "Refresh" : "Fresh"}
            {isStale && !loading && (
              <span className="h-1.5 w-1.5 rounded-full bg-brand-amber" />
            )}
          </button>
          {canUpload ? (
            <button
              onClick={openAdd}
              className="rounded-lg bg-brand-sky px-4 py-2 text-sm font-bold text-bg-900"
            >
              + Tambah Asset
            </button>
          ) : (
            <span
              title="Hanya Tlegu & Rully yang bisa menambahkan asset"
              className="rounded-lg border border-bg-700 bg-bg-800 px-4 py-2 text-xs text-fg-500"
            >
              🔒 Upload dibatasi (Tlegu & Rully)
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.length === 0 && (
          <div className="rounded-xl border border-bg-700 bg-bg-800 p-8 text-center text-fg-500 md:col-span-2 xl:col-span-3">
            <div className="mb-2 text-4xl opacity-50">📦</div>
            <div className="text-sm font-semibold">
              {showAllDates
                ? search || providerFilter !== "all" || typeFilter !== "all"
                  ? "Tidak ada hasil pencarian"
                  : "Belum ada asset sama sekali"
                : `Belum ada asset ${providerFilter !== "all" ? `dari ${providerFilter} ` : ""}untuk tanggal ${fmtIdDate(date)}`}
            </div>
            {!showAllDates && (
              <button
                onClick={() => setShowAllDates(true)}
                className="mt-3 text-xs text-brand-sky hover:underline"
              >
                🗂 Lihat semua tanggal ({totalAllDates} total)
              </button>
            )}
          </div>
        )}
        {filtered.map((r, i) => (
          <div key={r.id} className="overflow-hidden rounded-xl border border-bg-700 bg-bg-800">
            {r.type === "video" ? (
              <a
                href={r.link || "#"}
                target="_blank"
                rel="noreferrer"
                className="relative flex h-40 items-center justify-center bg-gradient-to-br from-indigo-950 to-violet-950"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-3xl backdrop-blur-sm">
                  ▶
                </div>
                <span className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white">
                  🎬 VIDEO
                </span>
              </a>
            ) : r.image ? (
              <img
                src={r.image}
                alt={r.title}
                className="h-40 w-full object-cover"
              />
            ) : null}
            <div className="p-4">
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                    r.type === "video"
                      ? "bg-indigo-950 text-brand-violet"
                      : "bg-sky-950 text-brand-sky"
                  }`}
                >
                  {r.type === "video" ? "🎬 VIDEO" : "📷 FOTO"}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] ${
                    showAllDates
                      ? "bg-bg-700 font-semibold text-fg-200"
                      : "text-fg-500"
                  }`}
                >
                  📅 {fmtIdDate(r.date)}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    r.provider === "Tlegu"
                      ? "bg-sky-500/20 text-sky-400"
                      : r.provider === "Rully"
                      ? "bg-pink-500/20 text-pink-400"
                      : "bg-bg-700 text-fg-400"
                  }`}
                >
                  {r.provider}
                </span>
              </div>
              <div className="mb-2 text-sm font-bold text-fg-100">{r.title}</div>
              <div className="mb-3 max-h-20 overflow-y-auto rounded bg-bg-900 p-2 text-xs text-fg-300 whitespace-pre-wrap">
                {r.caption}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => copy(r.caption, "Caption")}
                  className="rounded bg-emerald-950 px-2 py-1 text-[11px] font-semibold text-brand-emerald"
                >
                  📋 Copy Caption
                </button>
                {r.link && (
                  <>
                    <button
                      onClick={() => copy(r.link, "Link")}
                      className="rounded bg-sky-950 px-2 py-1 text-[11px] font-semibold text-brand-sky"
                    >
                      🔗 Copy Link
                    </button>
                    {r.type === "video" && (
                      <a
                        href={r.link}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded bg-indigo-950 px-2 py-1 text-[11px] font-semibold text-brand-violet"
                      >
                        ▶ Buka Video
                      </a>
                    )}
                  </>
                )}
                {canUpload && (
                  <>
                    <button
                      onClick={() => openEdit(r, i)}
                      className="rounded bg-bg-700 px-2 py-1 text-[11px] text-fg-300"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(r)}
                      className="rounded bg-red-950/50 px-2 py-1 text-[11px] text-brand-rose"
                    >
                      Hapus
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={modal.open}
        onClose={close}
        title={modal.idx < 0 ? "Tambah Asset Baru" : "Edit Asset"}
      >
        <FormRow>
          <Field label="Tipe Asset">
            <select
              className={inputCls}
              value={modal.data.type}
              onChange={(e) =>
                setModal((m) => ({
                  ...m,
                  data: { ...m.data, type: e.target.value as "foto" | "video" },
                }))
              }
            >
              <option value="foto">📷 Foto</option>
              <option value="video">🎬 Video</option>
            </select>
          </Field>
          <Field label="Tanggal Asset">
            <input
              type="date"
              className={inputCls}
              value={modal.data.date}
              onChange={(e) =>
                setModal((m) => ({ ...m, data: { ...m.data, date: e.target.value } }))
              }
            />
          </Field>
        </FormRow>
        <div className="mb-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-300">
            Title / Judul Postingan
          </label>
          <input
            className={inputCls}
            value={modal.data.title}
            placeholder="Contoh: Promo Mei Slide 1, Reels Tutorial #3"
            onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, title: e.target.value } }))}
          />
        </div>
        <div className="mb-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-300">
            Caption / Teks Postingan
          </label>
          <textarea
            className={inputCls + " min-h-[120px]"}
            value={modal.data.caption}
            onChange={(e) =>
              setModal((m) => ({ ...m, data: { ...m.data, caption: e.target.value } }))
            }
          />
        </div>
        {modal.data.type === "video" ? (
          <div className="mb-4">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-300">
              Link Video
            </label>
            <input
              type="url"
              className={inputCls}
              value={modal.data.link}
              placeholder="https://drive.google.com/..."
              onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, link: e.target.value } }))}
            />
          </div>
        ) : (
          <div className="mb-4">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-300">
              Upload Gambar (maks 2 MB)
            </label>
            {modal.data.image && (
              <img src={modal.data.image} alt="preview" className="mb-2 max-h-40 rounded-lg" />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleImage}
              className="block w-full text-xs text-fg-300 file:mr-3 file:rounded file:border-0 file:bg-brand-sky file:px-3 file:py-2 file:text-xs file:font-bold file:text-bg-900"
            />
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-bg-700 pt-4">
          <button onClick={close} className="rounded-lg border border-bg-700 px-4 py-2 text-sm text-fg-300">
            Batal
          </button>
          <button onClick={save} className="rounded-lg bg-brand-sky px-6 py-2 text-sm font-bold text-bg-900">
            Simpan Asset
          </button>
        </div>
      </Modal>
    </PageShell>
  );
}
