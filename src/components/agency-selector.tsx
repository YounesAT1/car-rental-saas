"use client";

import { useMutation, useQuery } from "convex/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { api } from "../../convex/_generated/api";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

function slugFromName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type AgencyFormValues = {
  name: string;
  slug: string;
};

export function AgencySelector() {
  const { messages } = useI18n();
  const router = useRouter();
  const agencies = useQuery(api.identity.listAgencies);
  const createAgency = useMutation(api.identity.createAgency);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const form = useForm<AgencyFormValues>({
    resolver: zodResolver(
      z.object({
        name: z.string().trim().min(2, messages.workspace.validation.name),
        slug: z
          .string()
          .trim()
          .min(3, messages.workspace.validation.slug)
          .max(80, messages.workspace.validation.slug)
          .regex(/^[a-z0-9-]+$/, messages.workspace.validation.slug),
      }) as never,
    ) as unknown as Resolver<AgencyFormValues>,
    defaultValues: { name: "", slug: "" },
  });

  function updateName(value: string) {
    const currentName = form.getValues("name");
    const currentSlug = form.getValues("slug");
    form.setValue("name", value, { shouldDirty: true, shouldValidate: true });
    if (!currentSlug || currentSlug === slugFromName(currentName)) {
      form.setValue("slug", slugFromName(value), {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }

  async function submit(values: AgencyFormValues) {
    setError(null);
    setIsCreating(true);
    try {
      const workspace = await createAgency(values);
      router.push(`/app/${workspace.agency.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AGENCY_CREATE_FAILED");
    } finally {
      setIsCreating(false);
    }
  }

  if (agencies === undefined) {
    return (
      <p className="workspace-loading">{messages.workspace.workspaceLoading}</p>
    );
  }

  return (
    <div className="workspace-selection">
      {agencies.length > 0 && (
        <Card
          className="agency-list"
          aria-label={messages.workspace.selectTitle}
        >
          {agencies.map(({ agency, membership }) => (
            <Button
              key={agency.id}
              type="button"
              variant="ghost"
              className="agency-card h-auto min-h-20"
              onClick={() => router.push(`/app/${agency.id}`)}
            >
              <span className="agency-card-mark" aria-hidden="true">
                {agency.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="agency-card-copy">
                <strong>{agency.name}</strong>
                <span>{membership.roleKey.replaceAll("_", " ")}</span>
              </span>
              <span className="agency-card-arrow" aria-hidden="true">
                →
              </span>
            </Button>
          ))}
        </Card>
      )}

      <Form {...form}>
        <Card asChild className="agency-create-card">
          <form noValidate onSubmit={form.handleSubmit(submit)}>
            <div>
              <p className="eyebrow">{messages.workspace.owner}</p>
              <h2>{messages.workspace.createTitle}</h2>
              <p>{messages.workspace.createDescription}</p>
            </div>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{messages.workspace.agencyName}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      onChange={(event) => updateName(event.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{messages.workspace.agencySlug}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <Button
              type="submit"
              className="workspace-submit"
              disabled={isCreating}
            >
              {isCreating
                ? messages.workspace.creating
                : messages.workspace.create}
            </Button>
          </form>
        </Card>
      </Form>
    </div>
  );
}
