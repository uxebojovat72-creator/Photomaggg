import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center bg-background text-foreground">
          <p className="text-4xl mb-4">⚠️</p>
          <h1 className="text-lg font-bold mb-2">Произошла ошибка</h1>
          <p className="text-sm text-muted-foreground mb-4 max-w-xs">
            {this.state.error.message}
          </p>
          {this.state.componentStack && (
            <pre className="text-left text-[10px] text-muted-foreground bg-muted rounded-lg p-3 mb-6 max-w-sm overflow-auto max-h-40 w-full">
              {this.state.componentStack.trim()}
            </pre>
          )}
          <button
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
            onClick={() => window.location.reload()}
          >
            Перезагрузить
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
