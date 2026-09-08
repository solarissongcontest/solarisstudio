import { Component, type ErrorInfo, type ReactNode } from "react";

import { reportLovableError } from "@/lib/lovable-error-reporting";

type Props = {
  children: ReactNode;
  name: string;
  fallback?: ReactNode;
};

type State = {
  failed: boolean;
};

/**
 * Organizer chrome is helpful, but it must never be able to lock an organizer
 * out of the actual page. Keep non-essential shell features isolated so a
 * failed selector, health strip, navigation helper, etc. can disappear while
 * the underlying admin workflow remains usable.
 */
export class AdminFeatureBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[admin:${this.props.name}]`, error, info.componentStack);
    reportLovableError(error, {
      boundary: "admin_feature_boundary",
      adminFeature: this.props.name,
      componentStack: info.componentStack,
    });
  }

  componentDidUpdate(previous: Props) {
    if (this.state.failed && previous.name !== this.props.name) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (this.state.failed) return this.props.fallback ?? null;
    return this.props.children;
  }
}
