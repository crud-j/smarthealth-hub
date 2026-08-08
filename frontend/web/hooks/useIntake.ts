"use client";
/**
 * Hooks for the pre-visit patient intake flow.
 */

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";

export interface IntakeDraftResponse {
  token: string;
  expires_at: string;
  draft_data: Record<string, unknown> | null;
}

export interface IntakeFinalizeResponse {
  patient_id: string;
  patient_code: string;
  registration_data_source: string;
}

export function useDraftIntake(token: string | null) {
  const [data, setData] = useState<IntakeDraftResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const raw = await apiFetch<IntakeDraftResponse>(`/intake/${token}`);
      setData(raw);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load intake form.");
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

export function useSaveDraft(token: string | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveDraft = useCallback(
    async (formData: Record<string, unknown>): Promise<boolean> => {
      if (!token) return false;
      setLoading(true);
      setError(null);
      try {
        await apiFetch(`/intake/${token}`, {
          method: "PUT",
          body: JSON.stringify(formData),
        });
        return true;
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to save draft.");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  return { saveDraft, loading, error };
}

export interface IntakeTokenResponse {
  token: string;
  intake_url: string;
  expires_at: string;
}

export interface PendingIntakeSummary {
  token: string;
  created_at: string;
  expires_at: string;
  has_draft: boolean;
  patient_name: string | null;
}

export function usePendingIntakes() {
  const [data, setData] = useState<PendingIntakeSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await apiFetch<PendingIntakeSummary[]>("/intake/pending");
      setData(raw);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load pending intakes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

export function useGenerateIntakeToken() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IntakeTokenResponse | null>(null);

  const generate = useCallback(async (): Promise<IntakeTokenResponse | null> => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<IntakeTokenResponse>("/patients/intake-token", {
        method: "POST",
      });
      setResult(data);
      return data;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate intake link.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { generate, loading, error, result, clear };
}

export function useFinalizeIntake(token: string | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finalize = useCallback(async (): Promise<IntakeFinalizeResponse | null> => {
    if (!token) return null;
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<IntakeFinalizeResponse>(
        `/intake/${token}/finalize`,
        { method: "POST" }
      );
      return result;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Finalization failed.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [token]);

  return { finalize, loading, error };
}
