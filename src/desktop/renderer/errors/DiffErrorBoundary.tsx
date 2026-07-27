import type { ReactNode } from "react";

import { RecoveryErrorBoundary } from "./RecoveryErrorBoundary.js";

interface DiffErrorBoundaryProps {
  readonly children: ReactNode;
  readonly onRecover: () => void;
}

export const DiffErrorBoundary = ({ children, onRecover }: DiffErrorBoundaryProps) => (
  <RecoveryErrorBoundary
    title="The diff could not be displayed"
    message="Reload the diff area for the current file."
    actionLabel="Reload Diff"
    onRecover={onRecover}
  >
    {children}
  </RecoveryErrorBoundary>
);
