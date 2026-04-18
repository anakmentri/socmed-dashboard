'use client';

import { useMemo, useState } from 'react';

type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  stock: number;
  sold: number;
  sku: string;
};

type SortKey = 'name' | 'category' | 'price' | 'stock' | 'sold';
type SortDir = 'asc' | 'desc';

const SEED: Product[] = [
  { id: 1, name: 'Indomie Goreng', category: 'Mie Instan', price: 3500, stock: 120, sold: 0, sku: 'MI-001' },
  { id: 2, name: 'Aqua 600ml', category: 'Minuman', price: 4000, stock: 80, sold: 0, sku: 'MN-014' },
  { id: 3, name: 'Teh Pucuk 350ml', category: 'Minuman', price: 5000, stock: 45, sold: 0, sku: 'MN-022' },
  { id: 4, name: 'Beras Pandan Wangi 5kg', category: 'Sembako', price: 72000, stock: 18, sold: 0, sku: 'SB-003' },
  { id: 5, name: 'Minyak Goreng 1L', category: 'Sembako', price: 17500, stock: 35, sold: 0, sku: 'SB-011' },
  { id: 6, name: 'Gula Pasir 1kg', category: 'Sembako', price: 15000, stock: 50, sold: 0, sku: 'SB-005' },
  { id: 7, name: 'Chitato Sapi Panggang', category: 'Snack', price: 9500, stock: 60, sold: 0, sku: 'SN-008' },
  { id: 8, name: 'Silverqueen 65g', category: 'Snack', price: 18000, stock: 24, sold: 0, sku: 'SN-019' },
  { id: 9, name: 'Sabun Lifebuoy', category: 'Kebersihan', price: 4500, stock: 90, sold: 0, sku: 'KB-002' },
  { id: 10, name: 'Pasta Gigi Pepsodent', category: 'Kebersihan', price: 12000, stock: 40, sold: 0, sku: 'KB-007' },
  { id: 11, name: 'Rokok Sampoerna Mild 16', category: 'Rokok', price: 32000, stock: 70, sold: 0, sku: 'RK-004' },
  { id: 12, name: 'Roti Tawar Sari Roti', category: 'Roti', price: 16000, stock: 22, sold: 0, sku: 'RT-001' },
];

const rupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);

type EditDraft = {
  id: number | null;
  name: string;
  category: string;
  price: string;
  stock: string;
  sku: string;
};

const EMPTY_DRAFT: EditDraft = { id: null, name: '', category: '', price: '', stock: '', sku: '' };

export default function MinimarketDashboardPage() {
  const [items, setItems] = useState<Product[]>(SEED);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('Semua');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [draft, setDraft] = useState<EditDraft>(EMPTY_DRAFT);
  const [showForm, setShowForm] = useState(false);
  const [sellQty, setSellQty] = useState<Record<number, string>>({});
  const [toast, setToast] = useState<string>('');

  const categories = useMemo(
    () => ['Semua', ...Array.from(new Set(items.map((i) => i.category))).sort()],
    [items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items.filter((p) => {
      const matchQ = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
      const matchC = category === 'Semua' || p.category === category;
      return matchQ && matchC;
    });
    const sorted = [...list].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      let cmp = 0;
      if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb), 'id');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [items, query, category, sortKey, sortDir]);

  const totals = useMemo(() => {
    const count = filtered.length;
    const stock = filtered.reduce((a, b) => a + b.stock, 0);
    const value = filtered.reduce((a, b) => a + b.stock * b.price, 0);
    const soldUnits = items.reduce((a, b) => a + b.sold, 0);
    const revenue = items.reduce((a, b) => a + b.sold * b.price, 0);
    return { count, stock, value, soldUnits, revenue };
  }, [filtered, items]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const arrow = (key: SortKey) => (sortKey !== key ? '' : sortDir === 'asc' ? ' ▲' : ' ▼');

  const removeItem = (id: number) => {
    if (!confirm('Hapus barang ini?')) return;
    setItems((xs) => xs.filter((x) => x.id !== id));
  };

  const startEdit = (p: Product) => {
    setDraft({
      id: p.id,
      name: p.name,
      category: p.category,
      price: String(p.price),
      stock: String(p.stock),
      sku: p.sku,
    });
    setShowForm(true);
  };

  const startAdd = () => {
    setDraft(EMPTY_DRAFT);
    setShowForm(true);
  };

  const cancelForm = () => {
    setDraft(EMPTY_DRAFT);
    setShowForm(false);
  };

  const saveDraft = () => {
    const name = draft.name.trim();
    const cat = draft.category.trim();
    const sku = draft.sku.trim() || `NEW-${Date.now().toString().slice(-4)}`;
    const price = Number(draft.price);
    const stock = Number(draft.stock);
    if (!name || !cat) return alert('Nama dan kategori wajib diisi.');
    if (!Number.isFinite(price) || price < 0) return alert('Harga tidak valid.');
    if (!Number.isFinite(stock) || stock < 0) return alert('Stok tidak valid.');

    if (draft.id === null) {
      const nextId = Math.max(0, ...items.map((x) => x.id)) + 1;
      setItems((xs) => [...xs, { id: nextId, name, category: cat, price, stock, sold: 0, sku }]);
      flash(`Barang "${name}" ditambahkan.`);
    } else {
      setItems((xs) =>
        xs.map((x) => (x.id === draft.id ? { ...x, name, category: cat, price, stock, sku } : x)),
      );
      flash(`Barang "${name}" diperbarui.`);
    }
    cancelForm();
  };

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  };

  const sell = (p: Product) => {
    const raw = sellQty[p.id] ?? '1';
    const qty = Number(raw);
    if (!Number.isFinite(qty) || qty <= 0) return alert('Jumlah jual tidak valid.');
    if (qty > p.stock) return alert('Stok tidak mencukupi.');
    setItems((xs) =>
      xs.map((x) => (x.id === p.id ? { ...x, stock: x.stock - qty, sold: x.sold + qty } : x)),
    );
    setSellQty((s) => ({ ...s, [p.id]: '' }));
    flash(`Terjual ${qty} × ${p.name} (${rupiah(qty * p.price)})`);
  };

  const stockBadge = (s: number) => {
    if (s <= 0) return { label: 'Habis', cls: 'bg-slate-200 text-slate-600' };
    if (s <= 20) return { label: 'Menipis', cls: 'bg-red-100 text-red-700' };
    if (s <= 50) return { label: 'Sedang', cls: 'bg-amber-100 text-amber-700' };
    return { label: 'Aman', cls: 'bg-emerald-100 text-emerald-700' };
  };

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Dashboard Minimarket</h1>
            <p className="text-sm text-slate-500">Kelola stok, harga, dan pencatatan penjualan.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">Update: {new Date().toLocaleDateString('id-ID')}</span>
            <button
              onClick={startAdd}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              + Tambah Barang
            </button>
          </div>
        </header>

        <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Jumlah Item</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{totals.count}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Total Stok</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{totals.stock}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Unit Terjual</div>
            <div className="mt-1 text-2xl font-semibold text-emerald-700">{totals.soldUnits}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Pendapatan</div>
            <div className="mt-1 text-2xl font-semibold text-emerald-700">{rupiah(totals.revenue)}</div>
          </div>
        </section>

        <section className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama barang atau SKU..."
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 sm:max-w-xs"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <div className="ml-auto flex flex-wrap gap-2 text-sm">
            <button
              onClick={() => toggleSort('price')}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 hover:bg-slate-100"
            >
              Urut Harga{arrow('price')}
            </button>
            <button
              onClick={() => toggleSort('stock')}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 hover:bg-slate-100"
            >
              Urut Stok{arrow('stock')}
            </button>
            <button
              onClick={() => toggleSort('sold')}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 hover:bg-slate-100"
            >
              Urut Terjual{arrow('sold')}
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">SKU</th>
                  <th className="cursor-pointer px-4 py-3 select-none" onClick={() => toggleSort('name')}>
                    Nama Barang{arrow('name')}
                  </th>
                  <th className="cursor-pointer px-4 py-3 select-none" onClick={() => toggleSort('category')}>
                    Kategori{arrow('category')}
                  </th>
                  <th
                    className="cursor-pointer px-4 py-3 text-right select-none"
                    onClick={() => toggleSort('price')}
                  >
                    Harga{arrow('price')}
                  </th>
                  <th
                    className="cursor-pointer px-4 py-3 text-right select-none"
                    onClick={() => toggleSort('stock')}
                  >
                    Stok{arrow('stock')}
                  </th>
                  <th
                    className="cursor-pointer px-4 py-3 text-right select-none"
                    onClick={() => toggleSort('sold')}
                  >
                    Terjual{arrow('sold')}
                  </th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Jual</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filtered.map((p) => {
                  const b = stockBadge(p.stock);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.sku}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                      <td className="px-4 py-3">{p.category}</td>
                      <td className="px-4 py-3 text-right">{rupiah(p.price)}</td>
                      <td className="px-4 py-3 text-right">{p.stock}</td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-700">{p.sold}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${b.cls}`}>
                          {b.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            min={1}
                            max={p.stock}
                            value={sellQty[p.id] ?? ''}
                            onChange={(e) => setSellQty((s) => ({ ...s, [p.id]: e.target.value }))}
                            placeholder="Qty"
                            className="w-16 rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:border-emerald-500"
                            disabled={p.stock <= 0}
                          />
                          <button
                            onClick={() => sell(p)}
                            disabled={p.stock <= 0}
                            className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                          >
                            Jual
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => startEdit(p)}
                            className="text-xs font-medium text-blue-600 hover:text-blue-800"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => removeItem(p.id)}
                            className="text-xs font-medium text-red-600 hover:text-red-800"
                          >
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-400">
                      Tidak ada barang yang cocok dengan filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              {draft.id === null ? 'Tambah Barang Baru' : 'Edit Barang'}
            </h2>
            <div className="space-y-3">
              <Field label="Nama Barang">
                <input
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />
              </Field>
              <Field label="Kategori">
                <input
                  value={draft.category}
                  onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                  list="category-list"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />
                <datalist id="category-list">
                  {categories.filter((c) => c !== 'Semua').map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
              <Field label="SKU (opsional)">
                <input
                  value={draft.sku}
                  onChange={(e) => setDraft((d) => ({ ...d, sku: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Harga (Rp)">
                  <input
                    type="number"
                    min={0}
                    value={draft.price}
                    onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                </Field>
                <Field label="Stok">
                  <input
                    type="number"
                    min={0}
                    value={draft.stock}
                    onChange={(e) => setDraft((d) => ({ ...d, stock: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                </Field>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={cancelForm}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                onClick={saveDraft}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
