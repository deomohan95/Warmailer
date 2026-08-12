type IconProps = {
  size?: number;
  className?: string;
};

function base(size: number, className: string | undefined) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className,
  };
}

export function IconDashboard({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

export function IconLeads({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
      <circle cx="9" cy="7" r="3.2" />
      <path d="M22 20v-1.5a4 4 0 0 0-3-3.87" />
      <path d="M16.5 4.2a3.2 3.2 0 0 1 0 5.9" />
    </svg>
  );
}

export function IconCampaigns({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3 10.5 20 4l-6.5 17-2.6-7.2z" />
      <path d="M10.9 13.8 20 4" />
    </svg>
  );
}

export function IconInbox({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3 13h4l1.6 2.6h6.8L17 13h4" />
      <path d="M5.4 5h13.2a2 2 0 0 1 1.9 1.4L22 13v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4l1.5-6.6A2 2 0 0 1 5.4 5z" />
    </svg>
  );
}

export function IconMailbox({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="m3 7 8.1 5.6a1.6 1.6 0 0 0 1.8 0L21 7" />
    </svg>
  );
}

export function IconSettings({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.5 14H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.8 1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1 2.8h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1z" />
    </svg>
  );
}

export function IconSearch({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  );
}

export function IconSun({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </svg>
  );
}

export function IconMoon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5a8.5 8.5 0 1 0 10.8 10.8z" />
    </svg>
  );
}

export function IconMenu({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function IconArrowRight({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}

export function IconPlus({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconUpload({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 15V4M8 7.5 12 3.5l4 4" />
      <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
    </svg>
  );
}

export function IconAlert({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5M12 16h.01" />
    </svg>
  );
}

export function IconCheck({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  );
}

export function IconInfo({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.7h.01" />
    </svg>
  );
}

export function IconLock({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
    </svg>
  );
}

export function IconClock({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.2 2" />
    </svg>
  );
}
