import { describe, expect, it } from "vitest";
import {
  reminderLine,
  signInHeadline,
  signInLine,
  smsHeadline,
  smsLine,
  type SignInWindow,
  type SmsWindow,
} from "@/lib/reliability";

const sms = (over: Partial<SmsWindow> = {}): SmsWindow => ({
  sent: 0,
  failed: 0,
  stuck: 0,
  failure_percent: null,
  ...over,
});

const signIn = (over: Partial<SignInWindow> = {}): SignInWindow => ({
  successful: 0,
  failed_password: 0,
  failed_otp: 0,
  otp_sent: 0,
  otp_verified: 0,
  otp_success_percent: null,
  ...over,
});

describe("smsHeadline", () => {
  it("says when nothing was sent", () => {
    expect(smsHeadline(sms())).toBe("No SMS");
  });

  it("shows the failure percentage", () => {
    expect(smsHeadline(sms({ sent: 48, failed: 2, failure_percent: 4 }))).toBe("4% failed");
  });

  it("shows waiting messages when none finished yet", () => {
    expect(smsHeadline(sms({ stuck: 3 }))).toBe("3 waiting");
  });
});

describe("smsLine", () => {
  it("lists sent, failed and waiting with singular/plural", () => {
    expect(smsLine("24 h", sms({ sent: 1, failed: 2, stuck: 0 }))).toBe(
      "24 h: 1 sent · 2 failed",
    );
    expect(smsLine("7 days", sms({ sent: 10, failed: 0, stuck: 1 }))).toBe(
      "7 days: 10 sent · 0 failed · 1 waiting over 1 h",
    );
  });
});

describe("signInHeadline", () => {
  it("counts successful sign-ins", () => {
    expect(signInHeadline(signIn({ successful: 1 }))).toBe("1 sign-in");
    expect(signInHeadline(signIn({ successful: 12 }))).toBe("12 sign-ins");
  });
});

describe("signInLine", () => {
  it("lists failures and OTP success", () => {
    expect(
      signInLine(
        "24 h",
        signIn({ failed_password: 1, failed_otp: 3, otp_sent: 4, otp_verified: 3, otp_success_percent: 75 }),
      ),
    ).toBe("24 h: 1 wrong password · 3 wrong OTP codes · OTP success 75%");
  });

  it("leaves out OTP success when no OTP was sent", () => {
    expect(signInLine("7 days", signIn({ failed_password: 2 }))).toBe(
      "7 days: 2 wrong passwords · 0 wrong OTP codes",
    );
  });
});

describe("reminderLine", () => {
  it("describes a recorded run", () => {
    expect(
      reminderLine({ job: "appointment", last_run_at: "2026-11-20T07:00:00Z", queued: 2 }),
    ).toBe("Appointment (hourly): Nov 20, 3:00 PM · 2 SMS");
  });

  it("says when no run is recorded", () => {
    expect(reminderLine({ job: "immunization", last_run_at: null, queued: null })).toBe(
      "Immunization (daily 10 AM): not recorded yet",
    );
  });
});
