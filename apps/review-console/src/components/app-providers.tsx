"use client";

import { AuthProvider } from "@unified/auth-client/react";
import { ToastProvider } from "@unified/ui";
import type { ReactNode } from "react";

export function AppProviders({ children }: { children: ReactNode }) {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiBaseUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is required");
  }

  return (
    <AuthProvider apiBaseUrl={apiBaseUrl}>
      <ToastProvider>{children}</ToastProvider>
    </AuthProvider>
  );
}
