import { Component, type ErrorInfo, type ReactNode } from "react";

interface RecoveryErrorBoundaryProps {
  readonly children: ReactNode;
  readonly title: string;
  readonly message: string;
  readonly actionLabel: string;
  readonly onRecover: () => void;
}

interface RecoveryErrorBoundaryState {
  readonly hasError: boolean;
}

export class RecoveryErrorBoundary extends Component<
  RecoveryErrorBoundaryProps,
  RecoveryErrorBoundaryState
> {
  override state: RecoveryErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): RecoveryErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("The Prettifer renderer could not display the workspace.", error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <section role="alert">
          <h2>{this.props.title}</h2>
          <p>{this.props.message}</p>
          <button type="button" onClick={this.handleRecover}>
            {this.props.actionLabel}
          </button>
        </section>
      );
    }
    return this.props.children;
  }

  private readonly handleRecover = (): void => {
    this.props.onRecover();
    this.setState({ hasError: false });
  };
}
