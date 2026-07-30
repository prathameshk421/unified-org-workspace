import type { ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "tertiary";
  size?: "sm" | "md";
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  const baseClasses =
    "inline-flex items-center justify-center gap-2 rounded-full font-sans font-medium transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-50";

  const sizeClasses = size === "sm" ? "px-3.5 py-1.5 text-sm" : "px-5 py-2.5 text-sm";

  const variantClasses =
    variant === "primary"
      ? "bg-brand-600 text-white hover:bg-brand-700"
      : variant === "secondary"
        ? "bg-foreground text-surface-raised hover:bg-surface-ink"
        : "border border-border bg-transparent text-foreground hover:bg-surface-muted";

  return (
    <button className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`} {...props}>
      {children}
    </button>
  );
}
