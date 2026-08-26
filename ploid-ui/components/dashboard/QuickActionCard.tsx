"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

export type QuickActionCardVariant =
  "research" | "import" | "table" | "function";

const eyebrowByVariant: Record<QuickActionCardVariant, string> = {
  research: "Discovery",
  import: "Archive",
  table: "Foundation",
  function: "Automation",
};

function MeanderBand() {
  return (
    <svg
      viewBox="0 0 240 12"
      aria-hidden="true"
      className="quick-action-card__frieze"
    >
      <path d="M0 6h12V1h12v10h12V1h12v10h12V1h12v10h12V1h12v10h12V1h12v10h12V1h12v10h12V1h12v10h12V1h12v10h12V1h12v10h12V1h12v10h12V1h12v10h12V1h12v10h12V1h12v10h12V1h12v10h12V1h12v10h12" />
    </svg>
  );
}

function CornerOrnament() {
  return (
    <svg
      viewBox="0 0 70 70"
      aria-hidden="true"
      className="quick-action-card__corner"
    >
      <path d="M6 64C5 33 26 10 62 8M15 62c-1-24 16-39 42-43M24 60c2-17 13-27 31-31M42 7l4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1 4-8Z" />
    </svg>
  );
}

export function QuickActionCard({
  title,
  description,
  ctaLabel,
  icon: Icon,
  variant,
  onClick,
}: {
  title: string;
  description: string;
  ctaLabel: string;
  icon: LucideIcon;
  variant: QuickActionCardVariant;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`quick-action-card quick-action-card--${variant}`}
    >
      <MeanderBand />
      <CornerOrnament />
      <div className="quick-action-card__medallion">
        <Icon className="size-4" />
      </div>
      <p className="quick-action-card__eyebrow">{eyebrowByVariant[variant]}</p>
      <h3 className="quick-action-card__title">{title}</h3>
      <p className="quick-action-card__description">{description}</p>
      <div className="quick-action-card__divider" aria-hidden="true">
        <span />
        <i />
        <span />
      </div>
      <span className="quick-action-card__cta">
        {ctaLabel}
        <ArrowRight className="size-3.5" />
      </span>
    </button>
  );
}
