/**
 * AccessDenied — shown when a signed-in user opens a page their role cannot
 * use (e.g. by typing the URL). Pair with RoleGuard as its `fallback`. The
 * backend still rejects the API calls; this only replaces a confusing error.
 */

interface AccessDeniedProps {
  /** Who may use the page, e.g. "Admins". */
  allowed: string;
  /** What the page shows, e.g. "the audit log". */
  what: string;
}

export default function AccessDenied({ allowed, what }: AccessDeniedProps) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Access denied. Only {allowed} can view {what}.
      </div>
    </div>
  );
}
