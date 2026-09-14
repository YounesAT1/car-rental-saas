"use client";

import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Plus, X } from "lucide-react";
import { useI18n } from "@/i18n/client";
import type { BranchValues } from "@/lib/agency-settings";
import { Button } from "@/components/ui/button";
import { SettingsField } from "./form-fields";

function DayHours({ index }: { index: number }) {
  const {
    locale,
    messages: { settings: m },
  } = useI18n();
  const { control, getFieldState, formState } = useFormContext<BranchValues>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: `hours.${index}.intervals`,
  });
  const intervals = useWatch({ control, name: `hours.${index}.intervals` });
  const day = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    timeZone: "UTC",
  }).format(Date.UTC(2024, 0, 7 + index));
  const error = getFieldState(`hours.${index}.intervals`, formState).error;
  function add() {
    const opens = intervals.at(-1)?.closes ?? "09:00";
    append({
      opens,
      closes:
        opens >= "22:00"
          ? "24:00"
          : `${String(Number(opens.slice(0, 2)) + 2).padStart(2, "0")}:${opens.slice(3)}`,
    });
  }
  return (
    <div className="settings-day">
      <div className="settings-day-label">
        <span>{day}</span>
        {fields.length === 0 && <small>{m.closed}</small>}
      </div>
      <div className="settings-day-intervals">
        {fields.map((field, slot) => (
          <div key={field.id} className="settings-interval">
            <SettingsField
              name={`hours.${index}.intervals.${slot}.opens`}
              label={`${m.opens} · ${day} ${slot + 1}`}
              dir="ltr"
              maxLength={5}
            />
            <SettingsField
              name={`hours.${index}.intervals.${slot}.closes`}
              label={`${m.closes} · ${day} ${slot + 1}`}
              dir="ltr"
              maxLength={5}
            />
            <Button
              type="button"
              variant="ghost"
              className="size-11 shrink-0 self-start mt-7"
              onClick={() => remove(slot)}
              aria-label={`${m.removeInterval} · ${day} ${slot + 1}`}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        ))}
        {error?.message && (
          <p className="text-sm text-destructive" role="alert">
            {error.message}
          </p>
        )}
        {fields.length < 2 && intervals.at(-1)?.closes !== "24:00" && (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 justify-start text-muted-foreground"
            onClick={add}
            aria-label={`${m.addInterval} · ${day}`}
          >
            <Plus className="size-4" aria-hidden />
            {m.addInterval}
          </Button>
        )}
      </div>
    </div>
  );
}

export function HoursEditor() {
  const {
    messages: { settings: m },
  } = useI18n();
  const { control, formState } = useFormContext<BranchValues>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "closures",
  });
  return (
    <>
      <div className="settings-card-heading">
        <h3>{m.hours}</h3>
        <p>{m.hoursHint}</p>
      </div>
      <div className="settings-hours">
        {[1, 2, 3, 4, 5, 6, 0].map((day) => (
          <DayHours key={day} index={day} />
        ))}
      </div>
      <div className="settings-card-heading mt-8">
        <h3>{m.closures}</h3>
        <p>{m.closureHint}</p>
      </div>
      <div className="space-y-4">
        {fields.map((field, i) => (
          <div key={field.id} className="settings-closure">
            <SettingsField
              name={`closures.${i}.date`}
              label={`${m.date} ${i + 1}`}
              type="date"
              dir="ltr"
            />
            <SettingsField
              name={`closures.${i}.reason`}
              label={`${m.reason} ${i + 1}`}
              maxLength={160}
            />
            <Button
              type="button"
              variant="ghost"
              className="size-11 mt-7"
              onClick={() => remove(i)}
              aria-label={`${m.removeClosure} ${i + 1}`}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        ))}
        {formState.errors.closures?.root?.message && (
          <p role="alert" className="text-sm text-destructive">
            {formState.errors.closures.root.message}
          </p>
        )}
        {fields.length < 32 && (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 shadow-none"
            onClick={() => append({ date: "", reason: "" })}
          >
            <Plus className="size-4" aria-hidden />
            {m.addClosure}
          </Button>
        )}
      </div>
    </>
  );
}
