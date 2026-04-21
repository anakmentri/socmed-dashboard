'use client';

import { useMemo, useState } from 'react';

type Item = {
  id: number;
  nama: string;
  satuan: string;
  modal: number;
  jual: number;
  stok: number;
  terjual: number;
};

const SEED: Item[] = [
  { id: 1, nama: 'Kopi Sachet', satuan: 'bks', modal: 1200, jual: 2000, stok: 150, terjual: 42 },
  { id: 2, nama: 'Gorengan Tempe', satuan: 'pcs', modal: 700, jual: 1500, stok: 60, terjual: 38 },
  { id: 3, nama: 'Nasi Bungkus', satuan: 'pcs', modal: 8000, jual: 12000, stok: 25, terjual: 14 },
  { id: 4, nama: 'Teh Botol', satuan: 'btl', modal: 3800, jual: 5000, stok: 48, terjual: 21 },
  { id: 5, nama: 'Rokok Ketengan', satuan: 'btg', modal: 1800, jual: 2500, stok: 200, terjual: 95 },
  { id: 6, nama: 'Mie Rebus', satuan: 'porsi', modal: 4500, jual: 8000, stok: 30, terjual: 12 },
  { id: 7, nama: 'Es Teh', satuan: 'gls', modal: 1500, jual: 4000, stok: 80, terjual: 55 },
  { id: 8, nama: 'Kerupuk', satuan: 'bks', modal: 600, jual: 1000, stok: 120, terjual: 34 },
];

const rupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);

type Draft = {
  id: number | null;
  nama: string;
  satuan: string;
  modal: string;
  jual: string;
  stok: string;
};

const EMPTY: Draft = { id: null, nama: '', satuan: 'pcs', modal: '', jual: '', stok: '' };

export default function WarungPage() {
  const [items, setItems] = useState<Item[]>(SEED);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'semua' | 'laris' | 'rugi-tipis' | 'stok-menipis'>('semua');
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [sellQty, setSellQty] = useState<Record<number, string>>({});
  const [toast, setToast] = useState('');

  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => !q || i.nama.toLowerCase().includes(q))
      .filter((i) => {
        if (filter === 'semua') return true;
        if (filter === 'laris') return i.terjual >= 20;
        if (filter === 'stok-menipis') return i.stok > 0 && i.stok <= 20;
        if (filter === 'rugi-tipis') return i.jual - i.modal <= 1000;
        return true;
      });
  }, [items, query, filter]);

  const ringkasan = useMemo(() => {
    const modalTerpakai = items.reduce((a, b) => a + b.modal * b.terjual, 0);
    const penjualan = items.reduce((a, b) => a + b.jual * b.terjual, 0);
    const modalStok = items.reduce((a, b) => a + b.modal * b.stok, 0);
    const unitTerjual = items.reduce((a, b) => a + b.terjual, 0);
    const untung = penjualan - modalTerpakai;
    const margin = penjualan > 0 ? (untung / penjualan) * 100 : 0;
    return { modalTerpakai, penjualan, modalStok, unitTerjual, untung, margin };
  }, [items]);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 2200);
  };

  const jual = (it: Item) => {
    const raw = sellQty[it.id] ?? '1';
    const qty = Number(raw);
    if (!Number.isFinite(qty) || qty <= 0) return alert('Jumlah tidak valid.');
    if (qty > it.stok) return alert('Stok tidak cukup.');
    setItems((xs) =>
      xs.map((x) => (x.id === it.id ? { ...x, stok: x.stok - qty, terjual: x.terjual + qty } : x)),
    );
    setSellQty((s) => ({ ...s, [it.id]: '' }));
    flash(`Laku ${qty} ${it.satuan} ${it.nama} — untung ${rupiah((it.jual - it.modal) * qty)}`);
  };

  const startAdd = () => {
    setDraft(EMPTY);
    setShowForm(true);
  };

  const startEdit = (it: Item) => {
    setDraft({
      id: it.id,
      nama: it.nama,
      satuan: it.satuan,
      modal: String(it.modal),
      jual: String(it.jual),
      stok: String(it.stok),
    });
    setShowForm(true);
  };

  const hapus = (id: number) => {
    if (!confirm('Hapus barang ini?')) return;
    setItems((xs) => xs.filter((x) => x.id !== id));
  };

  const simpan = () => {
    const nama = draft.nama.trim();
    const satuan = draft.satuan.trim() || 'pcs';
    const modal = Number(draft.modal);
    const hjual = Number(draft.jual);
    const stok = Number(draft.stok);
    if (!nama) return alert('Nama barang wajib diisi.');
    if (!Number.isFinite(modal) || modal < 0) return alert('Harga modal tidak valid.');
    if (!Number.isFinite(hjual) || hjual < 0) return alert('Harga jual tidak valid.');
    if (!Number.isFinite(stok) || stok < 0) return alert('Stok tidak valid.');
    if (hjual < modal && !confirm('Harga jual di bawah modal. Tetap simpan?')) return;

    if (draft.id === null) {
      const nextId = Math.max(0, ...items.map((x) => x.id)) + 1;
      setItems((xs) => [...xs, { id: nextId, nama, satuan, modal, jual: hjual, stok, terjual: 0 }]);
      flash(`"${nama}" ditambahkan.`);
    } else {
      setItems((xs) =>
        xs.map((x) => (x.id === draft.id ? { ...x, nama, satuan, modal, jual: hjual, stok } : x)),
      );
      flash(`"${nama}" diperbarui.`);
    }
    setShowForm(false);
    setDraft(EMPTY);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 p-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 text-2xl shadow-lg shadow-amber-200">
              ☕
            </div>
            <div>
              <h1 className="text-2xl font-bold text-stone-900">Warung Bu Siti</h1>
              <p className="text-sm text-stone-500">Catatan harian modal, jualan, dan untung.</p>
            </div>
          </div>
          <button
            onClick={startAdd}
            className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-amber-50 shadow-md transition hover:bg-stone-800"
          >
            + Barang Baru
          </button>
        </header>

        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Nilai Stok (Modal)" value={rupiah(ringkasan.modalStok)} tone="neutral" />
          <StatCard label="Total Penjualan" value={rupiah(ringkasan.penjualan)} tone="accent" />
          <StatCard label="Modal Terpakai" value={rupiah(ringkasan.modalTerpakai)} tone="neutral" />
          <StatCard
            label={`Keuntungan · ${ringkasan.margin.toFixed(1)}%`}
            value={rupiah(ringkasan.untung)}
            tone={ringkasan.untung >= 0 ? 'profit' : 'loss'}
          />
        </section>

        <section className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama barang..."
            className="w-full rounded-full border border-stone-200 bg-white px-5 py-2.5 text-sm text-stone-900 shadow-sm outline-none focus:border-amber-400 sm:max-w-sm"
          />
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['semua', 'Semua'],
                ['laris', 'Laris'],
                ['stok-menipis', 'Stok Menipis'],
                ['rugi-tipis', 'Margin Tipis'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                  filter === k
                    ? 'bg-stone-900 text-amber-50'
                    : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="ml-auto text-xs text-stone-500">
            {view.length} dari {items.length} barang · {ringkasan.unitTerjual} unit terjual
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          {view.map((it) => {
            const margin = it.jual - it.modal;
            const marginPct = it.jual > 0 ? (margin / it.jual) * 100 : 0;
            const untungItem = margin * it.terjual;
            const stokLow = it.stok > 0 && it.stok <= 20;
            const habis = it.stok <= 0;
            return (
              <article
                key={it.id}
                className="group rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition hover:shadow-md"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-stone-900">{it.nama}</h3>
                    <p className="text-xs text-stone-500">per {it.satuan}</p>
                  </div>
                  <div className="flex gap-1.5">
                    {habis && (
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500">
                        Habis
                      </span>
                    )}
                    {stokLow && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                        Menipis
                      </span>
                    )}
                    {margin <= 0 && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                        Rugi
                      </span>
                    )}
                  </div>
                </div>

                <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                  <PriceBlock label="Modal" value={rupiah(it.modal)} muted />
                  <PriceBlock label="Jual" value={rupiah(it.jual)} accent />
                  <PriceBlock
                    label={`Margin ${marginPct.toFixed(0)}%`}
                    value={rupiah(margin)}
                    profit={margin > 0}
                    loss={margin <= 0}
                  />
                </div>

                <div className="mb-3 flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2 text-xs">
                  <span className="text-stone-500">
                    Stok: <b className="text-stone-900">{it.stok}</b> · Terjual:{' '}
                    <b className="text-stone-900">{it.terjual}</b>
                  </span>
                  <span className={untungItem >= 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-red-700'}>
                    {untungItem >= 0 ? '+' : ''}
                    {rupiah(untungItem)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={it.stok}
                    value={sellQty[it.id] ?? ''}
                    onChange={(e) => setSellQty((s) => ({ ...s, [it.id]: e.target.value }))}
                    placeholder="Qty"
                    disabled={habis}
                    className="w-20 rounded-lg border border-stone-200 px-2 py-1.5 text-sm outline-none focus:border-amber-400 disabled:bg-stone-50"
                  />
                  <button
                    onClick={() => jual(it)}
                    disabled={habis}
                    className="flex-1 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400"
                  >
                    Catat Laku
                  </button>
                  <button
                    onClick={() => startEdit(it)}
                    className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-50"
                    title="Edit"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => hapus(it.id)}
                    className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                    title="Hapus"
                  >
                    ✕
                  </button>
                </div>
              </article>
            );
          })}
          {view.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-400">
              Tidak ada barang yang cocok. Coba ubah filter atau tambahkan barang baru.
            </div>
          )}
        </section>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="mb-4 text-lg font-semibold text-stone-900">
              {draft.id === null ? 'Tambah Barang' : 'Edit Barang'}
            </h2>
            <div className="space-y-3">
              <Field label="Nama Barang">
                <input
                  value={draft.nama}
                  onChange={(e) => setDraft((d) => ({ ...d, nama: e.target.value }))}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-400"
                  placeholder="cth: Kopi Sachet"
                />
              </Field>
              <Field label="Satuan">
                <input
                  value={draft.satuan}
                  onChange={(e) => setDraft((d) => ({ ...d, satuan: e.target.value }))}
                  list="satuan-list"
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-400"
                />
                <datalist id="satuan-list">
                  {['pcs', 'bks', 'btl', 'btg', 'porsi', 'gls', 'kg', 'liter'].map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Harga Modal">
                  <input
                    type="number"
                    min={0}
                    value={draft.modal}
                    onChange={(e) => setDraft((d) => ({ ...d, modal: e.target.value }))}
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-400"
                  />
                </Field>
                <Field label="Harga Jual">
                  <input
                    type="number"
                    min={0}
                    value={draft.jual}
                    onChange={(e) => setDraft((d) => ({ ...d, jual: e.target.value }))}
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-400"
                  />
                </Field>
              </div>
              <Field label="Stok Awal">
                <input
                  type="number"
                  min={0}
                  value={draft.stok}
                  onChange={(e) => setDraft((d) => ({ ...d, stok: e.target.value }))}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-400"
                />
              </Field>
              {draft.modal && draft.jual && Number(draft.jual) >= Number(draft.modal) && (
                <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Margin per unit:{' '}
                  <b>{rupiah(Number(draft.jual) - Number(draft.modal))}</b> (
                  {(((Number(draft.jual) - Number(draft.modal)) / Number(draft.jual)) * 100).toFixed(1)}%)
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowForm(false);
                  setDraft(EMPTY);
                }}
                className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
              >
                Batal
              </button>
              <button
                onClick={simpan}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-stone-900 px-5 py-2.5 text-sm text-amber-50 shadow-xl">
          {toast}
        </div>
      )}
    </main>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'neutral' | 'accent' | 'profit' | 'loss';
}) {
  const styles = {
    neutral: 'bg-white border-stone-200 text-stone-900',
    accent: 'bg-white border-amber-200 text-stone-900',
    profit: 'bg-emerald-600 border-emerald-600 text-white',
    loss: 'bg-red-600 border-red-600 text-white',
  }[tone];
  const labelCls = tone === 'profit' || tone === 'loss' ? 'text-white/80' : 'text-stone-500';
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${styles}`}>
      <div className={`text-[11px] uppercase tracking-wide ${labelCls}`}>{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}

function PriceBlock({
  label,
  value,
  muted,
  accent,
  profit,
  loss,
}: {
  label: string;
  value: string;
  muted?: boolean;
  accent?: boolean;
  profit?: boolean;
  loss?: boolean;
}) {
  const cls = loss
    ? 'bg-red-50 text-red-700'
    : profit
    ? 'bg-emerald-50 text-emerald-700'
    : accent
    ? 'bg-amber-50 text-amber-800'
    : 'bg-stone-50 text-stone-600';
  return (
    <div className={`rounded-xl px-2 py-2 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${muted ? 'text-stone-700' : ''}`}>{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-stone-600">{label}</span>
      {children}
    </label>
  );
}
