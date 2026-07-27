import type { ReactNode } from "react";

import { RecoveryErrorBoundary } from "./RecoveryErrorBoundary.js";

interface DiffErrorBoundaryProps {
  readonly children: ReactNode;
  readonly onRecover: () => void;
}

export const DiffErrorBoundary = ({ children, onRecover }: DiffErrorBoundaryProps) => (
  <RecoveryErrorBoundary
    title="diff를 표시할 수 없습니다"
    message="현재 파일의 diff 영역을 다시 열어 주세요."
    actionLabel="diff 다시 열기"
    onRecover={onRecover}
  >
    {children}
  </RecoveryErrorBoundary>
);
