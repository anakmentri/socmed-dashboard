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

  // Cek availability Storage bucket sekali saat mount (untuk banner warning)
  const [bucketReady, setBucketReady] = useState<boolean | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const { error } = await supabase.storage.from("assets").list("", { limit: 1 });
        setBucketReady(!error);
        if (error) {
          console.warn("[storage] bucket check failed:", error.message);
        }
      } catch {
        setBucketReady(false);
      }
    })();
  }, []);

  // Bulk upload state — pattern row-based seperti Tambah Akun Sosmed Multi
  type BulkItem = {
    id: string;
    type: "foto" | "video";
    title: string;
    caption: string;
    base64: string; // foto saja (data URL setelah pilih file)
    fileName: string;
    fileSize: number;
    link: string; // video saja (URL Drive/YouTube)
    status: "pending" | "uploading" | "done" | "error";
    error?: string;
  };
  const newEmptyBulkItem = (): BulkItem => ({
    id: Math.random().toString(36).slice(2, 10),
    type: "foto",
    title: "",
    caption: "",
    base64: "",
    fileName: "",
    fileSize: 0,
    link: "",
    status: "pending",
  });
  const [bulk, setBulk] = useState<{
    open: boolean;
    items: BulkItem[];
    sharedCaption: string;
    date: string;
    provider: string;
    processing: boolean;
    progress: { done: number; total: number };
  }>({
    open: false,
    items: [newEmptyBulkItem()],
    sharedCaption: "",
    date: today(),
    provider: "",
    processing: false,
    progress: { done: 0, total: 0 },
  });
  const isMember = session?.role === "member";
  const isAdmin = session?.role === "admin";
  const myName = session?.memberName || (isAdmin ? "admin" : "");
  const ALLOWED_UPLOADERS = ["Tlegu", "Rully"];
  const canUpload =
    session?.role === "admin" || ALLOWED_UPLOADERS.includes(session?.memberName || "");

  const PAGE_SIZE = 30;

  // Fetch by chunk — hindari timeout di Supabase
  const fetchAssetsPage = async (from: number, to: number): Promise<Row[]> => {
    const { data, error } = await supabase
      .from("assets")
      .select("id,name,type,url,uploaded_by")
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) {
      console.error("[assets] fetch error page", from, to, error);
      throw error;
    }
    return (data || []).map((a) => {
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
  };

  // Get total count (cheap query — count only)
  const fetchTotalCount = async (): Promise<number> => {
    const { count, error } = await supabase
      .from("assets")
      .select("id", { count: "exact", head: true });
    if (error) {
      console.error("[assets] count error:", error);
      return 0;
    }
    return count || 0;
  };

  const [rows, setRows] = useState<Row[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isStale, setIsStale] = useState(false);

  // Initial load — page pertama saja
  const reload = async () => {
    setLoading(true);
    try {
      const [count, firstPage] = await Promise.all([
        fetchTotalCount(),
        fetchAssetsPage(0, PAGE_SIZE - 1),
      ]);
      setTotalCount(count);
      setRows(firstPage);
      setIsStale(false);
      console.log(`[assets] loaded ${firstPage.length}/${count} (page 1)`);
    } catch (e) {
      console.error("[assets] reload failed:", e);
    } finally {
      setLoading(false);
    }
  };

  // Load more — fetch page berikutnya
  const loadMore = async () => {
    if (rows.length >= totalCount) return;
    setLoadingMore(true);
    try {
      const next = await fetchAssetsPage(rows.length, rows.length + PAGE_SIZE - 1);
      setRows((prev) => [...prev, ...next]);
      console.log(`[assets] loaded +${next.length} (total ${rows.length + next.length}/${totalCount})`);
    } catch (e) {
      console.error("[assets] loadMore failed:", e);
    } finally {
      setLoadingMore(false);
    }
  };

  // Auto-load all kalau user buka "Semua Tanggal" mode atau pakai search
  // (biar search & filter tetap akurat)
  useEffect(() => {
    if (rows.length > 0 && rows.length < totalCount && !loadingMore) {
      // Auto chained loading — interval kecil supaya UI responsive
      const t = setTimeout(() => loadMore(), 200);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, totalCount, loadingMore]);

  useEffect(() => {
    reload();
    const onFocus = () => reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setInterval(() => setIsStale(true), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const refresh = reload;
  // Backward-compat: fetchAssets dipakai oleh fungsi lain
  const fetchAssets = () => fetchAssetsPage(0, PAGE_SIZE - 1);
  void fetchAssets;

  // Force fresh dari server
  const load = async () => {
    invalidateCache(ASSETS_CACHE_KEY);
    await reload();
  };

  // Optimistic update — pakai setelah add/edit/delete supaya UI tidak flicker
  const optimisticAdd = (newRow: Row) => setRows((prev) => [newRow, ...prev]);
  const optimisticUpdate = (id: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const optimisticRemove = (id: number) =>
    setRows((prev) => prev.filter((r) => r.id !== id));

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
  const close = () => {
    setModal((m) => ({ ...m, open: false }));
    setUploadInfo(null);
  };

  // ===== BULK UPLOAD (row-based) =====
  const openBulk = () => {
    if (!canUpload) return toast("Hanya Tlegu & Rully yang bisa upload", true);
    setBulk((b) => ({
      ...b,
      open: true,
      items: [newEmptyBulkItem()],
      sharedCaption: "",
      date,
      provider: myName,
      processing: false,
      progress: { done: 0, total: 0 },
    }));
  };
  const closeBulk = () => setBulk((b) => ({ ...b, open: false }));

  const addBulkRow = () =>
    setBulk((b) => ({ ...b, items: [...b.items, newEmptyBulkItem()] }));

  const removeBulkItem = (id: string) =>
    setBulk((b) => ({
      ...b,
      items:
        b.items.length === 1
          ? [newEmptyBulkItem()]
          : b.items.filter((it) => it.id !== id),
    }));

  const updateBulkItem = (id: string, patch: Partial<BulkItem>) =>
    setBulk((b) => ({
      ...b,
      items: b.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }));

  // Pilih file untuk 1 row tertentu
  const onBulkRowFile = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const MAX = 5 * 1024 * 1024;
    if (file.size > MAX) {
      return toast(`${file.name} (${formatFileSize(file.size)}) > 5MB`, true);
    }
    const reader = new FileReader();
    reader.onload = () => {
      const titleNoExt = file.name.replace(/\.[^/.]+$/, "");
      // Auto-fill title dari nama file kalau title masih kosong
      setBulk((b) => ({
        ...b,
        items: b.items.map((it) =>
          it.id === id
            ? {
                ...it,
                base64: String(reader.result || ""),
                fileName: file.name,
                fileSize: file.size,
                title: it.title.trim() || titleNoExt,
              }
            : it
        ),
      }));
    };
    reader.readAsDataURL(file);
  };

  const runBulkUpload = async () => {
    if (!canUpload) return toast("Tidak diizinkan", true);
    if (!bulk.provider) return toast("Pemegang wajib", true);
    // Valid kalau punya title + (foto dengan base64) ATAU (video dengan link)
    const valid = bulk.items.filter(
      (it) =>
        it.title.trim() &&
        ((it.type === "foto" && it.base64) ||
          (it.type === "video" && it.link.trim()))
    );
    if (valid.length === 0) {
      return toast(
        "Tidak ada baris valid. Pastikan title + (image utk foto / link utk video)",
        true
      );
    }

    setBulk((b) => ({
      ...b,
      processing: true,
      progress: { done: 0, total: valid.length },
    }));

    let done = 0;
    let errors = 0;
    const newRows: Row[] = [];

    for (const item of valid) {
      try {
        updateBulkItem(item.id, { status: "uploading" });

        let publicUrl = "";
        if (item.type === "foto") {
          publicUrl = await uploadBase64ToStorage(item.base64, "foto");
        }
        // Untuk video, pakai link (URL Drive/YouTube), tidak upload file

        const finalCaption =
          item.caption.trim() || bulk.sharedCaption.trim() || item.title;

        const payload = {
          name: item.title.trim(),
          type: item.type,
          url: packAssetUrl({
            caption: finalCaption,
            link: item.link.trim(),
            image: publicUrl,
            date: bulk.date,
            notes: "",
            status: "available",
          }),
          uploaded_by: bulk.provider,
        };

        const { data: inserted, error } = await supabase
          .from("assets")
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        if (inserted) {
          newRows.push({
            id: inserted.id,
            title: item.title.trim(),
            type: item.type,
            caption: finalCaption,
            link: item.link.trim(),
            image: publicUrl,
            date: bulk.date,
            provider: bulk.provider,
            notes: "",
            status: "available",
          });
        }

        updateBulkItem(item.id, { status: "done" });
        done++;
      } catch (e) {
        errors++;
        updateBulkItem(item.id, {
          status: "error",
          error: e instanceof Error ? e.message : "error",
        });
      }
      setBulk((b) => ({ ...b, progress: { done: done + errors, total: valid.length } }));
    }

    // Optimistic add semua row baru
    if (newRows.length > 0) {
      setRows((prev) => [...newRows, ...prev]);
      setTotalCount((c) => c + newRows.length);
    }

    logAs(
      session,
      "Bulk Upload Asset",
      "Asset",
      `${done} sukses, ${errors} gagal untuk ${bulk.provider}`
    );
    toast(
      errors === 0
        ? `✅ ${done} asset berhasil diupload!`
        : `${done} sukses, ${errors} gagal`
    );
    setBulk((b) => ({ ...b, processing: false }));

    // Auto-close kalau semua sukses
    if (errors === 0) {
      setTimeout(() => closeBulk(), 1500);
    }
  };

  // Format byte size to human readable (KB / MB)
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  // Estimate base64 size (base64 encoded ~1.33x original)
  const estimateBase64Size = (b64: string): number => {
    if (!b64 || !b64.includes("base64,")) return 0;
    const data = b64.split("base64,")[1] || "";
    // Length of base64 minus padding
    const padding = (data.match(/=+$/)?.[0] || "").length;
    return Math.floor((data.length * 3) / 4) - padding;
  };

  const [uploadInfo, setUploadInfo] = useState<{
    name: string;
    size: number;
    type: string;
  } | null>(null);

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return toast(
        `File ${formatFileSize(file.size)} terlalu besar. Maks 5 MB`,
        true
      );
    }
    setUploadInfo({ name: file.name, size: file.size, type: file.type });
    const reader = new FileReader();
    reader.onload = () =>
      setModal((m) => ({ ...m, data: { ...m.data, image: String(reader.result || "") } }));
    reader.readAsDataURL(file);
    toast(`📁 ${file.name} (${formatFileSize(file.size)}) siap diupload`);
  };

  /**
   * Upload image base64 ke Supabase Storage.
   * Kalau bucket belum dibuat (Bucket not found), FALLBACK ke base64 (legacy mode)
   * — upload tetap jalan, cuma pakai cara lama yang berat.
   */
  const uploadBase64ToStorage = async (
    base64: string,
    type: "foto" | "video"
  ): Promise<string> => {
    const m = base64.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) throw new Error("Invalid base64 format");
    const [, mime, b64] = m;
    const ext = mime.split("/")[1]?.split(";")[0] || (type === "video" ? "mp4" : "jpg");
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const blob = new Blob([arr], { type: mime });
    const fileName = `${type}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const { error } = await supabase.storage.from("assets").upload(fileName, blob, {
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) {
      // FALLBACK: kalau bucket belum dibuat → simpan sebagai base64 (legacy)
      if (
        error.message.toLowerCase().includes("bucket not found") ||
        error.message.toLowerCase().includes("not_found")
      ) {
        console.warn("[storage] Bucket 'assets' belum ada, fallback ke base64 (legacy)");
        return base64; // langsung return base64, akan disimpan di url field
      }
      throw new Error(`Storage upload: ${error.message}`);
    }
    const { data: urlData } = supabase.storage.from("assets").getPublicUrl(fileName);
    return urlData.publicUrl;
  };

  // Migration tool — pindahkan base64 lama ke Storage
  const [migrating, setMigrating] = useState(false);
  const [migrateProgress, setMigrateProgress] = useState({ done: 0, total: 0, errors: 0 });

  const migrateBase64ToStorage = async () => {
    if (!isAdmin) return toast("Cuma admin yang bisa migrate", true);
    if (!confirm("Migrate semua image base64 ke Supabase Storage? Proses bisa lama (5-15 menit).")) return;

    setMigrating(true);
    try {
      // Fetch SEMUA assets (untuk migrate) — pakai range chunked
      const { count } = await supabase.from("assets").select("id", { count: "exact", head: true });
      const total = count || 0;
      setMigrateProgress({ done: 0, total, errors: 0 });

      let offset = 0;
      let processed = 0;
      let errors = 0;
      const PAGE = 10;

      while (offset < total) {
        const { data, error } = await supabase
          .from("assets")
          .select("id,name,type,url")
          .order("id", { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (error) {
          console.error("Migration fetch error:", error);
          errors += PAGE;
          offset += PAGE;
          continue;
        }
        for (const a of data || []) {
          try {
            const u = unpackAssetUrl(a.url);
            // Skip kalau image bukan base64 (sudah URL atau kosong)
            if (!u.image || !u.image.startsWith("data:")) {
              processed++;
              continue;
            }
            const publicUrl = await uploadBase64ToStorage(
              u.image,
              (a.type as "foto" | "video") || "foto"
            );
            // Update url field — replace base64 image dengan public URL
            const newPacked = packAssetUrl({
              caption: u.caption,
              link: u.link,
              image: publicUrl,
              date: u.date,
              notes: u.notes,
              status: u.status,
            });
            await supabase.from("assets").update({ url: newPacked }).eq("id", a.id);
            processed++;
          } catch (e) {
            console.error("Migrate row error", a.id, e);
            errors++;
            processed++;
          }
          setMigrateProgress({ done: processed, total, errors });
        }
        offset += PAGE;
      }
      toast(`Migrasi selesai: ${processed - errors}/${total} sukses, ${errors} gagal`);
      reload();
    } catch (e) {
      toast(`Migration error: ${e instanceof Error ? e.message : "unknown"}`, true);
    } finally {
      setMigrating(false);
    }
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

    // Upload image base64 → Supabase Storage (kalau masih base64)
    let imageUrl = d.image;
    if (d.image && d.image.startsWith("data:")) {
      try {
        toast("Uploading image ke storage...");
        imageUrl = await uploadBase64ToStorage(d.image, d.type);
      } catch (e) {
        return toast(`Gagal upload image: ${e instanceof Error ? e.message : "error"}`, true);
      }
    }

    const payload = {
      name: d.title,
      type: d.type,
      url: packAssetUrl({ ...d, image: imageUrl }),
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
          image: imageUrl,
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
      {/* Warning banner: bucket Storage belum dibuat */}
      {bucketReady === false && isAdmin && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-fg-200">
          ⚠ <strong className="text-brand-amber">Bucket Storage belum dibuat</strong> —
          upload tetap jalan pakai mode lama (base64), tapi lambat & berat. Buat bucket sekarang
          untuk performa optimal:
          <ol className="mt-2 ml-5 list-decimal text-[11px] text-fg-400">
            <li>
              Klik:{" "}
              <a
                href="https://supabase.com/dashboard/project/fireqxxqxxkxbcemcpmj/storage/buckets"
                target="_blank"
                rel="noreferrer"
                className="text-brand-sky hover:underline"
              >
                Buka Supabase Storage Buckets
              </a>
            </li>
            <li>
              Klik <strong>New Bucket</strong> → Name: <code>assets</code> → ✅ centang{" "}
              <strong>Public bucket</strong> → Create
            </li>
            <li>
              Refresh halaman ini — banner akan hilang otomatis
            </li>
          </ol>
        </div>
      )}

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
        {loading && rows.length === 0 ? (
          <>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={`stat-skel-${i}`}
                className="rounded-xl border border-bg-700 bg-bg-800 p-3"
              >
                <div className="mb-2 h-3 w-20 animate-pulse rounded bg-bg-700" />
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 animate-pulse rounded-lg bg-bg-700" />
                  <div className="h-6 w-10 animate-pulse rounded bg-bg-700" />
                </div>
              </div>
            ))}
          </>
        ) : (
        <>
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
        </>
        )}
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
          {isAdmin && (
            <button
              onClick={migrateBase64ToStorage}
              disabled={migrating}
              className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-xs font-semibold text-brand-orange hover:bg-orange-500/20 disabled:opacity-50"
              title="Pindahkan semua image base64 lama ke Supabase Storage (lebih cepat & ringan)"
            >
              {migrating
                ? `📦 Migrating ${migrateProgress.done}/${migrateProgress.total}${
                    migrateProgress.errors > 0 ? ` (${migrateProgress.errors} err)` : ""
                  }`
                : "📦 Migrate ke Storage"}
            </button>
          )}
          {canUpload && (
            <button
              onClick={openBulk}
              className="rounded-lg bg-gradient-to-r from-emerald-500 to-sky-500 px-4 py-2 text-sm font-bold text-white hover:opacity-90"
              title="Tambah banyak asset sekaligus"
            >
              + Tambah Asset (Multi)
            </button>
          )}
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
        {/* Skeleton loading — tampil saat initial fetch belum selesai */}
        {loading && rows.length === 0 &&
          Array.from({ length: 6 }).map((_, i) => (
            <div
              key={`skeleton-${i}`}
              className="overflow-hidden rounded-xl border border-bg-700 bg-bg-800"
            >
              <div className="h-40 w-full animate-pulse bg-bg-700/60" />
              <div className="p-4">
                <div className="mb-2 flex items-center gap-2">
                  <div className="h-4 w-14 animate-pulse rounded bg-bg-700" />
                  <div className="h-3 w-24 animate-pulse rounded bg-bg-700" />
                  <div className="h-3 w-12 animate-pulse rounded bg-bg-700" />
                </div>
                <div className="mb-2 h-4 w-3/4 animate-pulse rounded bg-bg-700" />
                <div className="mb-3 h-16 w-full animate-pulse rounded bg-bg-700/60" />
                <div className="flex gap-1.5">
                  <div className="h-6 w-24 animate-pulse rounded bg-bg-700" />
                  <div className="h-6 w-16 animate-pulse rounded bg-bg-700" />
                  <div className="h-6 w-12 animate-pulse rounded bg-bg-700" />
                  <div className="h-6 w-14 animate-pulse rounded bg-bg-700" />
                </div>
              </div>
            </div>
          ))}

        {/* Empty state — setelah loading selesai tapi data kosong */}
        {!loading && filtered.length === 0 && (
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

        {/* Skeleton tambahan saat loading chunk berikutnya */}
        {loadingMore &&
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={`skeleton-more-${i}`}
              className="overflow-hidden rounded-xl border border-bg-700 bg-bg-800"
            >
              <div className="h-40 w-full animate-pulse bg-bg-700/60" />
              <div className="p-4">
                <div className="mb-2 h-4 w-3/4 animate-pulse rounded bg-bg-700" />
                <div className="h-16 w-full animate-pulse rounded bg-bg-700/60" />
              </div>
            </div>
          ))}
      </div>

      {/* Progress indicator untuk background pagination */}
      {rows.length > 0 && rows.length < totalCount && (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-bg-700 bg-bg-800 p-3 text-xs text-fg-400">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-brand-sky border-t-transparent" />
          <span>
            Memuat asset: <strong className="text-fg-100">{rows.length}</strong> dari{" "}
            <strong className="text-fg-100">{totalCount}</strong>
          </span>
          <div className="ml-3 h-1.5 w-40 overflow-hidden rounded-full bg-bg-700">
            <div
              className="h-full rounded-full bg-brand-sky transition-all"
              style={{ width: `${(rows.length / totalCount) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* === BULK UPLOAD MODAL (row-based seperti Akun Sosmed Multi) === */}
      <Modal
        open={bulk.open}
        onClose={closeBulk}
        title="Tambah Asset (Multi)"
        width={780}
      >

        {/* Shared settings di atas */}
        <div className="mb-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-300">
            Pemegang (Uploader)
          </label>
          <input
            type="text"
            className={inputCls}
            value={bulk.provider}
            disabled={isMember}
            placeholder="Nama anggota"
            onChange={(e) => setBulk((b) => ({ ...b, provider: e.target.value }))}
          />
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-300">
              Tanggal Asset
            </label>
            <input
              type="date"
              className={inputCls}
              value={bulk.date}
              onChange={(e) => setBulk((b) => ({ ...b, date: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-300">
              Caption Bersama (opsional)
            </label>
            <input
              type="text"
              className={inputCls}
              placeholder="Pakai jika caption per-baris kosong"
              value={bulk.sharedCaption}
              onChange={(e) =>
                setBulk((b) => ({ ...b, sharedCaption: e.target.value }))
              }
            />
          </div>
        </div>

        {/* Header daftar + tombol Tambah Baris */}
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-fg-300">
            Daftar Asset ({bulk.items.length})
          </span>
          <button
            onClick={addBulkRow}
            disabled={bulk.processing}
            className="rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-3 py-1 text-xs font-semibold text-brand-emerald hover:bg-emerald-500/30 disabled:opacity-50"
          >
            + Tambah Baris
          </button>
        </div>

        {/* Rows */}
        <div className="mb-4 max-h-[55vh] space-y-3 overflow-y-auto pr-1 scrollbar-thin">
          {bulk.items.map((it, idx) => (
            <div
              key={it.id}
              className={`rounded-lg border p-3 ${
                it.status === "done"
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : it.status === "error"
                  ? "border-red-500/40 bg-red-500/5"
                  : it.status === "uploading"
                  ? "border-brand-sky bg-sky-500/5"
                  : "border-bg-700 bg-bg-900"
              }`}
            >
              {/* Header row: nomor + status + delete */}
              <div className="mb-2 flex items-center justify-between">
                <span className="rounded bg-bg-700 px-2 py-0.5 text-[10px] font-bold text-fg-300">
                  #{idx + 1}
                </span>
                <div className="flex items-center gap-2">
                  {it.status === "done" && (
                    <span className="text-[10px] font-bold text-brand-emerald">
                      ✅ Sukses
                    </span>
                  )}
                  {it.status === "error" && (
                    <span
                      className="text-[10px] font-bold text-brand-rose"
                      title={it.error}
                    >
                      ❌ {it.error?.slice(0, 30)}
                    </span>
                  )}
                  {it.status === "uploading" && (
                    <span className="text-[10px] font-bold text-brand-sky">
                      ⏳ Uploading...
                    </span>
                  )}
                  <button
                    onClick={() => removeBulkItem(it.id)}
                    disabled={bulk.processing}
                    className="rounded bg-red-950/50 px-2 py-1 text-[10px] text-brand-rose hover:bg-red-950 disabled:opacity-30"
                    title="Hapus baris"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Tipe + Title */}
              <div className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                <select
                  className={inputCls + " text-xs"}
                  value={it.type}
                  onChange={(e) =>
                    updateBulkItem(it.id, {
                      type: e.target.value as "foto" | "video",
                    })
                  }
                >
                  <option value="foto">📷 Foto</option>
                  <option value="video">🎬 Video</option>
                </select>
                <input
                  className={inputCls + " text-xs md:col-span-2"}
                  placeholder="Title (judul postingan)"
                  value={it.title}
                  onChange={(e) =>
                    updateBulkItem(it.id, { title: e.target.value })
                  }
                />
              </div>

              {/* Caption */}
              <input
                className={inputCls + " mb-2 text-xs"}
                placeholder="Caption (opsional, pakai shared kalau kosong)"
                value={it.caption}
                onChange={(e) =>
                  updateBulkItem(it.id, { caption: e.target.value })
                }
              />

              {/* Foto upload OR Video link */}
              {it.type === "foto" ? (
                <div className="rounded border border-bg-700 bg-bg-800 p-2">
                  {it.base64 ? (
                    <div className="flex items-center gap-2">
                      <img
                        src={it.base64}
                        alt={it.title || "preview"}
                        className="h-16 w-16 rounded object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[10px] text-fg-300" title={it.fileName}>
                          📁 {it.fileName}
                        </div>
                        <div className="mt-0.5 text-[10px] text-fg-500">
                          {formatFileSize(it.fileSize)}
                        </div>
                      </div>
                      <label className="cursor-pointer rounded border border-bg-700 px-2 py-1 text-[10px] text-fg-400 hover:border-brand-sky hover:text-fg-100">
                        Ganti
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => onBulkRowFile(it.id, e)}
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="block cursor-pointer rounded border border-dashed border-bg-700 p-3 text-center text-xs text-fg-400 hover:border-brand-sky hover:text-fg-200">
                      📷 Klik untuk pilih image
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => onBulkRowFile(it.id, e)}
                      />
                    </label>
                  )}
                </div>
              ) : (
                <input
                  type="url"
                  className={inputCls + " text-xs"}
                  placeholder="🔗 Link Video (Google Drive / YouTube / dll)"
                  value={it.link}
                  onChange={(e) =>
                    updateBulkItem(it.id, { link: e.target.value })
                  }
                />
              )}
            </div>
          ))}
        </div>

        {/* Progress bar saat uploading */}
        {bulk.processing && (
          <div className="mb-4">
            <div className="mb-1 flex justify-between text-[10px]">
              <span className="text-fg-400">Uploading...</span>
              <span className="font-bold text-brand-sky">
                {bulk.progress.done} / {bulk.progress.total}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-bg-700">
              <div
                className="h-full rounded-full bg-brand-sky transition-all"
                style={{
                  width: `${
                    (bulk.progress.done / Math.max(1, bulk.progress.total)) * 100
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-bg-700 pt-4">
          <button
            onClick={closeBulk}
            disabled={bulk.processing}
            className="rounded-lg border border-bg-700 px-4 py-2 text-sm text-fg-300 disabled:opacity-50"
          >
            Tutup
          </button>
          <button
            onClick={runBulkUpload}
            disabled={bulk.processing || bulk.items.length === 0}
            className="rounded-lg bg-gradient-to-r from-emerald-500 to-sky-500 px-6 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40"
          >
            {bulk.processing
              ? `Uploading ${bulk.progress.done}/${bulk.progress.total}...`
              : `Simpan Semua (${bulk.items.length})`}
          </button>
        </div>
      </Modal>

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
            <label className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-fg-300">
              <span>Upload Gambar</span>
              <span className="text-[10px] font-normal normal-case text-fg-500">
                Maks 5 MB · JPG/PNG/WEBP
              </span>
            </label>

            {modal.data.image && (
              <div className="mb-2">
                <img
                  src={modal.data.image}
                  alt="preview"
                  className="max-h-40 rounded-lg border border-bg-700"
                />
                {/* File info */}
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-bg-700 bg-bg-900 px-3 py-2 text-xs">
                  <span className="text-brand-emerald">📁</span>
                  {uploadInfo ? (
                    <>
                      <span className="truncate text-fg-200" title={uploadInfo.name}>
                        {uploadInfo.name}
                      </span>
                      <span className="rounded bg-bg-700 px-2 py-0.5 text-[10px] font-bold text-fg-300">
                        {formatFileSize(uploadInfo.size)}
                      </span>
                      <span className="rounded bg-bg-700 px-2 py-0.5 text-[10px] text-fg-500">
                        {uploadInfo.type.split("/")[1]?.toUpperCase()}
                      </span>
                    </>
                  ) : (
                    <span className="text-fg-400">
                      Image lama (
                      {modal.data.image.startsWith("data:")
                        ? formatFileSize(estimateBase64Size(modal.data.image))
                        : "URL Storage"}
                      )
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setUploadInfo(null);
                      setModal((m) => ({ ...m, data: { ...m.data, image: "" } }));
                    }}
                    className="ml-auto text-[10px] text-brand-rose hover:underline"
                  >
                    ✕ Hapus
                  </button>
                </div>

                {/* Indikator size status */}
                {uploadInfo && (
                  <div className="mt-2">
                    <div className="mb-1 flex items-center justify-between text-[10px]">
                      <span className="text-fg-500">Size relatif limit (5 MB)</span>
                      <span
                        className={`font-bold ${
                          uploadInfo.size > 4 * 1024 * 1024
                            ? "text-brand-rose"
                            : uploadInfo.size > 2 * 1024 * 1024
                            ? "text-brand-amber"
                            : "text-brand-emerald"
                        }`}
                      >
                        {Math.round((uploadInfo.size / (5 * 1024 * 1024)) * 100)}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-bg-700">
                      <div
                        className={`h-full rounded-full transition-all ${
                          uploadInfo.size > 4 * 1024 * 1024
                            ? "bg-brand-rose"
                            : uploadInfo.size > 2 * 1024 * 1024
                            ? "bg-brand-amber"
                            : "bg-brand-emerald"
                        }`}
                        style={{
                          width: `${Math.min(
                            100,
                            (uploadInfo.size / (5 * 1024 * 1024)) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
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
