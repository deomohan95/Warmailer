import Link from "next/link";

import { IconCampaigns } from "@/components/icons";

export const metadata = { title: "Sign up · Warmailer" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
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
        <h1>Create client account</h1>
        <p className="muted">This creates a new workspace for the company.</p>
        {params.error ? <p className="notice notice-warning">Signup failed. Fill the required fields and use an 8+ character password.</p> : null}
        <form className="stack" action="/api/auth/signup" method="post" style={{ gap: "var(--s-4)" }}>
          <label className="field">
            <span>Name</span>
            <input className="input" name="name" autoComplete="name" required />
          </label>
          <label className="field">
            <span>Email</span>
            <input className="input" name="email" type="email" autoComplete="email" required />
          </label>
          <label className="field">
            <span>Phone number</span>
            <input className="input" name="phone" type="tel" autoComplete="tel" />
          </label>
          <label className="field">
            <span>Company name</span>
            <input className="input" name="company" autoComplete="organization" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input className="input" name="password" type="password" autoComplete="new-password" minLength={8} required />
          </label>
          <button className="btn btn-primary btn-lg" type="submit">
            Create account
          </button>
        </form>
        <p className="muted auth-switch">
          Already have login? <Link href="/login">Login</Link>
        </p>
      </section>
    </main>
  );
}
