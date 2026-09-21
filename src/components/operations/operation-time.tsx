"use client";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/i18n/client";
import { localOffsets } from "@/lib/operations";

export function OperationTime({
  prefix,
  label,
  value,
  onChange,
  offset,
  setOffset,
  timezone,
}: {
  prefix: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  offset: string;
  setOffset: (value: string) => void;
  timezone: string;
}) {
  const {
    locale,
    messages: { operations: m },
  } = useI18n();
  const offsets = localOffsets(value, timezone);
  return (
    <Field>
      <Label htmlFor={prefix}>{label}</Label>
      <Input
        id={prefix}
        type="datetime-local"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOffset("");
        }}
      />
      {offsets.length > 1 && (
        <Select
          value={offset}
          onValueChange={setOffset}
          dir={locale === "ar" ? "rtl" : "ltr"}
        >
          <SelectTrigger
            aria-label={`${label}: ${m.offset}`}
            className="w-full min-h-11"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {offsets.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Field>
  );
}
