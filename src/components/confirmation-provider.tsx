"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useI18n } from "@/i18n/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";

type ConfirmationOptions = {
  title?: string;
  actionLabel?: string;
  destructive?: boolean;
};
type Confirm = (
  description: string,
  options?: ConfirmationOptions,
) => Promise<boolean>;
const ConfirmationContext = createContext<Confirm | null>(null);

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const { locale, messages } = useI18n();
  const [request, setRequest] = useState<
    (ConfirmationOptions & { description: string }) | null
  >(null);
  const [open, setOpen] = useState(false);
  const resolveRef = useRef<((accepted: boolean) => void) | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const confirm = useCallback<Confirm>((description, options = {}) => {
    // A second click must not leave an earlier caller waiting indefinitely.
    resolveRef.current?.(false);
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setRequest({ description, ...options });
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);
  const finish = useCallback((accepted: boolean) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setOpen(false);
    resolve?.(accepted);
  }, []);
  useEffect(
    () => () => {
      resolveRef.current?.(false);
    },
    [],
  );
  return (
    <ConfirmationContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) finish(false);
        }}
      >
        <AlertDialogContent
          dir={locale === "ar" ? "rtl" : "ltr"}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocus.current?.isConnected) returnFocus.current.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {request?.title ?? messages.confirmation.title}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {request?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => finish(false)}>
              {messages.settings.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({
                variant: request?.destructive ? "destructive" : "default",
                className: "min-h-11",
              })}
              onClick={() => finish(true)}
            >
              {request?.actionLabel ?? messages.confirmation.continue}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmationContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmationContext);
  if (!confirm) throw new Error("useConfirm requires ConfirmationProvider");
  return confirm;
}
