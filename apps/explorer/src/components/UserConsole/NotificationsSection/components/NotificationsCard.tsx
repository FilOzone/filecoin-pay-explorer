"use client";
import { Card } from "@filecoin-pay/ui/components/card";
import type { ReactNode } from "react";

export const NotificationsCard = ({ children }: { children: ReactNode }) => (
  <Card className='mx-auto max-w-md p-6'>{children}</Card>
);
