"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Email ou senha inválidos.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4">
      <div className="w-full max-w-[380px] bg-surface border border-border rounded-card shadow-card p-7">
        <span className="font-display font-bold text-[22px] tracking-[-0.4px]">
          Mold<span className="text-olive">AI</span>
        </span>
        <h1 className="mt-4 text-[15px] font-semibold">Entrar</h1>
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-[12px] text-muted-2">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              className="px-3 py-2 border border-border rounded-btn bg-surface-alt text-[13px] text-ink focus:outline-none focus:border-olive"
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-muted-2">
            Senha
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="px-3 py-2 border border-border rounded-btn bg-surface-alt text-[13px] text-ink focus:outline-none focus:border-olive"
            />
          </label>
          {error && <p className="text-[12px] text-alert">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="mt-1 px-4 py-2 rounded-btn bg-olive text-white text-[13px] font-semibold hover:bg-olive-dark disabled:opacity-50 transition-colors"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <p className="mt-4 text-[11px] text-muted">
          Criar conta — <span className="font-medium">em breve</span>. Cada conta tem o seu próprio
          molde, salvo automaticamente.
        </p>
      </div>
    </div>
  );
}
