import { Component, type ReactNode } from "react";
import { EmptyState, EmptyStateBody, EmptyStateFooter, EmptyStateActions, Button } from "@patternfly/react-core";
import { ExclamationCircleIcon } from "@patternfly/react-icons";
import { formatErrorBoundaryMessage, generateCorrelationId } from "../lib/error-boundary-policy";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  correlationId: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, correlationId: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, correlationId: generateCorrelationId() };
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
        correlationId: this.state.correlationId,
      });
      navigator.sendBeacon("/a2a/telemetry/error", payload);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, correlationId: null });
  };

  render() {
    if (this.state.hasError) {
      const isDev = import.meta.env.DEV;
      return (
        <EmptyState
          headingLevel="h2"
          icon={ExclamationCircleIcon}
          titleText="Something went wrong"
          status="danger"
        >
          <EmptyStateBody>
            {/* correlationId is always set alongside hasError by getDerivedStateFromError */}
            {formatErrorBoundaryMessage(this.state.error, this.state.correlationId as string, isDev)}
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
