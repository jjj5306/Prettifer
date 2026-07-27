import type { ReactNode } from "react";

import { RecoveryErrorBoundary } from "./RecoveryErrorBoundary.js";

interface AppErrorBoundaryProps {
  readonly children: ReactNode;
  readonly onRecover: () => void;
}

export const AppErrorBoundary = ({ children, onRecover }: AppErrorBoundaryProps) => (
  <RecoveryErrorBoundary
    title="앱 화면을 표시할 수 없습니다"
    message="화면을 다시 열어 현재 저장소 상태를 복구해 주세요."
    actionLabel="앱 화면 다시 열기"
    onRecover={onRecover}
  >
    {children}
  </RecoveryErrorBoundary>
);
