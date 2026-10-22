import type { Metadata } from "next";
import { googleLoginEnabled } from "@/auth";
import { LoginCard } from "./LoginCard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "כניסה · יועץ הרכב של שטראוס" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  return (
    <LoginCard
      enabled={googleLoginEnabled()}
      // רק נתיב בתוך האתר, כדי שקישור זדוני לא ישלח את העובד לאתר אחר אחרי הכניסה
      callbackUrl={callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/"}
      error={error}
      openToAll={!process.env.ALLOWED_EMAILS?.trim()}
    />
  );
}
