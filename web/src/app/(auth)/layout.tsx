import type { ReactNode } from "react";

import { APP_CONFIG } from "@/config/app-config";

import styles from "./auth.module.css";

export default function AuthLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className={styles.frame}>
      <header className={styles.rail}>
        <span className={styles.mark} aria-hidden="true" />
        <span className={styles.wordmark}>{APP_CONFIG.name}</span>
      </header>
      <main className={styles.main}>
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}
