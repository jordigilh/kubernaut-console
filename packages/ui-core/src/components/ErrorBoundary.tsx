import { Component, type ReactNode } from "react";
import { EmptyState, EmptyStateBody, EmptyStateFooter, EmptyStateActions, Button } from "@patternfly/react-core";
import { ExclamationCircleIcon } from "@patternfly/react-icons";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("[ErrorBoundary]", error, info.componentStack);
    if (navigator.sendBeacon) {
      const payload = JSON.stringify({
        message: error.message,
        stack: error.stack?.slice(0, 1024),
        component: info.componentStack?.slice(0, 512),
        url: window.location.href,
        ts: Date.now(),
      });
      navigator.sendBeacon("/a2a/telemetry/error", payload);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <EmptyState
          headingLevel="h2"
          icon={ExclamationCircleIcon}
          titleText="Something went wrong"
          status="danger"
        >
          <EmptyStateBody>
            {this.state.error?.message || "An unexpected error occurred."}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={this.handleReset}>
                Try Again
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      );
    }
    return this.props.children;
  }
}
