import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center bg-background text-foreground">
          <p className="text-4xl mb-4">⚠️</p>
          <h1 className="text-lg font-bold mb-2">Something went wrong</h1>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs">
            {this.state.error.message}
          </p>
          <button
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
