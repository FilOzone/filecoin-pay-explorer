import { LayoutDashboard, ShieldCheck } from "lucide-react";

export type ConsoleTab = "dashboard" | "authorizations";

const navItems = [
  { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
  { id: "authorizations" as const, label: "Authorizations", icon: ShieldCheck },
];

interface ConsoleSidebarProps {
  activeTab: ConsoleTab;
  onTabChange: (tab: ConsoleTab) => void;
}

export function ConsoleSidebar({ activeTab, onTabChange }: ConsoleSidebarProps) {
  return (
    <aside className='sticky top-6 self-start w-48 shrink-0 border-r border-zinc-100 pr-4'>
      <nav className='flex flex-col gap-0.5'>
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type='button'
            onClick={() => onTabChange(id)}
            className={`group flex items-center gap-3 py-2 text-sm transition-colors text-left w-full ${
              activeTab === id
                ? "border-l-2 border-zinc-800 pl-3 text-zinc-900 font-medium"
                : "border-l-2 border-transparent pl-3 text-zinc-400 hover:text-zinc-600"
            }`}
          >
            <Icon className='size-4 shrink-0' />
            {label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
