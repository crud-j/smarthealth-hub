"use client";

import { type ButtonHTMLAttributes, forwardRef } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "outline";
}

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  default:
    "bg-primary text-white hover:bg-primary/90 shadow-sm",
  ghost:
    "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  outline:
    "border border-border bg-white text-slate-700 hover:bg-slate-50 shadow-sm",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      suppressHydrationWarning
      className={[
        "inline-flex min-h-[40px] cursor-pointer items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        "disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        className,
      ].join(" ")}
      {...props}
    />
  )
);
Button.displayName = "Button";

export { Button };
