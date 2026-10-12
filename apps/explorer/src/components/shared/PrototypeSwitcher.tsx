"use client";
// PROTOTYPE, throwaway. Floating ?state= switcher. Renders nothing in production.
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const STATES = ["full", "empty", "fresh-browser"];

export function PrototypeSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const state = params.get("state") ?? "full";

  if (process.env.NODE_ENV === "production") return null;
  const set = (value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("state", value);
    router.replace(`${pathname}?${next.toString()}`);
  };
  return (
    <div className='fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-black px-2 py-1.5 text-sm text-white shadow-xl ring-2 ring-white/40'>
      {STATES.map((s) => (
        <button
          key={s}
          type='button'
          onClick={() => set(s)}
          className={`rounded-full px-3 py-0.5 text-xs hover:bg-white/20 ${s === state ? "bg-white text-black hover:bg-white" : ""}`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
