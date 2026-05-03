import { NavLink } from "react-router-dom";
import { Home, Search, PlusCircle, BarChart2, User } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", icon: Home, label: "Главная" },
  { to: "/search", icon: Search, label: "Поиск" },
  { to: "/add-price", icon: PlusCircle, label: "Добавить", primary: true },
  { to: "/analytics", icon: BarChart2, label: "Аналитика" },
  { to: "/profile", icon: User, label: "Профиль" },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/90 backdrop-blur-sm safe-area-pb">
      <div className="flex h-16 items-center justify-around px-2">
        {navItems.map(({ to, icon: Icon, label, primary }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors min-w-[56px]",
                primary
                  ? "bg-primary text-primary-foreground rounded-xl px-4 py-2 -mt-4 shadow-lg"
                  : isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )
            }
          >
            <Icon className={cn("h-5 w-5", primary && "h-6 w-6")} />
            <span className="text-[10px] font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
