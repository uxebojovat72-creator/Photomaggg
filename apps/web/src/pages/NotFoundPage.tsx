import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
      <p className="text-6xl">🔍</p>
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-muted-foreground text-center">
        The page you're looking for doesn't exist.
      </p>
      <Button asChild>
        <Link to="/">Go Home</Link>
      </Button>
    </div>
  );
}
