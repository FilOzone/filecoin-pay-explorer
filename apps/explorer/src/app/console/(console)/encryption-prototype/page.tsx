"use client";
// PROTOTYPE, throwaway. Console encryption views (variant D, chosen), with ?state=full|empty|fresh-browser for the edge states.
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PrototypeSwitcher } from "@/components/shared/PrototypeSwitcher";
import type { SeedState } from "@/components/UserConsole/EncryptionPrototype/mock-data";
import VariantD from "@/components/UserConsole/EncryptionPrototype/VariantD";

function Prototype() {
  const raw = useSearchParams().get("state");
  const state: SeedState = raw === "empty" || raw === "fresh-browser" ? raw : "full";
  return (
    <>
      <VariantD key={state} state={state} />
      <PrototypeSwitcher />
    </>
  );
}

export default function EncryptionPrototypePage() {
  return (
    <Suspense>
      <Prototype />
    </Suspense>
  );
}
