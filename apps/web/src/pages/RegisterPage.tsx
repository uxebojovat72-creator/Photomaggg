import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/store/auth.store";
import { authApi } from "@/api/auth.api";
import { toast } from "@/hooks/useToast";
import { Loader2 } from "lucide-react";

export default function RegisterPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({ email: "", password: "", displayName: "" });
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 8) {
      toast({ title: "Ошибка", description: "Пароль должен содержать минимум 8 символов", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const data = await authApi.register(form);
      setAuth(data.user, data.accessToken);
      toast({ title: "Добро пожаловать в PriceRadar!", description: "Ваш аккаунт создан." });
      navigate("/");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Ошибка регистрации";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-sm animate-slide-up">
        <CardHeader className="text-center">
          <div className="text-4xl mb-2">📡</div>
          <CardTitle className="text-2xl">Создать аккаунт</CardTitle>
          <p className="text-muted-foreground text-sm">Присоединяйтесь к мировому сообществу</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Имя</label>
              <Input
                placeholder="Ваше имя"
                value={form.displayName}
                onChange={set("displayName")}
                required
                minLength={2}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Эл. почта</label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={set("email")}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Пароль</label>
              <Input
                type="password"
                placeholder="Мин. 8 символов"
                value={form.password}
                onChange={set("password")}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Создать аккаунт
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Уже есть аккаунт?{" "}
            <Link to="/login" className="text-primary font-medium hover:underline">
              Войти
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
