// Shared utility functions

/** Joins class names, filtering out falsy values (cn helper). */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** Formats a Date or ISO string to a readable PH locale date string. */
export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
