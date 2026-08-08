import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ShieldCheck, CreditCard, MessageSquare, BarChart3 } from "lucide-react";

export const metadata: Metadata = {
  title: "Sign In — SmartHealth Hub",
};

const BRAND_FEATURES = [
  { Icon: ShieldCheck, label: "MFA-secured access for all staff" },
  { Icon: CreditCard, label: "NFC & QR health card management" },
  { Icon: MessageSquare, label: "SMS appointment reminders via Semaphore" },
  { Icon: BarChart3, label: "Real-time health analytics dashboard" },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div data-theme="rose" className="min-h-screen grid lg:grid-cols-2">

      {/* ── Left: Branding panel (desktop only) ─────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-[#8b1a22]">

        {/* Top: wordmark */}
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/BHCFINALLOGO.png"
            alt=""
            width={40}
            height={40}
            className="rounded-full ring-2 ring-white/20"
            aria-hidden="true"
          />
          <div>
            <p className="text-white font-semibold text-sm leading-none">SmartHealth Hub</p>
            <p className="text-rose-200/60 text-[11px] mt-0.5">Barangay Health Center</p>
          </div>
        </div>

        {/* Center: headline + feature list */}
        <div>
          <h1 className="text-white text-[2.5rem] font-bold leading-[1.15] tracking-tight mb-3">
            Health records,<br />secured and simple.
          </h1>
          <p className="text-rose-100/75 text-sm leading-relaxed max-w-[28ch] mb-10">
            Integrated care information management for community health workers,
            nurses, and physicians.
          </p>

          <ul className="space-y-3.5" role="list">
            {BRAND_FEATURES.map(({ Icon, label }) => (
              <li key={label} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-3.5 h-3.5 text-rose-100" aria-hidden="true" />
                </div>
                <span className="text-rose-100/85 text-sm">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom: legal notice */}
        <p className="text-rose-200/40 text-xs">
          © {new Date().getFullYear()} SmartHealth Hub · Authorized BHC Staff Only
        </p>
      </div>

      {/* ── Right: Auth form panel ───────────────────────────────────── */}
      <div className="flex flex-col items-center justify-center min-h-screen lg:min-h-0 bg-white p-6">

        {/* Mobile-only brand bar */}
        <div className="flex items-center gap-2 mb-8 lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/BHCFINALLOGO.png"
            alt="SmartHealth Hub"
            width={30}
            height={30}
            className="rounded-full"
          />
          <span className="font-semibold text-slate-800 text-sm">SmartHealth Hub</span>
        </div>

        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
