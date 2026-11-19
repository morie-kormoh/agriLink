import type { Metadata } from "next";
import { devFixedOtp, isDemoMode } from "@/server/auth/otp";
import { PERSONAS } from "@/server/demo/personas";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <LoginForm
      next={next ?? null}
      showDevHint={process.env.NODE_ENV !== "production"}
      demoCode={isDemoMode() ? devFixedOtp() : null}
      personas={
        isDemoMode()
          ? PERSONAS.map(({ key, name, description }) => ({ key, name, description }))
          : null
      }
    />
  );
}
