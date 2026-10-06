"use client";
import { Suspense } from "react";
import AccessGroupsSection from "@/components/UserConsole/AccessGroupsSection";

/**
 * MOCK route — Access groups POC (encryption group model, PRD rev 2026-10-06).
 * Entirely fabricated data; see the section component's header comment.
 * Suspense: the section reads ?group= via useSearchParams, which Next requires
 * to render inside a Suspense boundary.
 */
const AccessPage = () => (
  <Suspense fallback={null}>
    <AccessGroupsSection />
  </Suspense>
);

export default AccessPage;
