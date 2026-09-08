import { SignUp } from "@clerk/nextjs";
import { safeReturnPath } from "@/lib/auth-redirect";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
}) {
  const destination = safeReturnPath((await searchParams).redirect_url);
  return (
    <div className="auth-page">
      <SignUp
        forceRedirectUrl={destination}
        signInForceRedirectUrl={destination}
        signInUrl={`/sign-in?${new URLSearchParams({ redirect_url: destination })}`}
      />
    </div>
  );
}
