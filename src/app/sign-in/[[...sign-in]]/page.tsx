import { SignIn } from "@clerk/nextjs";
import { safeReturnPath } from "@/lib/auth-redirect";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
}) {
  const destination = safeReturnPath((await searchParams).redirect_url);
  return (
    <div className="auth-page">
      <SignIn
        forceRedirectUrl={destination}
        signUpForceRedirectUrl={destination}
        signUpUrl={`/sign-up?${new URLSearchParams({ redirect_url: destination })}`}
      />
    </div>
  );
}
