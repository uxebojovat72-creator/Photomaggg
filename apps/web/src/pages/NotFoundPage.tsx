import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
      <p className="text-6xl">🔍</p>
      <h1 className="text-2xl font-bold">Страница не найдена</h1>
      <p className="text-muted-foreground text-center">
        Такой страницы не существует.
      </p>
      <Button asChild>
        <Link to="/">На главную</Link>
      </Button>
    </div>
  );
}
