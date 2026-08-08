"use client";

import { type InputHTMLAttributes, forwardRef } from "react";

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...props }, ref) => (
    <input
      ref={ref}
      suppressHydrationWarning
      className={[
        "flex h-10 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900",
        "placeholder:text-slate-400",
        "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "transition-colors",
        className,
      ].join(" ")}
      {...props}
    />
  )
);
Input.displayName = "Input";

export { Input };
