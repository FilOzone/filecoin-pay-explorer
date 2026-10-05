"use client";

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

type SheetContextValue = { open: boolean; onOpenChange: (open: boolean) => void };

const SheetContext = React.createContext<SheetContextValue | null>(null);

function useSheetContext() {
  const context = React.useContext(SheetContext);
  if (!context) throw new Error("Sheet parts must be rendered inside <Sheet>");
  return context;
}

function Sheet({ open, onOpenChange, children }: React.PropsWithChildren<SheetContextValue>) {
  return <SheetContext value={{ open, onOpenChange }}>{children}</SheetContext>;
}

type ButtonProps = React.ComponentProps<"button"> & { asChild?: boolean };

function SheetTrigger({ asChild, onClick, ...props }: ButtonProps) {
  const { onOpenChange } = useSheetContext();
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot='sheet-trigger'
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event);
        onOpenChange(true);
      }}
      {...props}
    />
  );
}

function SheetClose({ asChild, onClick, ...props }: ButtonProps) {
  const { onOpenChange } = useSheetContext();
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot='sheet-close'
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event);
        onOpenChange(false);
      }}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "right",
  ...props
}: Omit<React.ComponentProps<"div">, "ref"> & {
  side?: "top" | "right" | "bottom" | "left";
}) {
  const { open, onOpenChange } = useSheetContext();
  return (
    <HeadlessDialog open={open} onClose={() => onOpenChange(false)} className='relative z-50'>
      <DialogBackdrop
        transition
        data-slot='sheet-overlay'
        className='fixed inset-0 bg-black/50 transition-opacity duration-200 data-[closed]:opacity-0'
      />
      <DialogPanel
        transition
        data-slot='sheet-content'
        className={cn(
          "bg-background fixed flex flex-col gap-4 shadow-lg transition ease-in-out duration-500 data-[closed]:duration-300",
          side === "right" && "data-[closed]:translate-x-full inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm",
          side === "left" && "data-[closed]:-translate-x-full inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm",
          side === "top" && "data-[closed]:-translate-y-full inset-x-0 top-0 h-auto border-b",
          side === "bottom" && "data-[closed]:translate-y-full inset-x-0 bottom-0 h-auto border-t",
          className,
        )}
        {...props}
      >
        {children}
        <SheetClose className='ring-offset-background focus:ring-ring absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none'>
          <XIcon className='size-4' />
          <span className='sr-only'>Close</span>
        </SheetClose>
      </DialogPanel>
    </HeadlessDialog>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot='sheet-header' className={cn("flex flex-col gap-1.5 p-4", className)} {...props} />;
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot='sheet-footer' className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />;
}

function SheetTitle({ className, ...props }: Omit<React.ComponentProps<"h2">, "ref">) {
  return (
    <HeadlessDialogTitle
      data-slot='sheet-title'
      className={cn("text-foreground font-semibold", className)}
      {...props}
    />
  );
}

function SheetDescription({ className, ...props }: Omit<React.ComponentProps<"p">, "ref">) {
  return (
    <Description data-slot='sheet-description' className={cn("text-muted-foreground text-sm", className)} {...props} />
  );
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger };
