/**
 * Generate Registration QR Code
 *
 * Run this script whenever your Cloudflare tunnel URL changes:
 *   node generate-registration-qr.js
 *
 * It reads QR_BASE_URL from backend/.env, appends /register,
 * and writes the QR code image to frontend/web/public/.
 *
 * Usage:
 *   1. Update QR_BASE_URL in backend/.env with your new Cloudflare URL
 *   2. Run: node generate-registration-qr.js
 *   3. Print frontend/web/public/registration-poster.svg and laminate
 */

const fs = require("fs");
const path = require("path");
const QRCode = require(path.join(__dirname, "frontend/web/node_modules/qrcode"));

// ---------------------------------------------------------------------------
// Read QR_BASE_URL from backend/.env
// ---------------------------------------------------------------------------

function readEnvValue(filePath, key) {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const eqIdx = trimmed.indexOf("=");
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim();
      if (k === key) return v;
    }
  } catch {
    return null;
  }
  return null;
}

const envPath = path.join(__dirname, "backend/.env");
const rawBaseUrl = readEnvValue(envPath, "QR_BASE_URL") || "http://localhost:3000";
const baseUrl = rawBaseUrl.trim().replace(/\/$/, "");
const registrationUrl = `${baseUrl}/intake`;

console.log(`\n📋 Registration URL: ${registrationUrl}\n`);

// ---------------------------------------------------------------------------
// Output paths
// ---------------------------------------------------------------------------

const publicDir = path.join(__dirname, "frontend/web/public");
const pngPath = path.join(publicDir, "registration-qr.png");
const svgPath = path.join(publicDir, "registration-qr.svg");
const posterPath = path.join(publicDir, "registration-poster.svg");

// ---------------------------------------------------------------------------
// Generate PNG (for embedding in the poster and digital use)
// ---------------------------------------------------------------------------

QRCode.toFile(
  pngPath,
  registrationUrl,
  {
    type: "png",
    width: 600,
    margin: 2,
    color: { dark: "#1a0808", light: "#ffffff" },
    errorCorrectionLevel: "H",
  },
  (err) => {
    if (err) { console.error("PNG error:", err); process.exit(1); }
    console.log(`✅ QR PNG saved: ${pngPath}`);
  }
);

// ---------------------------------------------------------------------------
// Generate SVG (vector — best for printing)
// ---------------------------------------------------------------------------

QRCode.toString(
  registrationUrl,
  {
    type: "svg",
    margin: 2,
    color: { dark: "#1a0808", light: "#ffffff" },
    errorCorrectionLevel: "H",
    width: 300,
  },
  (err, qrSvgString) => {
    if (err) { console.error("SVG error:", err); process.exit(1); }

    // Extract just the inner <svg> content (strip outer svg wrapper for embedding)
    const innerMatch = qrSvgString.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
    const qrInner = innerMatch ? innerMatch[1] : qrSvgString;
    const viewBoxMatch = qrSvgString.match(/viewBox="([^"]+)"/);
    const qrViewBox = viewBoxMatch ? viewBoxMatch[1] : "0 0 37 37";

    fs.writeFileSync(svgPath, qrSvgString);
    console.log(`✅ QR SVG saved: ${svgPath}`);

    // -------------------------------------------------------------------------
    // Build printable poster SVG (A4 portrait, 210×297mm at 96dpi ≈ 794×1123px)
    // -------------------------------------------------------------------------

    const bhcLogo = path.join(publicDir, "BHCFINALLOGO.svg");
    let logoEl = "";
    if (fs.existsSync(bhcLogo)) {
      // Embed logo as a data URI so the SVG is self-contained
      const logoData = fs.readFileSync(bhcLogo, "utf-8");
      const b64 = Buffer.from(logoData).toString("base64");
      logoEl = `<image x="297" y="48" width="200" height="200" href="data:image/svg+xml;base64,${b64}" />`;
    }

    const poster = `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="794" height="1123" viewBox="0 0 794 1123">

  <!-- Background -->
  <rect width="794" height="1123" fill="#fff9f8"/>

  <!-- Top accent bar -->
  <rect width="794" height="12" fill="#b5343e"/>

  <!-- BHC header band -->
  <rect x="0" y="12" width="794" height="240" fill="#fdf0f0"/>
  <rect x="0" y="252" width="794" height="2" fill="#e8b4b8"/>

  <!-- BHC Logo (centered top) -->
  ${logoEl || `<circle cx="397" cy="132" r="80" fill="#fde8e8" stroke="#e8b4b8" stroke-width="2"/>`}

  <!-- Title block -->
  <text x="397" y="292" font-family="'Segoe UI',Arial,sans-serif" font-size="28" font-weight="800" fill="#1a0808" text-anchor="middle" letter-spacing="0.5">Sta. Rosa 1 Barangay Health Station</text>
  <text x="397" y="326" font-family="'Segoe UI',Arial,sans-serif" font-size="17" fill="#6b4f4f" text-anchor="middle">Patubig, Marilao, Bulacan</text>

  <!-- Divider -->
  <line x1="100" y1="350" x2="694" y2="350" stroke="#e8b4b8" stroke-width="1.5"/>

  <!-- Main instruction -->
  <text x="397" y="400" font-family="'Segoe UI',Arial,sans-serif" font-size="34" font-weight="800" fill="#b5343e" text-anchor="middle">PATIENT REGISTRATION</text>
  <text x="397" y="438" font-family="'Segoe UI',Arial,sans-serif" font-size="22" fill="#3d2222" text-anchor="middle">Scan the QR code to register online</text>

  <!-- QR code card -->
  <rect x="172" y="462" width="450" height="450" rx="24" fill="white" stroke="#e8b4b8" stroke-width="2"/>
  <rect x="192" y="482" width="410" height="410" rx="16" fill="white"/>

  <!-- Embed QR SVG scaled to fit the card -->
  <svg x="197" y="487" width="400" height="400" viewBox="${qrViewBox}">
    ${qrInner}
  </svg>

  <!-- How to scan instruction -->
  <text x="397" y="944" font-family="'Segoe UI',Arial,sans-serif" font-size="16" font-weight="700" fill="#3d2222" text-anchor="middle">HOW TO SCAN</text>
  <text x="397" y="968" font-family="'Segoe UI',Arial,sans-serif" font-size="14" fill="#6b4f4f" text-anchor="middle">Open your phone camera and point it at the QR code.</text>
  <text x="397" y="988" font-family="'Segoe UI',Arial,sans-serif" font-size="14" fill="#6b4f4f" text-anchor="middle">Tap the link that appears and fill out the form.</text>

  <!-- URL text (for those who want to type it) -->
  <rect x="100" y="1012" width="594" height="52" rx="10" fill="#fdf0f0" stroke="#e8b4b8" stroke-width="1.5"/>
  <text x="397" y="1032" font-family="'Segoe UI',Arial,sans-serif" font-size="11" fill="#9c8080" text-anchor="middle">Or type this address in your browser:</text>
  <text x="397" y="1053" font-family="'Courier New',monospace" font-size="13" font-weight="700" fill="#b5343e" text-anchor="middle">${registrationUrl}</text>

  <!-- Bottom bar -->
  <rect x="0" y="1111" width="794" height="12" fill="#b5343e"/>
</svg>`;

    fs.writeFileSync(posterPath, poster);
    console.log(`✅ Printable poster SVG saved: ${posterPath}`);
    console.log("\n🖨️  To print:");
    console.log("   Open frontend/web/public/registration-poster.svg in a browser");
    console.log("   → File → Print → A4, Portrait, No margins → Print\n");
    console.log("📌 Whenever your Cloudflare URL changes:");
    console.log("   1. Update QR_BASE_URL in backend/.env");
    console.log("   2. Re-run: node generate-registration-qr.js");
    console.log("   3. Reprint and re-laminate the poster\n");
  }
);
