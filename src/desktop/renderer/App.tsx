import { useState } from "react";

import { useAppController } from "./controller/use-app-controller.js";
import { DesktopWorkspace } from "./DesktopWorkspace.js";
import { AppErrorBoundary } from "./errors/AppErrorBoundary.js";
import styles from "./App.module.css";

export const App = () => {
  const [recoveryKey, setRecoveryKey] = useState(0);
  const controller = useAppController(window.prettifer);
  return (
    <main className={styles.app}>
      <AppErrorBoundary
        key={recoveryKey}
        onRecover={() => { setRecoveryKey((current) => current + 1); }}
      >
        <DesktopWorkspace controller={controller} />
      </AppErrorBoundary>
    </main>
  );
};
