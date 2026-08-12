import type { Tone } from "@/lib/labels";

/* ---------- Page header ---------- */

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </div>
  );
}

/* ---------- Card ---------- */

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`card ${className}`.trim()}>{children}</section>;
}

export function CardHead({
  title,
  display = false,
  actions,
}: {
  title: string;
  display?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <header className="card-head">
      {display ? <h2>{title}</h2> : <h3>{title}</h3>}
      {actions ? <div className="row spacer" style={{ justifyContent: "flex-end" }}>{actions}</div> : null}
    </header>
  );
}

/* ---------- Status pill ---------- */

const TONE_CLASS: Record<Tone, string> = {
  neutral: "",
  good: "pill-good",
  warning: "pill-warning",
  critical: "pill-critical",
  accent: "pill-accent",
};

export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return <span className={`pill ${TONE_CLASS[tone]}`.trim()}>{label}</span>;
}

/* ---------- Empty state ---------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
  small = false,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  small?: boolean;
}) {
  return (
    <div className={small ? "empty empty-sm" : "empty"}>
      {icon ? <span className="empty-mark">{icon}</span> : null}
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

/* ---------- Meter ---------- */

export function Meter({
  label,
  value,
  max,
  valueLabel,
  tone = "accent",
}: {
  label: string;
  value: number;
  max: number;
  valueLabel: string;
  tone?: Tone;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const toneClass =
    tone === "good" ? "meter-good" : tone === "warning" ? "meter-warning" : tone === "critical" ? "meter-critical" : "";

  return (
    <div className={`meter ${toneClass}`.trim()}>
      <div className="meter-head">
        <span className="meter-label">{label}</span>
        <span className="meter-value">{valueLabel}</span>
      </div>
      <div
        className="meter-track"
        role="meter"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuetext={valueLabel}
      >
        <div className="meter-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ---------- Notice ---------- */

export function Notice({
  tone = "neutral",
  icon,
  children,
}: {
  tone?: Tone;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "critical"
      ? "notice-critical"
      : tone === "warning"
        ? "notice-warning"
        : tone === "accent"
          ? "notice-accent"
          : "";

  return (
    <div className={`notice ${toneClass}`.trim()}>
      {icon ? <span className="notice-icon">{icon}</span> : null}
      <div>{children}</div>
    </div>
  );
}
