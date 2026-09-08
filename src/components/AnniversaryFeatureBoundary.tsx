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

export class AnniversaryFeatureBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[anniversary:${this.props.name}]`, error, info.componentStack);
    reportLovableError(error, {
      boundary: "anniversary_feature_boundary",
      anniversaryFeature: this.props.name,
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
