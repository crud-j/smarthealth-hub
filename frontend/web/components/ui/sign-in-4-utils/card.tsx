import type { HTMLAttributes } from "react";

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg";
}

const sizeClasses: Record<NonNullable<CardProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

export function Card({ size = "md", className = "", children, ...props }: CardProps) {
  return (
    <div
      className={[
        "w-full rounded-2xl bg-white shadow-md ring-1 ring-rose-900/8",
        sizeClasses[size],
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CardHeader — centered flex column
// ---------------------------------------------------------------------------

export function CardHeader({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["flex flex-col items-center px-6 pt-6 pb-0 text-center", className].join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CardTitle
// ---------------------------------------------------------------------------

export function CardTitle({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h1
      className={["text-base font-semibold tracking-tight text-slate-900", className].join(" ")}
      {...props}
    >
      {children}
    </h1>
  );
}

// ---------------------------------------------------------------------------
// CardContent
// ---------------------------------------------------------------------------

export function CardContent({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={["p-6", className].join(" ")} {...props}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CardFooter
// ---------------------------------------------------------------------------

export function CardFooter({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={[
        "flex items-center px-6 pb-5 pt-0",
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}
