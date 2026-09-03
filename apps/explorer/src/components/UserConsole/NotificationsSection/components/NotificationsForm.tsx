"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Input } from "@filecoin-foundation/ui-filecoin/Input";
import { Label } from "@filecoin-pay/ui/components/label";
import { Loader2, Lock } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { NotificationsCard } from "./NotificationsCard";

export interface NotificationsFormValues {
  preferredName: string;
  email: string;
}

interface NotificationsFormProps {
  isSubmitting?: boolean;
  submitError?: string | null;
  initialValues?: { preferredName?: string; email?: string };
  onSubmit: (values: NotificationsFormValues) => void;
  onCancel?: () => void;
}

function validateEmailFormat(email: string): string | null {
  if (email.length > 254) return "Email address too long";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Invalid email format";
  const local = email.slice(0, email.indexOf("@"));
  if (local.length > 64) return "Email local part too long";
  return null;
}

export const NotificationsForm = ({
  isSubmitting = false,
  submitError,
  initialValues,
  onSubmit,
  onCancel,
}: NotificationsFormProps) => {
  const [preferredName, setPreferredName] = useState(initialValues?.preferredName ?? "");
  const [email, setEmail] = useState(initialValues?.email ?? "");
  const [emailTouched, setEmailTouched] = useState(false);

  const trimmedName = preferredName.trim();
  const lowercaseEmail = email.toLowerCase();
  const emailError = email ? validateEmailFormat(lowercaseEmail) : null;
  const isValid = trimmedName.length >= 1 && trimmedName.length <= 100 && email.length > 0 && emailError === null;

  const handleEmailChange = (value: string) => {
    setEmail(value);
    setEmailTouched(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;
    onSubmit({ preferredName: trimmedName, email: lowercaseEmail });
  };

  return (
    <NotificationsCard>
      <form onSubmit={handleSubmit} className='flex flex-col gap-6'>
        <div className='grid gap-4'>
          <div className='grid gap-2'>
            <Label htmlFor='preferredName'>Preferred name</Label>
            <Input
              id='preferredName'
              placeholder='Your name'
              value={preferredName}
              onChange={setPreferredName}
              disabled={isSubmitting}
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='email'>Email address</Label>
            <Input
              id='email'
              type='email'
              placeholder='you@example.com'
              value={email}
              onChange={handleEmailChange}
              disabled={isSubmitting}
            />
            {emailTouched && emailError && <p className='text-sm text-destructive'>{emailError}</p>}
          </div>
        </div>

        <div className='flex items-start gap-2 text-sm text-muted-foreground'>
          <Lock className='mt-0.5 h-4 w-4 flex-shrink-0' />
          <p>
            You&apos;ll sign a message to confirm ownership of this wallet.
            <br />
            This won&apos;t cost gas.
          </p>
        </div>

        {submitError && <p className='text-sm text-destructive'>{submitError}</p>}

        <Button type='submit' variant='primary' disabled={!isValid || isSubmitting}>
          {isSubmitting ? (
            <span className='flex items-center gap-2'>
              <Loader2 className='h-4 w-4 animate-spin' />
              Confirm in wallet...
            </span>
          ) : (
            "Enable alerts"
          )}
        </Button>

        {onCancel && (
          <button
            type='button'
            onClick={onCancel}
            disabled={isSubmitting}
            className='text-sm text-muted-foreground hover:text-foreground disabled:opacity-50'
          >
            Cancel
          </button>
        )}
      </form>
    </NotificationsCard>
  );
};
