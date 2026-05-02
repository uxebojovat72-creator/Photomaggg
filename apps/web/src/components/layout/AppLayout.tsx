import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { TopBar } from "./TopBar";
import { useUiStore } from "@/store/ui.store";

export function AppLayout() {
  const theme = useUiStore((s) => s.theme);
  document.documentElement.classList.toggle("dark", theme === "dark");

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <TopBar />
      <main className="flex-1 pb-20 overflow-y-auto">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
