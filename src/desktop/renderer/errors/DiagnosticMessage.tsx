import type { Diagnostic } from "../../shared/index.js";

interface DiagnosticMessageProps {
  readonly diagnostic: Diagnostic;
  readonly className?: string | undefined;
}

export const DiagnosticMessage = ({
  diagnostic,
  className,
}: DiagnosticMessageProps) => (
  <p role="alert" className={className}>
    {diagnostic.subject === undefined ? null : <><strong>{diagnostic.subject}</strong>: </>}
    {diagnostic.message} {diagnostic.nextAction}
  </p>
);
