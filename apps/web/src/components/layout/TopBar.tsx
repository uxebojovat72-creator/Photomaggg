import { Link, useNavigate } from "react-router-dom";
import { Search, Bell, Moon, Sun, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/store/ui.store";
import { useAuthStore } from "@/store/auth.store";

export function TopBar() {
  const { theme, toggleTheme } = useUiStore();
  const { isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
      <div className="flex h-14 items-center px-4 gap-3">
        <Link to="/" className="flex items-center gap-2 mr-auto">
          <span className="text-xl font-bold text-primary">📡 PriceRadar</span>
        </Link>

        <Button variant="ghost" size="icon" onClick={() => navigate("/search")}>
          <Search className="h-5 w-5" />
        </Button>

        {isAuthenticated && (
          <Button variant="ghost" size="icon" onClick={() => navigate("/notifications")}>
            <Bell className="h-5 w-5" />
          </Button>
        )}

        <Button variant="ghost" size="icon" onClick={toggleTheme}>
          {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(isAuthenticated ? "/profile" : "/login")}
        >
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
          ) : (
            <User className="h-5 w-5" />
          )}
        </Button>
      </div>
    </header>
  );
}
