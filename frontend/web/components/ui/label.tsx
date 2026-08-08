"use client";

import { type LabelHTMLAttributes, forwardRef } from "react";

const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className = "", ...props }, ref) => (
    <label
      ref={ref}
      className={[
        "text-sm font-medium leading-none text-slate-700",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      ].join(" ")}
      {...props}
    />
  )
);
Label.displayName = "Label";

export { Label };
