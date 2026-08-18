import type { ReactNode } from "react";
import { Navigation } from "@/components/shared";

type ExplorerLayoutProps = Readonly<{ children: ReactNode }>;

export default function ExplorerLayout({ children }: ExplorerLayoutProps) {
  return (
    <>
      <Navigation backgroundVariant='light' />
      {children}
    </>
  );
}
