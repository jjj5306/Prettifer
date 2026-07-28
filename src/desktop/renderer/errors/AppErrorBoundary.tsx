import type { ReactNode } from "react";

import { RecoveryErrorBoundary } from "./RecoveryErrorBoundary.js";

interface AppErrorBoundaryProps {
  readonly children: ReactNode;
  readonly onRecover: () => void;
}

export const AppErrorBoundary = ({ children, onRecover }: AppErrorBoundaryProps) => (
  <RecoveryErrorBoundary
    title="The app could not be displayed"
    message="Reload the workspace to restore the current repository state."
    actionLabel="Reload Workspace"
    onRecover={onRecover}
  >
    {children}
  </RecoveryErrorBoundary>
);
