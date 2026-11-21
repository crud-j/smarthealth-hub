"use client";

import { BellRing, CalendarCheck, MessageSquareReply, TrendingDown, TrendingUp } from "lucide-react";
import type { ReminderEffect, ReminderGroup } from "@/types/dashboard";
import { EmptyRow, Panel, TONE, text } from "./shared";
import type { Tone } from "./shared";

/**
 * Return rate after SMS reminders: finished appointments with vs without a
 * reminder SMS, and how many of each the patient came to. Counts only.
 */

function windowDays(data: ReminderEffect): number {
  const ms = Date.parse(`${data.to_date}T00:00:00Z`) - Date.parse(`${data.from_date}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

function GroupRow({ label, group, tone }: { label: string; group: ReminderGroup; tone: Tone }) {
  const pct = group.came_pct;
  return (
    <div role="group" aria-label={label}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={`text-sm font-semibold ${text.ink}`}>{label}</span>
        {pct === null ? (
          <span className={`text-xs font-medium ${text.muted}`}>Not enough data yet</span>
        ) : (
          <span className={`font-display text-2xl leading-none ${text.ink}`}>
            {Math.round(pct)}%<span className={`ml-1 font-sans text-xs ${text.muted}`}>came</span>
          </span>
        )}
      </div>
      {pct !== null && (
        <div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
          <div className={`h-full rounded-full ${TONE[tone].bar}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
        </div>
      )}
      <p className={`mt-1 text-xs ${text.muted}`}>
        {group.came} of {group.total} came
      </p>
    </div>
  );
}

function Difference({ points, minGroup }: { points: number | null; minGroup: number }) {
  if (points === null) {
    return (
      <p className={`text-xs ${text.muted}`}>
        Percentages appear once a group has at least {minGroup} finished appointments.
      </p>
    );
  }
  const rounded = Math.round(Math.abs(points));
  if (rounded === 0) {
    return <p className={`text-sm font-medium ${text.ink}`}>About the same with or without a reminder.</p>;
  }
  const higher = points > 0;
  const Icon = higher ? TrendingUp : TrendingDown;
  return (
    <p className={`inline-flex items-center gap-1.5 text-sm font-semibold ${higher ? "text-teal-700" : "text-amber-800"}`}>
      <Icon size={16} aria-hidden="true" />
      {rounded} points {higher ? "higher" : "lower"} with a reminder
    </p>
  );
}

/** The figures themselves; used inside the dashboard panel and the Analytics card. */
export function ReminderEffectSummary({ data }: { data: ReminderEffect }) {
  const { with_reminder: withReminder, without_reminder: withoutReminder } = data;

  if (withReminder.total + withoutReminder.total === 0) {
    return (
      <ul role="list">
        <EmptyRow icon={CalendarCheck} hint="Appointments count once they are completed or marked missed.">
          No finished appointments in this period yet.
        </EmptyRow>
      </ul>
    );
  }

  return (
    <div className="space-y-4">
      <GroupRow label="With reminder" group={withReminder} tone="teal" />
      <GroupRow label="Without reminder" group={withoutReminder} tone="slate" />
      <div className="space-y-1.5 border-t border-[#f1e6e0] pt-3">
        <Difference points={data.difference_points} minGroup={data.min_group_size} />
        {data.confirmed_by_reply > 0 && (
          <p className={`flex items-center gap-1.5 text-sm ${text.ink}`}>
            <MessageSquareReply size={15} className="text-sky-600" aria-hidden="true" />
            {data.confirmed_by_reply} confirmed by replying CONFIRM
          </p>
        )}
        <p className={`text-xs ${text.muted}`}>
          Came = marked completed, or a visit was logged that day. Without a reminder = no SMS sent
          before the appointment (booked late, no number, opted out, or the SMS failed).
        </p>
      </div>
    </div>
  );
}

/** Dashboard panel (BHW and Admin). */
export function ReminderEffectPanel({ data, index = 10 }: { data: ReminderEffect; index?: number }) {
  return (
    <Panel
      title={`SMS reminders · last ${windowDays(data)} days`}
      icon={BellRing}
      tone="teal"
      href="/analytics"
      linkLabel="Analytics"
      className="mb-6"
      index={index}
    >
      <div className="px-5 py-4">
        <ReminderEffectSummary data={data} />
      </div>
    </Panel>
  );
}
