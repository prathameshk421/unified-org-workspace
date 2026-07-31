"use client";

import { useMemo, useState } from "react";
import { Button } from "./button";

export type DateRangeValue = { from: string; to: string };

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function dateFromIso(value: string): Date | null {
  const [year, month, day] = value.split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
}

function preset(days: number): DateRangeValue {
  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - days);
  return { from: isoDate(from), to: isoDate(today) };
}

export function DateRangePicker({
  value,
  onChange,
  id = "date-range",
}: {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => dateFromIso(value.from) ?? new Date());
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return Array.from({ length: first.getDay() + count }, (_, index) =>
      index < first.getDay() ? null : new Date(month.getFullYear(), month.getMonth(), index - first.getDay() + 1),
    );
  }, [month]);

  function choose(day: Date) {
    const selected = isoDate(day);
    if (!value.from || (value.from && value.to)) {
      onChange({ from: selected, to: "" });
    } else if (selected < value.from) {
      onChange({ from: selected, to: value.from });
    } else {
      onChange({ from: value.from, to: selected });
      setOpen(false);
    }
  }

  const formatted = value.from
    ? `${new Date(`${value.from}T00:00:00`).toLocaleDateString()}${value.to ? ` – ${new Date(`${value.to}T00:00:00`).toLocaleDateString()}` : " — select end date"}`
    : "Select a date range";

  return (
    <div className="relative">
      <Button
        id={id}
        type="button"
        variant="tertiary"
        className="w-full justify-between rounded-lg bg-surface-raised px-3 py-2.5 text-left font-normal"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {formatted}
        <span aria-hidden="true">▾</span>
      </Button>
      {open ? (
        <div className="absolute z-50 mt-2 w-[20rem] rounded-xl border border-border bg-surface-raised p-3 shadow-lg">
          <div className="mb-3 flex flex-wrap gap-1.5">
            <Button type="button" size="sm" variant="tertiary" onClick={() => onChange(preset(0))}>Today</Button>
            <Button type="button" size="sm" variant="tertiary" onClick={() => onChange(preset(6))}>Last 7 days</Button>
            <Button type="button" size="sm" variant="tertiary" onClick={() => onChange(preset(29))}>Last 30 days</Button>
            <Button type="button" size="sm" variant="tertiary" onClick={() => onChange({ from: "", to: "" })}>Clear</Button>
          </div>
          <div className="mb-2 flex items-center justify-between">
            <Button type="button" size="sm" variant="tertiary" aria-label="Previous month" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}>‹</Button>
            <p className="font-sans text-sm font-medium text-foreground">{month.toLocaleString(undefined, { month: "long", year: "numeric" })}</p>
            <Button type="button" size="sm" variant="tertiary" aria-label="Next month" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}>›</Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center font-sans text-xs">
            {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <span key={`${day}-${index}`} className="py-1 text-muted">{day}</span>)}
            {days.map((day, index) =>
              day ? (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => choose(day)}
                  className={`rounded-md py-1.5 transition-colors hover:bg-brand-100 ${
                    isoDate(day) === value.from || isoDate(day) === value.to ? "bg-brand-600 text-white hover:bg-brand-700" : "text-foreground"
                  }`}
                >
                  {day.getDate()}
                </button>
              ) : <span key={`empty-${index}`} />,
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
