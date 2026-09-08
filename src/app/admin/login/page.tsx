import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { isAuthenticated } from "@/lib/admin-auth";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isAuthenticated()) redirect("/admin");

  return (
    <div className="container-page py-20 md:py-28">
      <div className="mx-auto max-w-sm">
        <h1 className="font-display text-3xl leading-none">Studio sign in</h1>
        <p className="mt-3 text-sm text-muted">
          For Dimitur only. Clients don&apos;t need this page.
        </p>
        <LoginForm />
      </div>
    </div>
  );
}
