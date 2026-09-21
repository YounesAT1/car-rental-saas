"use client";

import type { Doc } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
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
import { decimalToMinor, minorToDecimal } from "@/lib/agency-settings";
import { costTotal } from "@/lib/operations";

type CostLine = Doc<"maintenanceRecords">["costLines"][number];
export type CostDraft = {
  key: string;
  kind: CostLine["kind"];
  description: string;
  amount: string;
};
export function costDraft(lines: CostLine[], currency: string): CostDraft[] {
  return lines.map((line) => ({
    key: crypto.randomUUID(),
    kind: line.kind,
    description: line.description,
    amount: minorToDecimal(line.amountMinor, currency),
  }));
}
export function parseCostDraft(
  lines: CostDraft[],
  currency: string,
): CostLine[] {
  const result = lines.map((line) => ({
    kind: line.kind,
    description: line.description.trim(),
    amountMinor: decimalToMinor(line.amount, currency),
  }));
  if (
    result.some((line) => !line.description || line.description.length > 200) ||
    result.length > 100
  )
    throw new Error("OPERATIONS_INVALID");
  costTotal(result);
  return result;
}
export function CostLines({
  prefix,
  currency,
  value,
  onChange,
  disabled = false,
}: {
  prefix: string;
  currency: string;
  value: CostDraft[];
  onChange: (lines: CostDraft[]) => void;
  disabled?: boolean;
}) {
  const {
    locale,
    messages: { operations: m },
  } = useI18n();
  const update = (key: string, patch: Partial<CostDraft>) =>
    onChange(
      value.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  return (
    <fieldset className="operations-cost-lines" disabled={disabled}>
      <legend>
        {m.costLines} · <bdi>{currency}</bdi>
      </legend>
      {value.map((line, index) => (
        <div className="operations-cost-line" key={line.key}>
          <Field>
            <Label htmlFor={`${prefix}-kind-${index}`}>{m.costKind}</Label>
            <Select
              value={line.kind}
              onValueChange={(kind) =>
                update(line.key, { kind: kind as CostLine["kind"] })
              }
              dir={locale === "ar" ? "rtl" : "ltr"}
            >
              <SelectTrigger
                id={`${prefix}-kind-${index}`}
                className="w-full min-h-11"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="parts">{m.parts}</SelectItem>
                <SelectItem value="labor">{m.labor}</SelectItem>
                <SelectItem value="other">{m.otherCost}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <Label htmlFor={`${prefix}-description-${index}`}>
              {m.costDescription}
            </Label>
            <Input
              id={`${prefix}-description-${index}`}
              required
              maxLength={200}
              value={line.description}
              onChange={(event) =>
                update(line.key, { description: event.target.value })
              }
            />
          </Field>
          <Field>
            <Label htmlFor={`${prefix}-amount-${index}`}>
              {m.amount} ({currency})
            </Label>
            <Input
              id={`${prefix}-amount-${index}`}
              inputMode="decimal"
              required
              value={line.amount}
              onChange={(event) =>
                update(line.key, { amount: event.target.value })
              }
            />
          </Field>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            aria-label={m.removeCostLine.replace("{line}", String(index + 1))}
            onClick={() =>
              onChange(value.filter((item) => item.key !== line.key))
            }
          >
            {m.removeCostLine.replace("{line}", String(index + 1))}
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={disabled || value.length >= 100}
        className="min-h-11"
        onClick={() =>
          onChange([
            ...value,
            {
              key: crypto.randomUUID(),
              kind: "parts",
              description: "",
              amount: "",
            },
          ])
        }
      >
        {m.addCostLine}
      </Button>
    </fieldset>
  );
}
