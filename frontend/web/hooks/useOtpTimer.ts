"use client";

/**
 * Countdown timer hook for the OTP resend button.
 *
 * Counts down from `initialSeconds` to 0 once started, then stops.
 * The caller can restart the timer (e.g. after a successful resend) by calling
 * `restart()`.
 *
 * Usage:
 *   const { secondsLeft, isActive, restart } = useOtpTimer(60);
 */

import { useCallback, useEffect, useRef, useState } from "react";

export function useOtpTimer(initialSeconds: number): {
  /** Remaining seconds. 0 when the timer has elapsed. */
  secondsLeft: number;
  /** True while the countdown is running. */
  isActive: boolean;
  /** Restart the countdown from `initialSeconds`. */
  restart: () => void;
} {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const [isActive, setIsActive] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    setSecondsLeft(initialSeconds);
    setIsActive(true);

    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearTimer();
          setIsActive(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [initialSeconds, clearTimer]);

  // Start on mount.
  useEffect(() => {
    startTimer();
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restart = useCallback(() => {
    startTimer();
  }, [startTimer]);

  return { secondsLeft, isActive, restart };
}
