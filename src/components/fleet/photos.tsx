"use client";
import { useConfirm } from "@/components/confirmation-provider";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { useRef, useState } from "react";
import Image from "next/image";
import { useAction, useMutation, useQuery } from "convex/react";
import { ImagePlus } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useI18n } from "@/i18n/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localizedLabel, MAX_PHOTO_BYTES, type FleetLabels } from "@/lib/fleet";
import { FleetFeedback, fleetError, type VehicleRecord } from "./shared";
export function PhotoGallery({
  agencyId,
  record,
  canManage,
}: {
  agencyId: Id<"agencies">;
  record: VehicleRecord;
  canManage: boolean;
}) {
  const confirm = useConfirm();
  const {
    locale,
    messages: { fleet: m },
  } = useI18n();
  const photos = useQuery(api.fleetPhotos.list, {
    agencyId,
    vehicleId: record.id,
  });
  const begin = useMutation(api.fleetPhotos.begin);
  const upload = useAction(api.photoUpload.upload);
  const edit = useMutation(api.fleetPhotos.edit);
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alt, setAlt] = useState<FleetLabels>({ en: "", fr: "", ar: "" });
  const [editing, setEditing] = useState<Id<"vehicleImages"> | null>(null);
  const [editRevision, setEditRevision] = useState(record.revision);
  async function send(file: File) {
    setError(null);
    if (!alt.en.trim() && !alt.fr.trim() && !alt.ar.trim()) {
      setError(m.photoAltRequired);
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError(m.photoInvalid);
      return;
    }
    setPending(true);
    try {
      const intentId = await begin({ agencyId, vehicleId: record.id });
      await upload({ intentId, bytes: await file.arrayBuffer(), alt });
      setAlt({ en: "", fr: "", ar: "" });
    } catch (e) {
      setError(fleetError(e, m));
    } finally {
      setPending(false);
      if (input.current) input.current.value = "";
    }
  }
  async function change(
    imageId: Id<"vehicleImages">,
    move: "none" | "first" | "up" | "down" | "remove",
    description: FleetLabels,
  ) {
    if (
      move === "remove" &&
      !(await confirm(m.removeConfirm, {
        title: m.remove,
        actionLabel: m.remove,
        destructive: true,
      }))
    )
      return;
    setPending(true);
    setError(null);
    try {
      await edit({
        agencyId,
        vehicleId: record.id,
        expectedRevision: move === "none" ? editRevision : record.revision,
        imageId,
        move,
        alt: description,
      });
      if (move === "none") {
        setEditing(null);
        setAlt({ en: "", fr: "", ar: "" });
      }
    } catch (e) {
      setError(fleetError(e, m));
    } finally {
      setPending(false);
    }
  }
  return (
    <Card className="settings-card">
      <div className="settings-card-heading">
        <h3>{m.photos}</h3>
        <p>{m.photoHint}</p>
      </div>
      <FleetFeedback
        error={error}
        onReload={() => {
          const latest = photos?.find((photo) => photo.id === editing);
          if (latest) setAlt(latest.alt);
          else {
            setEditing(null);
            setAlt({ en: "", fr: "", ar: "" });
          }
          setEditRevision(record.revision);
          setError(null);
        }}
      />
      {photos?.length === 0 && (
        <div className="fleet-photo-empty">
          <ImagePlus aria-hidden className="size-8" />
          <p>{m.noPhotos}</p>
        </div>
      )}
      <div className="fleet-gallery">
        {photos?.map((photo, i) => (
          <figure key={photo.id}>
            <div className="fleet-photo">
              <Image
                src={photo.url}
                alt={localizedLabel(photo.alt, locale)}
                fill
                unoptimized
                sizes="(max-width: 640px) 100vw, 33vw"
                className="object-cover"
              />
            </div>
            <figcaption>
              {i === 0 && <span className="fleet-badge">{m.primary}</span>}
              <p>{localizedLabel(photo.alt, locale)}</p>
              {canManage && (
                <div className="fleet-photo-actions">
                  <Button
                    variant="ghost"
                    disabled={pending || i === 0}
                    onClick={() => void change(photo.id, "first", photo.alt)}
                  >
                    {m.makePrimary}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={pending || i === 0}
                    onClick={() => void change(photo.id, "up", photo.alt)}
                  >
                    {m.moveUp}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={pending || i === photos.length - 1}
                    onClick={() => void change(photo.id, "down", photo.alt)}
                  >
                    {m.moveDown}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      setEditing(photo.id);
                      setAlt(photo.alt);
                      setEditRevision(record.revision);
                    }}
                  >
                    {m.editAlt}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => void change(photo.id, "remove", photo.alt)}
                  >
                    {m.remove}
                  </Button>
                </div>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
      {canManage && (
        <div className="fleet-stack">
          <div className="settings-fields">
            {(["en", "fr", "ar"] as const).map((language, i) => (
              <Field className="fleet-field" key={language}>
                <Label htmlFor={`photo-alt-${language}`}>
                  {[m.altEn, m.altFr, m.altAr][i]}
                </Label>
                <Input
                  id={`photo-alt-${language}`}
                  dir={language === "ar" ? "rtl" : "ltr"}
                  maxLength={160}
                  value={alt[language]}
                  disabled={pending}
                  onChange={(e) =>
                    setAlt({ ...alt, [language]: e.target.value })
                  }
                />
              </Field>
            ))}
          </div>
          <div className="fleet-actions">
            {editing ? (
              <>
                <Button
                  disabled={pending}
                  onClick={() => void change(editing, "none", alt)}
                >
                  {m.save}
                </Button>
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    setEditing(null);
                    setAlt({ en: "", fr: "", ar: "" });
                  }}
                >
                  {m.cancel}
                </Button>
              </>
            ) : (
              <>
                <Input
                  ref={input}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  tabIndex={-1}
                  aria-label={m.upload}
                  disabled={pending}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void send(file);
                  }}
                />
                <Button
                  variant="outline"
                  disabled={pending || (photos?.length ?? 0) >= 12}
                  onClick={() => input.current?.click()}
                >
                  {pending ? m.uploading : m.upload}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
