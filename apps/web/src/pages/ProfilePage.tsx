import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, User, Shield, Star, PlusCircle, ChevronRight, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/store/auth.store";
import { useUiStore } from "@/store/ui.store";
import { authApi } from "@/api/auth.api";
import type { User as UserType } from "@priceradar/shared";

const ROLE_LABELS: Record<string, string> = {
  guest: "Гость",
  user: "Пользователь",
  trusted: "Проверенный",
  moderator: "Модератор",
  admin: "Администратор",
};

const ROLE_COLORS: Record<string, "default" | "secondary" | "success" | "warning"> = {
  guest: "secondary",
  user: "default",
  trusted: "success",
  moderator: "warning",
  admin: "warning",
};

function TrustBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Рейтинг доверия</span>
        <span className="font-medium text-foreground">{score} / 100</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user: cachedUser, isAuthenticated, logout } = useAuthStore();
  const { theme, toggleTheme } = useUiStore();
  const [user, setUser] = useState<UserType | null>(cachedUser);
  const [loading, setLoading] = useState(isAuthenticated && !cachedUser);

  useEffect(() => {
    if (!isAuthenticated) return;
    authApi.me()
      .then((u) => setUser(u))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  const handleLogout = async () => {
    try { await authApi.logout(); } catch { /* ignore */ }
    logout();
    navigate("/");
  };

  if (!isAuthenticated) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 flex flex-col items-center gap-4 text-center">
        <p className="text-5xl mb-2">👤</p>
        <h1 className="text-xl font-bold">Профиль</h1>
        <p className="text-sm text-muted-foreground">Войдите, чтобы видеть свой профиль и историю добавленных цен</p>
        <div className="flex gap-3 mt-2">
          <Button variant="outline" onClick={() => navigate("/login")}>Войти</Button>
          <Button onClick={() => navigate("/register")}>Зарегистрироваться</Button>
        </div>

        {/* Theme toggle even for guests */}
        <div className="mt-8 w-full rounded-xl border bg-card p-4 space-y-3 text-left">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Настройки</p>
          <button
            className="w-full flex items-center justify-between py-2 hover:text-foreground text-sm"
            onClick={toggleTheme}
          >
            <span className="flex items-center gap-3">
              {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              Тема
            </span>
            <span className="text-muted-foreground">{theme === "dark" ? "Тёмная" : "Светлая"}</span>
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        <div className="flex items-center gap-4 p-4 rounded-xl border bg-card">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
      {/* User card */}
      <div className="rounded-xl border bg-card p-4 flex items-center gap-4">
        {user?.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <User className="h-8 w-8 text-primary" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-lg truncate">{user?.displayName}</p>
          <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
          <Badge variant={ROLE_COLORS[user?.role ?? "user"]} className="mt-1 text-xs">
            {ROLE_LABELS[user?.role ?? "user"]}
          </Badge>
        </div>
      </div>

      {/* Trust score */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-amber-400" />
          <span className="font-medium text-sm">Рейтинг</span>
        </div>
        <TrustBar score={user?.trustScore ?? 0} />
        <p className="text-xs text-muted-foreground">
          Рейтинг растёт, когда ваши цены одобряются модераторами
        </p>
      </div>

      {/* Actions */}
      <div className="rounded-xl border bg-card divide-y divide-border overflow-hidden">
        <button
          className="w-full flex items-center gap-3 p-4 hover:bg-accent/30 transition-colors text-left text-sm"
          onClick={() => navigate("/add-price")}
        >
          <PlusCircle className="h-4 w-4 text-primary" />
          <span className="flex-1">Добавить цену</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>

        {(user?.role === "moderator" || user?.role === "admin") && (
          <button
            className="w-full flex items-center gap-3 p-4 hover:bg-accent/30 transition-colors text-left text-sm"
            onClick={() => navigate("/moderation")}
          >
            <Shield className="h-4 w-4 text-amber-400" />
            <span className="flex-1">Модерация</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Settings */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Настройки</p>
        <button
          className="w-full flex items-center justify-between py-1 text-sm"
          onClick={toggleTheme}
        >
          <span className="flex items-center gap-3">
            {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            Тема
          </span>
          <span className="text-muted-foreground">{theme === "dark" ? "Тёмная" : "Светлая"}</span>
        </button>
      </div>

      {/* Account info */}
      {user?.createdAt && (
        <p className="text-xs text-muted-foreground text-center">
          Аккаунт создан {new Date(user.createdAt).toLocaleDateString("ru", { year: "numeric", month: "long", day: "numeric" })}
        </p>
      )}

      {/* Logout */}
      <Button variant="destructive" className="w-full gap-2" onClick={handleLogout}>
        <LogOut className="h-4 w-4" />
        Выйти из аккаунта
      </Button>
    </div>
  );
}
