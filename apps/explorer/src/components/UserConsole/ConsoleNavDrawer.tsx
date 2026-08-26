"use client";
import { Button } from "@filecoin-pay/ui/components/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@filecoin-pay/ui/components/sheet";
import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConsoleSidebar } from "@/components/UserConsole/ConsoleSidebar";

export const ConsoleNavDrawer = () => {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const previousPathnameRef = useRef(pathname);

  const closeDrawer = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Back/forward (including the mobile edge-swipe gesture) changes the route
  // without any click of ours to react to, and the console layout persists
  // across those navigations, so the drawer would stay open over the new page.
  useEffect(() => {
    if (previousPathnameRef.current === pathname) {
      return;
    }

    previousPathnameRef.current = pathname;
    setIsOpen(false);
  }, [pathname]);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant='ghost' size='icon' aria-label='Open console navigation'>
          <Menu className='size-6' />
        </Button>
      </SheetTrigger>

      <SheetContent side='right' className='w-64 px-6 py-16 text-foreground'>
        <SheetTitle className='sr-only'>Console navigation</SheetTitle>
        <ConsoleSidebar onNavigate={closeDrawer} />
      </SheetContent>
    </Sheet>
  );
};
