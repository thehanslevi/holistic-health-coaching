"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

// Broadcast UI kit: square edges, condensed uppercase, volt accent.

// ─── Button ───────────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-ink hover:brightness-110 disabled:bg-surface-3 disabled:text-faint",
  secondary:
    "bg-transparent text-ink border border-line-strong hover:border-accent hover:text-accent disabled:text-faint disabled:hover:border-line-strong",
  ghost: "bg-transparent text-faint hover:text-ink",
  danger: "bg-transparent text-stop border border-stop/40 hover:bg-stop/10",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "text-[12px] px-3 py-1.5 tracking-[0.08em]",
    md: "text-[14px] px-4 py-2.5 tracking-[0.08em]",
    lg: "text-[17px] px-5 py-3.5 w-full tracking-[0.1em]",
  };
  return (
    <button
      className={`display ${BUTTON_STYLES[variant]} ${sizes[size]} transition-colors disabled:cursor-default cursor-pointer ${className}`}
      {...props}
    />
  );
}

// ─── Card / Tile ──────────────────────────────────────────────────────────────

export function Card({
  children,
  className = "",
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-surface border border-line ${onClick ? "cursor-pointer hover:border-line-strong transition-colors" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

/** Seamed grid of stat tiles (1px gap over border color, like a broadcast board) */
export function TileGrid({
  children,
  cols = 3,
  className = "",
}: {
  children: ReactNode;
  cols?: 2 | 3;
  className?: string;
}) {
  return (
    <div
      className={`grid gap-px bg-line border border-line ${cols === 3 ? "grid-cols-3" : "grid-cols-2"} ${className}`}
    >
      {children}
    </div>
  );
}

export function Tile({
  value,
  label,
  accent = false,
}: {
  value: ReactNode;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-surface p-3">
      <div className={`stat-num text-[26px] ${accent ? "text-accent" : "text-ink"}`}>
        {value}
      </div>
      <div className="label mt-1.5">{label}</div>
    </div>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="label mb-2">{children}</div>;
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

export function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "go" | "hold" | "stop";
}) {
  const tones = {
    neutral: "text-muted border-line-strong",
    accent: "text-accent border-accent/50",
    go: "text-go border-go/50",
    hold: "text-hold border-hold/50",
    stop: "text-stop border-stop/50",
  };
  return (
    <span
      className={`display inline-flex items-center gap-1.5 text-[11px] tracking-[0.1em] px-2 py-0.5 border ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

// ─── Traffic light ────────────────────────────────────────────────────────────

export type Light = "green" | "yellow" | "red";

const LIGHT_META: Record<Light, { tone: "go" | "hold" | "stop"; label: string }> = {
  green: { tone: "go", label: "Green" },
  yellow: { tone: "hold", label: "Yellow" },
  red: { tone: "stop", label: "Red" },
};

export function TrafficLight({ light, label }: { light: Light; label?: string }) {
  const meta = LIGHT_META[light];
  return (
    <Chip tone={meta.tone}>
      <span
        className={`w-1.5 h-1.5 ${
          light === "green" ? "bg-go" : light === "yellow" ? "bg-hold" : "bg-stop"
        }`}
      />
      {label ?? meta.label}
    </Chip>
  );
}

// ─── Delta ────────────────────────────────────────────────────────────────────

export function Delta({ value, unit = "" }: { value: number; unit?: string }) {
  if (!value) return <span className="text-faint text-[11px]">—</span>;
  const up = value > 0;
  return (
    <span
      className={`display text-[12px] tracking-[0.04em] ${up ? "text-accent" : "text-stop"}`}
    >
      {up ? "↗" : "↘"} {up ? "+" : ""}
      {Math.round(value * 10) / 10}
      {unit}
    </span>
  );
}

// ─── Segmented control ────────────────────────────────────────────────────────

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex border border-line">
      {options.map((o, i) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`display flex-1 text-[13px] tracking-[0.1em] py-2 transition-colors cursor-pointer ${
            i > 0 ? "border-l border-line" : ""
          } ${
            value === o.value
              ? "bg-accent text-accent-ink"
              : "text-faint hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Form primitives ──────────────────────────────────────────────────────────

export const inputClass =
  "w-full bg-surface border border-line-strong px-3.5 py-2.5 text-sm text-ink outline-none focus:border-accent transition-colors";

export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="label block mb-1.5">{label}</span>
      {children}
    </label>
  );
}

// ─── Check row (tappable checklist item) ──────────────────────────────────────

export function CheckRow({
  checked,
  onToggle,
  title,
  dose,
  note,
  index,
}: {
  checked: boolean;
  onToggle: () => void;
  title: string;
  dose?: string;
  note?: string;
  index?: number;
}) {
  return (
    <div
      onClick={onToggle}
      className={`flex gap-3 items-start p-3 border cursor-pointer transition-colors mb-2 ${
        checked ? "border-accent/60 bg-accent/5" : "bg-surface border-line hover:border-line-strong"
      }`}
    >
      <div
        className={`display w-6 h-6 flex items-center justify-center text-[13px] shrink-0 mt-0.5 ${
          checked ? "bg-accent text-accent-ink" : "bg-surface-3 text-faint"
        }`}
      >
        {checked ? "✓" : (index ?? "")}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-ink">
          {title}
          {dose && <span className="font-normal text-muted"> — {dose}</span>}
        </div>
        {note && <div className="text-xs text-muted mt-0.5 leading-relaxed">{note}</div>}
      </div>
    </div>
  );
}

// ─── Screen header ────────────────────────────────────────────────────────────

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-4">
      {onBack && (
        <button
          onClick={onBack}
          aria-label="Back"
          className="w-9 h-9 border border-line-strong text-muted hover:text-accent hover:border-accent flex items-center justify-center cursor-pointer shrink-0 transition-colors"
        >
          ←
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="display text-[22px] text-ink truncate">{title}</h1>
        {subtitle && <div className="text-xs text-muted mt-0.5">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="text-center py-12 border border-dashed border-line">
      <div className="display text-[15px] tracking-[0.06em] text-muted">{title}</div>
      {hint && <div className="text-xs text-faint mt-1.5">{hint}</div>}
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

export function Dots() {
  return (
    <span className="inline-flex gap-1 items-center">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 bg-accent pulse-dot"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </span>
  );
}
