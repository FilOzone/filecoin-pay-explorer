"use client";
import { usePathname } from "next/navigation";
import { Navigation } from "@/components/shared";

export function ConditionalNavigation() {
  const pathname = usePathname();
  if (pathname?.startsWith("/console")) return null;
  return <Navigation backgroundVariant='light' />;
}
