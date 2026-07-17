import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "2rem" }}>
      <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "0.5rem" }}>404 — Page Not Found</h1>
      <p style={{ color: "#64748b", marginBottom: "1.5rem" }}>The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link href="/" style={{ color: "#0d9488", textDecoration: "underline" }}>Go back home</Link>
    </main>
  );
}
