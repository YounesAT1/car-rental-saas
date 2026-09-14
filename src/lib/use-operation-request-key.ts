"use client";

import { useMemo } from "react";

export function useOperationRequestKey(fingerprint: string) {
  return useMemo(() => {
    void fingerprint;
    return crypto.randomUUID();
  }, [fingerprint]);
}
