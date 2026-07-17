import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Authentication",
};

interface AuthLayoutProps {
  children: React.ReactNode;
}

/**
 * Auth layout — wraps all authentication pages (login, verify-otp, forgot-password).
 * Centered card layout suitable for credential forms.
 */
export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #f0fdfa 0%, #e0f2fe 100%)",
        padding: "1rem",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "white",
          borderRadius: 12,
          boxShadow: "0 4px 32px rgba(15,23,42,0.08)",
          padding: "2rem",
        }}
      >
        {children}
      </div>
    </div>
  );
}
