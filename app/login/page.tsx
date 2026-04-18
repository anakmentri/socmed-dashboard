"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { tryLogin, saveSession, loadSession } from "@/lib/auth";
import { logActivity } from "@/lib/utils";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (loadSession()) router.replace("/dashboard");
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const s = await tryLogin(username, password);
      if (s) {
        saveSession(s);
        logActivity({
          who: s.memberName || s.username,
          role: s.role === "admin" ? "Administrator" : "Anggota",
          action: "Login",
          source: "Session",
          detail: `User ${s.username} login ke dashboard`,
        });
        router.replace("/dashboard");
      } else {
        setError("Username atau password salah");
        setLoading(false);
      }
    } catch (err) {
      setError("Gagal login: " + (err instanceof Error ? err.message : "error"));
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-900 p-4">
      <div className="w-full max-w-md rounded-2xl border border-bg-700 bg-bg-800 p-10 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mb-3 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-sky to-brand-violet text-2xl font-bold text-bg-900">
            TD
          </div>
          <h1 className="text-2xl font-bold text-fg-100">Tim Dashboard</h1>
          <p className="mt-1 text-sm text-fg-500">Masuk untuk mengakses dashboard</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-400">
            ⚠ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-300">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-bg-700 bg-bg-900 px-4 py-3 text-sm text-fg-100 outline-none focus:border-brand-sky"
              placeholder="admin / nama_anggota"
              required
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-300">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-bg-700 bg-bg-900 px-4 py-3 text-sm text-fg-100 outline-none focus:border-brand-sky"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-gradient-to-r from-brand-sky to-brand-violet py-3 text-sm font-bold text-bg-900 transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Memproses..." : "Masuk"}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-fg-500">
          Admin: admin/admin123 · Anggota: rully/rully123, faisol/faisol123, dst.
        </div>
      </div>
    </div>
  );
}
