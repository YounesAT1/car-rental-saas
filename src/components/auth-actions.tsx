"use client";

import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";

export function AuthActions() {
  const { messages } = useI18n();
  return (
    <div className="auth-actions">
      <Show when="signed-out">
        <SignInButton
          mode="modal"
          forceRedirectUrl="/onboarding"
          fallbackRedirectUrl="/onboarding"
        >
          <Button
            type="button"
            variant="ghost"
            className="auth-link h-11 rounded-full px-3 text-xs max-[699px]:bg-primary max-[699px]:text-primary-foreground max-[699px]:hover:bg-primary/90 max-[699px]:hover:text-primary-foreground"
          >
            {messages.auth.signIn}
          </Button>
        </SignInButton>
        <SignUpButton
          mode="modal"
          forceRedirectUrl="/onboarding"
          fallbackRedirectUrl="/onboarding"
        >
          <Button
            type="button"
            className="auth-action-primary h-11 rounded-full text-xs"
          >
            {messages.auth.signUp}
          </Button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <UserButton
          userProfileMode="modal"
          appearance={{ elements: { avatarBox: "size-9" } }}
        />
      </Show>
    </div>
  );
}
