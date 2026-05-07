import type { ReactNode } from "react";
import React from "react";

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: unknown, info: { componentStack?: string }) => void;
};

type State = { hasError: boolean };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    const componentStack = (info as any)?.componentStack as string | undefined;
    this.props.onError?.(error, { componentStack });
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" }}>
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>Something went wrong</div>
            <div style={{ color: "rgba(15,23,42,0.70)", marginBottom: 14 }}>Try refreshing. If this keeps happening, contact support.</div>
            <button onClick={() => window.location.reload()} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(15,23,42,0.12)", background: "#fff", fontWeight: 800, cursor: "pointer" }}>
              Refresh
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

