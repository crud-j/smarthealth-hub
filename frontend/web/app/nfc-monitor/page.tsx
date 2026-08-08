'use client';

/**
 * NFC Wi-Fi Relay Monitor — /nfc-monitor
 *
 * Public page (no auth required). Accessible at:
 *   http://192.168.100.6:3000/nfc-monitor
 *
 * Polls GET /api/v1/health-cards/last-scan every 2 seconds.
 * When a scan result arrives, displays patient name, DOB, blood type,
 * allergies, and emergency contact in a mobile-first card layout.
 *
 * Used during NFC Wi-Fi relay testing — the Android phone scans a tag
 * and results appear here in near-realtime.
 *
 * No PHI beyond name/DOB/contact is shown. Diagnosis and treatment notes
 * are never returned by the last-scan endpoint.
 */

import { useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types matching the FastAPI NfcScanPatientInfo + LastScanResponse schemas
// ---------------------------------------------------------------------------

interface NfcPatient {
  patient_id: string;
  patient_code: string;
  full_name: string;
  date_of_birth: string;
  sex: string;
  blood_type: string;
  emergency_contact_name: string | null;
  emergency_contact_number: string | null;
  allergies: string;
  card_status: string;
  is_senior: boolean;
  is_pwd: boolean;
  is_pregnant: boolean;
}

interface LastScanResult {
  scanned_at: string | null;
  found: boolean;
  uid: string | null;
  patient: NfcPatient | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://192.168.100.6:8000/api/v1';

const POLL_INTERVAL_MS = 2000;

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-PH', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Priority badge component
// ---------------------------------------------------------------------------

function PriorityBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: 700,
        color: '#fff',
        background: color,
        marginRight: '6px',
      }}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function NfcMonitorPage() {
  const [scanResult, setScanResult] = useState<LastScanResult | null>(null);
  const [lastPollAt, setLastPollAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);

  // Track the last scanned_at we've already shown, so "cleared" state resets
  // automatically when a new scan arrives.
  const lastShownAt = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const res = await fetch(`${API_BASE}/health-cards/last-scan`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          setError(`Backend returned ${res.status}`);
          return;
        }
        const data: LastScanResult = await res.json() as LastScanResult;
        setError(null);
        setLastPollAt(new Date().toLocaleTimeString('en-PH'));

        // If a new scan arrived since we last showed one, un-clear.
        if (data.scanned_at && data.scanned_at !== lastShownAt.current) {
          lastShownAt.current = data.scanned_at;
          setCleared(false);
          setScanResult(data);
        } else if (!data.scanned_at) {
          // Nothing scanned yet — keep showing waiting state.
          setScanResult(data);
        }
      } catch (err) {
        setError(`Cannot reach backend: ${String(err)}`);
      }
    }

    // Immediate first poll then on interval.
    void poll();
    const timer = setInterval(() => { if (active) void poll(); }, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const showWaiting = cleared || !scanResult || !scanResult.found || !scanResult.patient;
  const patient = scanResult?.patient ?? null;
  const isActive = patient?.card_status === 'active';

  return (
    <div
      style={{
        margin: 0,
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        background: '#f0f9ff',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 16px 48px',
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '24px', width: '100%', maxWidth: '440px' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            color: '#0369a1',
            marginBottom: '4px',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
          <span style={{ fontWeight: 800, fontSize: '20px' }}>SmartHealth Hub</span>
        </div>
        <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
          NFC Wi-Fi Relay Monitor
        </p>
        {lastPollAt && (
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#94a3b8' }}>
            Last polled: {lastPollAt}
          </p>
        )}
        {error && (
          <p
            style={{
              margin: '8px 0 0',
              fontSize: '12px',
              color: '#dc2626',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '6px 12px',
            }}
          >
            {error}
          </p>
        )}
      </div>

      {/* Main card — max width keeps it readable on phone */}
      <div style={{ width: '100%', maxWidth: '440px' }}>
        {showWaiting ? (
          <WaitingCard />
        ) : (
          patient && (
            <PatientCard patient={patient} scannedAt={scanResult?.scanned_at ?? null} isActive={isActive} />
          )
        )}

        {/* Clear / Reset button */}
        {!showWaiting && (
          <button
            type="button"
            onClick={() => setCleared(true)}
            style={{
              marginTop: '16px',
              width: '100%',
              padding: '14px',
              borderRadius: '10px',
              border: '2px solid #cbd5e1',
              background: '#ffffff',
              color: '#475569',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Clear — Wait for Next Scan
          </button>
        )}
      </div>

      {/* Footer */}
      <p style={{ marginTop: '32px', fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>
        Barangay Health Center · NFC Relay Test Mode · Polling every {POLL_INTERVAL_MS / 1000}s
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Waiting state card
// ---------------------------------------------------------------------------

function WaitingCard() {
  return (
    <div
      style={{
        borderRadius: '20px',
        border: '2px dashed #93c5fd',
        background: '#ffffff',
        padding: '48px 32px',
        textAlign: 'center',
      }}
    >
      {/* Pulsing NFC antenna icon */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '80px',
            height: '80px',
          }}
        >
          {/* Outer pulse ring */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '3px solid #93c5fd',
              animation: 'nfc-pulse 2s ease-out infinite',
            }}
          />
          {/* Inner circle */}
          <div
            style={{
              position: 'absolute',
              inset: '12px',
              borderRadius: '50%',
              background: '#eff6ff',
              border: '2px solid #3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth={2} aria-hidden="true">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </div>
        </div>
      </div>

      <h2 style={{ margin: '0 0 8px', fontSize: '22px', fontWeight: 700, color: '#1e40af' }}>
        Waiting for NFC Scan...
      </h2>
      <p style={{ margin: 0, fontSize: '15px', color: '#64748b', lineHeight: 1.5 }}>
        Hold an NFC-enabled health card against your phone&apos;s NFC sensor.
        Patient details will appear here automatically.
      </p>
      <p style={{ marginTop: '16px', fontSize: '12px', color: '#94a3b8' }}>
        The relay server forwards each scan to this page in real-time.
      </p>

      {/* Keyframe animation injected as a style tag */}
      <style>{`
        @keyframes nfc-pulse {
          0%   { transform: scale(1); opacity: 0.8; }
          70%  { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Patient result card
// ---------------------------------------------------------------------------

function PatientCard({
  patient,
  scannedAt,
  isActive,
}: {
  patient: NfcPatient;
  scannedAt: string | null;
  isActive: boolean;
}) {
  const statusColor = isActive ? '#16a34a' : '#f59e0b';
  const statusBg = isActive ? '#f0fdf4' : '#fffbeb';
  const statusBorder = isActive ? '#86efac' : '#fcd34d';

  return (
    <div
      style={{
        borderRadius: '20px',
        border: `2px solid ${statusBorder}`,
        background: statusBg,
        padding: '28px 24px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      }}
    >
      {/* Status badge */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: statusColor,
            color: '#fff',
            borderRadius: '24px',
            padding: '6px 18px',
            fontWeight: 700,
            fontSize: '14px',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} aria-hidden="true">
            {isActive ? (
              <polyline points="20 6 9 17 4 12" />
            ) : (
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            )}
          </svg>
          Card {capitalize(patient.card_status)}
        </div>
      </div>

      {/* Name */}
      <h2
        style={{
          margin: '0 0 4px',
          textAlign: 'center',
          fontSize: '26px',
          fontWeight: 800,
          color: '#0f172a',
          lineHeight: 1.2,
        }}
      >
        {patient.full_name}
      </h2>
      <p style={{ margin: '0 0 16px', textAlign: 'center', fontSize: '14px', color: '#0d9488', fontWeight: 600 }}>
        {patient.patient_code}
      </p>

      {/* Priority flags */}
      {(patient.is_senior || patient.is_pwd || patient.is_pregnant) && (
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          {patient.is_senior && <PriorityBadge label="Senior" color="#7c3aed" />}
          {patient.is_pwd && <PriorityBadge label="PWD" color="#0369a1" />}
          {patient.is_pregnant && <PriorityBadge label="Pregnant" color="#be185d" />}
        </div>
      )}

      {/* Detail rows */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
        }}
      >
        <DetailRow label="Date of Birth" value={patient.date_of_birth} />
        <DetailRow label="Sex" value={capitalize(patient.sex)} divider />
        <DetailRow label="Blood Type" value={patient.blood_type} divider />
        <DetailRow label="Allergies" value={patient.allergies} divider />
        <DetailRow
          label="Emergency Contact"
          value={
            patient.emergency_contact_name
              ? `${patient.emergency_contact_name}${patient.emergency_contact_number ? ' · ' + patient.emergency_contact_number : ''}`
              : 'None on record'
          }
          divider
        />
      </div>

      {/* Scanned at timestamp */}
      {scannedAt && (
        <p style={{ marginTop: '14px', textAlign: 'center', fontSize: '12px', color: '#94a3b8' }}>
          Scanned at {formatTime(scannedAt)}
        </p>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  divider,
}: {
  label: string;
  value: string;
  divider?: boolean;
}) {
  return (
    <div
      style={{
        padding: '12px 16px',
        borderTop: divider ? '1px solid #f1f5f9' : undefined,
      }}
    >
      <p style={{ margin: '0 0 2px', fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: '16px', fontWeight: 500, color: '#1e293b' }}>
        {value}
      </p>
    </div>
  );
}
