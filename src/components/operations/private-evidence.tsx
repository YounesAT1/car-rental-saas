"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { Download, FileLock2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { operationsApi, type PrivateOwner } from "@/lib/operations-api";

export function PrivateEvidence({
  agencyId,
  vehicleId,
  owner,
  expectedRevision,
  canManage,
}: {
  agencyId: Id<"agencies">;
  vehicleId: Id<"vehicles">;
  owner: PrivateOwner;
  expectedRevision: number;
  canManage: boolean;
}) {
  const {
    locale,
    messages: { operations: m },
  } = useI18n();
  const { getToken } = useAuth();
  const begin = useMutation(operationsApi.privateFiles.begin);
  const files = useQuery(operationsApi.privateFiles.list, {
    agencyId,
    vehicleId,
    owner,
  });
  const [file, setFile] = useState<File | null>(null);
  const [intentId, setIntentId] = useState<Id<"privateUploadIntents"> | null>(
    null,
  );
  const intent = useQuery(
    operationsApi.privateFiles.status,
    intentId ? { intentId } : "skip",
  );
  const [selectedFileId, setSelectedFileId] = useState<Id<"files"> | null>(
    null,
  );
  const manifest = useQuery(
    operationsApi.privateFiles.manifest,
    selectedFileId ? { agencyId, fileId: selectedFileId } : "skip",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const siteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;

  async function upload() {
    if (!file || !siteUrl || file.size > 3 * 1024 * 1024) {
      setError(m.uploadFailed);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const nextIntent = await begin({
        agencyId,
        vehicleId,
        owner,
        expectedRevision,
      });
      setIntentId(nextIntent);
      const token = await getToken({ template: "convex" });
      if (!token) throw new Error("AUTH_REQUIRED");
      const response = await fetch(
        `${siteUrl}/private-files/upload/${nextIntent}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        },
      );
      if (!response.ok) throw new Error("PRIVATE_FILE_INVALID");
      setFile(null);
      if (input.current) input.current.value = "";
    } catch {
      setError(m.uploadFailed);
    } finally {
      setPending(false);
    }
  }

  async function download(
    fileId: Id<"files">,
    pageId: Id<"privateFilePages">,
    position: number,
  ) {
    if (!siteUrl) return setError(m.failed);
    try {
      const token = await getToken({ template: "convex" });
      if (!token) throw new Error("AUTH_REQUIRED");
      const response = await fetch(
        `${siteUrl}/private-files/download/${fileId}/${pageId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) throw new Error("DOWNLOAD_FAILED");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `evidence-page-${position + 1}.webp`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch {
      setError(m.failed);
    }
  }

  return (
    <Card className="operations-form-card">
      <div className="settings-card-heading">
        <h2>{m.evidence}</h2>
        <p>{m.evidenceHint}</p>
      </div>
      <div className="operations-file-list">
        {files?.map((stored) => (
          <Button
            key={stored.id}
            type="button"
            variant={selectedFileId === stored.id ? "secondary" : "outline"}
            onClick={() => setSelectedFileId(stored.id)}
          >
            <FileLock2 className="size-4" aria-hidden />
            {m.recorded.replace(
              "{date}",
              new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
                stored.recordedAt,
              ),
            )}
          </Button>
        ))}
      </div>
      {selectedFileId && manifest && (
        <div className="operations-pages">
          {manifest.map((page) => (
            <Button
              key={page.id}
              type="button"
              variant="ghost"
              onClick={() =>
                void download(selectedFileId, page.id, page.position)
              }
            >
              <Download className="size-4" aria-hidden />
              {m.page.replace("{page}", String(page.position + 1))}
            </Button>
          ))}
        </div>
      )}
      {canManage && (
        <div className="operations-evidence-upload">
          <Field>
            <Label htmlFor={`private-file-${owner.kind}-${owner.id}`}>
              {m.chooseFile}
            </Label>
            <Input
              ref={input}
              id={`private-file-${owner.kind}-${owner.id}`}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </Field>
          <Button
            type="button"
            disabled={pending || !file}
            onClick={() => void upload()}
          >
            <Upload className="size-4" aria-hidden />
            {pending ? m.uploading : m.upload}
          </Button>
        </div>
      )}
      {intent && (
        <p className="operations-upload-status" role="status">
          {intent.status === "done"
            ? m.saved
            : intent.status === "failed"
              ? m.uploadFailed
              : m.uploading}
        </p>
      )}
      {error && (
        <p className="operations-feedback" role="alert">
          {error}
        </p>
      )}
    </Card>
  );
}
