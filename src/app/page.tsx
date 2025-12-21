import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <div className={styles.logoContainer}>
          <img src="/logo.png" alt="PhotoBooze" className={styles.logo} />
        </div>        
        <div className={styles.links}>
          <Link href="/admin" className={styles.link}>
            Host a Party
          </Link>
        </div>
      </main>
    </div>
  );
}
