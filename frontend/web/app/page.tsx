import Link from "next/link";

/**
 * Landing page — entry point for unauthenticated visitors.
 * Redirects authenticated users to /dashboard via middleware.
 */
export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #f0fdfa 0%, #e0f2fe 100%)",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      {/* Logo / Brand mark */}
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #0d9488, #0284c7)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "1.5rem",
          boxShadow: "0 4px 24px rgba(13,148,136,0.3)",
        }}
      >
        {/* Medical cross icon (SVG) */}
        <svg
          width="36"
          height="36"
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <rect x="13" y="4" width="10" height="28" rx="2" fill="white" />
          <rect x="4" y="13" width="28" height="10" rx="2" fill="white" />
        </svg>
      </div>

      {/* Heading */}
      <h1
        style={{
          fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
          fontWeight: 800,
          color: "#0f172a",
          marginBottom: "0.75rem",
          letterSpacing: "-0.02em",
        }}
      >
        SmartHealth Hub
      </h1>

      {/* Subtitle */}
      <p
        style={{
          fontSize: "clamp(0.95rem, 2vw, 1.125rem)",
          color: "#475569",
          maxWidth: 520,
          marginBottom: "0.5rem",
          lineHeight: 1.6,
        }}
      >
        Integrated Health Care Information Management System for Barangay Health Centers
      </p>
      <p
        style={{
          fontSize: "0.875rem",
          color: "#94a3b8",
          marginBottom: "2.5rem",
        }}
      >
        NFC ID Card &amp; SMS Notification Services
      </p>

      {/* CTA buttons */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center" }}>
        <Link
          href="/dashboard"
          style={{
            display: "inline-block",
            padding: "0.75rem 2rem",
            background: "#0d9488",
            color: "white",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: "1rem",
            textDecoration: "none",
            boxShadow: "0 2px 8px rgba(13,148,136,0.3)",
            transition: "background 0.2s",
          }}
        >
          Go to Dashboard
        </Link>

        <Link
          href="/login"
          style={{
            display: "inline-block",
            padding: "0.75rem 2rem",
            background: "white",
            color: "#0d9488",
            border: "2px solid #0d9488",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: "1rem",
            textDecoration: "none",
            transition: "background 0.2s",
          }}
        >
          Sign In
        </Link>
      </div>

      {/* Footer note */}
      <p
        style={{
          marginTop: "3rem",
          fontSize: "0.75rem",
          color: "#94a3b8",
        }}
      >
        Thesis Project — Barangay Health Center Digital Transformation
      </p>
    </main>
  );
}
