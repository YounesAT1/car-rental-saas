"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
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
import {
  InputGroup,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const roles = [
  "AGENCY_ADMIN",
  "MANAGER",
  "RENTAL_AGENT",
  "FLEET_MANAGER",
  "MAINTENANCE_MANAGER",
  "ACCOUNTANT",
  "EMPLOYEE",
  "READ_ONLY",
] as const;

type InviteFormValues = {
  email: string;
  roleKey: (typeof roles)[number];
};

export function InviteMemberForm({ agencyId }: { agencyId: Id<"agencies"> }) {
  const { messages } = useI18n();
  const createInvitation = useMutation(api.identity.createInvitation);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const form = useForm<InviteFormValues>({
    resolver: zodResolver(
      z.object({
        email: z.string().trim().email(messages.workspace.validation.email),
        roleKey: z.enum(roles, { error: messages.workspace.validation.role }),
      }),
    ),
    defaultValues: { email: "", roleKey: "EMPLOYEE" },
  });

  useEffect(() => {
    return () => {
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
    };
  }, []);

  async function submit(values: InviteFormValues) {
    setIsSending(true);
    setError(null);
    setLink(null);
    setCopied(false);
    try {
      const result = await createInvitation({
        agencyId,
        email: values.email,
        roleKey: values.roleKey,
        requestKey: crypto.randomUUID(),
      });
      if (result.token) {
        setLink(
          `${window.location.origin}/invitations/accept?token=${result.token}`,
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "INVITATION_CREATE_FAILED",
      );
    } finally {
      setIsSending(false);
    }
  }

  async function copyInvitationLink() {
    if (!link) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        const input = document.getElementById(
          "invitation-link",
        ) as HTMLInputElement | null;
        if (!input) throw new Error("INVITATION_LINK_NOT_FOUND");
        input.focus();
        input.select();
        if (!document.execCommand("copy")) {
          throw new Error("INVITATION_COPY_FAILED");
        }
      }
      setCopied(true);
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
      copyTimeout.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(messages.workspace.copyError);
    }
  }

  return (
    <Card className="invite-card" aria-labelledby="invite-title">
      <div>
        <p className="eyebrow">{messages.workspace.role}</p>
        <h2 id="invite-title">{messages.workspace.inviteTitle}</h2>
        <p>{messages.workspace.inviteDescription}</p>
      </div>
      <Form {...form}>
        <form
          noValidate
          onSubmit={form.handleSubmit(submit)}
          className="invite-form"
        >
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{messages.workspace.inviteEmail}</FormLabel>
                <FormControl>
                  <Input type="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="roleKey"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{messages.workspace.inviteRole}</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={messages.workspace.inviteRole}
                      />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role.replaceAll("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="submit"
            className="workspace-submit"
            disabled={isSending}
          >
            {isSending
              ? messages.workspace.inviteSending
              : messages.workspace.inviteSend}
          </Button>
        </form>
      </Form>
      {link && (
        <div className="invite-result" role="status">
          <p>{messages.workspace.inviteCreated}</p>
          <div className="invite-result-field">
            <Label htmlFor="invitation-link">
              {messages.workspace.inviteLink}
            </Label>
            <InputGroup className="invite-link-input-group">
              <InputGroupInput
                id="invitation-link"
                readOnly
                value={link}
                onFocus={(event) => event.currentTarget.select()}
              />
              <InputGroupButton
                size="icon-sm"
                className="invite-copy-button"
                onClick={() => void copyInvitationLink()}
                aria-label={
                  copied
                    ? messages.workspace.invitationLinkCopied
                    : messages.workspace.copyInvitationLink
                }
                title={
                  copied
                    ? messages.workspace.invitationLinkCopied
                    : messages.workspace.copyInvitationLink
                }
              >
                {copied ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Copy aria-hidden="true" />
                )}
              </InputGroupButton>
            </InputGroup>
          </div>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Card>
  );
}
