"use client";

import { useEffect } from "react";
import { useConfirm } from "@/components/confirmation-provider";
import { useFormContext } from "react-hook-form";
import { Check, LoaderCircle } from "lucide-react";
import { ConvexError } from "convex/values";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CommonMessages } from "@/i18n/messages";

export function SettingsField({
  name,
  label,
  hint,
  type = "text",
  multiline = false,
  options,
  dir,
  maxLength,
  inputMode,
  min,
  max,
}: {
  name: string;
  label: string;
  hint?: string;
  type?: "text" | "email" | "tel" | "number" | "date";
  multiline?: boolean;
  options?: { value: string; label: string }[];
  dir?: "ltr" | "rtl";
  maxLength?: number;
  inputMode?: "decimal" | "numeric";
  min?: number;
  max?: number;
}) {
  const { control } = useFormContext();
  const { locale, messages } = useI18n();
  const description = [
    hint,
    min !== undefined && max !== undefined
      ? messages.settings.range
          .replace("{min}", new Intl.NumberFormat(locale).format(min))
          .replace("{max}", new Intl.NumberFormat(locale).format(max))
      : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          {options ? (
            <Select
              value={field.value}
              onValueChange={field.onChange}
              dir={locale === "ar" ? "rtl" : "ltr"}
            >
              <FormControl>
                <SelectTrigger
                  className="w-full min-w-0 min-h-11 shadow-none"
                  onBlur={field.onBlur}
                  ref={field.ref}
                >
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent position="popper">
                {options.map((o) => (
                  <SelectItem
                    key={o.value}
                    value={o.value}
                    className="min-h-11"
                  >
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <FormControl>
              {multiline ? (
                <Textarea {...field} dir={dir} rows={5} maxLength={maxLength} />
              ) : (
                <Input
                  {...field}
                  type={type}
                  dir={dir}
                  maxLength={maxLength}
                  inputMode={inputMode}
                  min={min}
                  max={max}
                  value={field.value ?? ""}
                  onChange={(e) =>
                    field.onChange(
                      type === "number"
                        ? e.target.value === ""
                          ? ""
                          : e.target.valueAsNumber
                        : e.target.value,
                    )
                  }
                />
              )}
            </FormControl>
          )}
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function useUnsavedChanges(dirty: boolean) {
  const { messages } = useI18n();
  const confirm = useConfirm();
  useEffect(() => {
    if (!dirty) return;
    let bypass = false;
    let disposed = false;
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    const confirmLink = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest?.<HTMLAnchorElement>(
        "a[href]",
      );
      if (
        bypass ||
        !anchor ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self") ||
        event.button !== 0
      )
        return;
      if (anchor.getAttribute("href")?.startsWith("#")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void confirm(messages.settings.unsaved, {
        actionLabel: messages.confirmation.discard,
      }).then((accepted) => {
        if (!accepted || disposed || !anchor.isConnected) return;
        // Replay the original link so Next.js and ordinary links keep their behavior.
        window.removeEventListener("beforeunload", beforeUnload);
        bypass = true;
        try {
          anchor.click();
        } finally {
          bypass = false;
        }
      });
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", confirmLink, true);
    return () => {
      disposed = true;
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", confirmLink, true);
    };
  }, [
    dirty,
    confirm,
    messages.settings.unsaved,
    messages.confirmation.discard,
  ]);
}

export function settingsError(error: unknown, m: CommonMessages["settings"]) {
  const code =
    error instanceof ConvexError
      ? String(error.data)
      : error instanceof Error
        ? error.message
        : "";
  if (code.includes("SETTINGS_CONFLICT")) return m.errors.conflict;
  if (code.includes("BRANCH_CODE_TAKEN")) return m.errors.code;
  if (code.includes("BRANCH_LIMIT")) return m.errors.limit;
  if (code.includes("BRANCH_ARCHIVED") || code.includes("BRANCH_NOT_FOUND"))
    return m.errors.archived;
  if (/DENIED|UNAUTHENTICATED|DISABLED/.test(code)) return m.errors.denied;
  if (code.includes("INVALID_SETTINGS")) return m.errors.invalid;
  return m.errors.generic;
}

export function SaveFooter({
  pending,
  dirty,
  error,
  saved,
  label,
  onReset,
  onCancel,
}: {
  pending: boolean;
  dirty: boolean;
  error?: string | null;
  saved?: boolean;
  label?: string;
  onReset?: () => void;
  onCancel?: () => void;
}) {
  const {
    messages: { settings: m },
  } = useI18n();
  return (
    <div className="settings-save">
      <div className="min-w-0 flex-1">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {saved && !dirty && (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-primary"
          >
            <Check className="size-4" aria-hidden />
            {m.saved}
          </p>
        )}
        {error && onReset && (
          <Button
            type="button"
            variant="link"
            onClick={onReset}
            className="h-auto min-h-11 px-0 whitespace-normal text-start"
          >
            {m.reload}
          </Button>
        )}
      </div>
      {onCancel && (
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={pending}
          className="h-11"
        >
          {m.cancel}
        </Button>
      )}
      <Button
        type="submit"
        disabled={pending || !dirty}
        className="h-11 rounded-full px-6"
      >
        {pending && (
          <LoaderCircle
            className="size-4 animate-spin motion-reduce:animate-none"
            aria-hidden
          />
        )}
        {pending ? m.saving : (label ?? m.save)}
      </Button>
    </div>
  );
}
