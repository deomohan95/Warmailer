import Link from "next/link";

import { IconCampaigns } from "@/components/icons";

export const metadata = { title: "Login · Warmailer" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; created?: string }> }) {
  const params = await searchParams;

  return (
    <main className="page auth-page">
      <section className="card auth-card">
        <div className="rail-brand">
          <span className="rail-mark" aria-hidden>
            <IconCampaigns size={14} />
          </span>
          <span className="rail-wordmark">Warmailer</span>
        </div>
        <h1>Login</h1>
        <p className="muted">Use your client workspace login.</p>
        {params.created ? <p className="notice notice-accent">Account created. Login now.</p> : null}
        {params.error ? <p className="notice notice-warning">Login failed. Check username and password.</p> : null}
        <form className="stack" action="/api/auth/login" method="post" style={{ gap: "var(--s-4)" }}>
          <label className="field">
            <span>Username or email</span>
            <input className="input" name="identifier" autoComplete="username" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input className="input" name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="btn btn-primary btn-lg" type="submit">
            Login
          </button>
        </form>
        <p className="muted auth-switch">
          New client? <Link href="/signup">Create an account</Link>
        </p>
      </section>
    </main>
  );
}
