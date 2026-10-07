"use client";

import { useRadixLayerCloseGuard } from "@filecoin-pay/ui/hooks/use-radix-layer-close-guard";
import { cn } from "@filecoin-pay/ui/lib/utils";
import {
  Description,
  DialogBackdrop,
  DialogPanel,
  Dialog as HeadlessDialog,
  DialogTitle as HeadlessDialogTitle,
} from "@headlessui/react";
import { Slot } from "@radix-ui/react-slot";
import { XIcon } from "lucide-react";
import * as React from "react";

type DialogContextValue = { open: boolean; onOpenChange: (open: boolean) => void };

const DialogContext = React.createContext<DialogContextValue | null>(null);

function useDialogContext() {
  const context = React.useContext(DialogContext);
  if (!context) throw new Error("Dialog parts must be rendered inside <Dialog>");
  return context;
}

function Dialog({ open, onOpenChange, children }: React.PropsWithChildren<DialogContextValue>) {
  return <DialogContext value={{ open, onOpenChange }}>{children}</DialogContext>;
}

type ButtonProps = React.ComponentProps<"button"> & { asChild?: boolean };

function DialogTrigger({ asChild, onClick, ...props }: ButtonProps) {
  const { onOpenChange } = useDialogContext();
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot='dialog-trigger'
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event);
        onOpenChange(true);
      }}
      {...props}
    />
  );
}

function DialogClose({ asChild, onClick, ...props }: ButtonProps) {
  const { onOpenChange } = useDialogContext();
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot='dialog-close'
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event);
        onOpenChange(false);
      }}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: Omit<React.ComponentProps<"div">, "ref"> & {
  showCloseButton?: boolean;
}) {
  const { open, onOpenChange } = useDialogContext();
  const onClose = useRadixLayerCloseGuard(() => onOpenChange(false));
  return (
    <HeadlessDialog open={open} onClose={onClose} className='relative z-50'>
      <DialogBackdrop
        transition
        data-slot='dialog-overlay'
        className='fixed inset-0 bg-black/50 transition-opacity duration-200 data-[closed]:opacity-0'
      />
      <DialogPanel
        transition
        data-slot='dialog-content'
        className={cn(
          "bg-card text-card-foreground fixed top-[50%] left-[50%] grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg transition duration-200 data-[closed]:scale-95 data-[closed]:opacity-0 sm:max-w-lg",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogClose className="ring-offset-background focus:ring-ring absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
            <XIcon />
            <span className='sr-only'>Close</span>
          </DialogClose>
        )}
      </DialogPanel>
    </HeadlessDialog>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot='dialog-header'
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot='dialog-footer'
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: Omit<React.ComponentProps<"h2">, "ref">) {
  return (
    <HeadlessDialogTitle
      data-slot='dialog-title'
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: Omit<React.ComponentProps<"p">, "ref">) {
  return (
    <Description data-slot='dialog-description' className={cn("text-muted-foreground text-sm", className)} {...props} />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
