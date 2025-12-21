import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>PhotoBooze</h1>
        <p className={styles.description}>
          Party photo sharing with QR code guest access
        </p>
        <div className={styles.links}>
          <Link href="/admin" className={styles.link}>
            Host a Party
          </Link>
        </div>
      </main>
    </div>
  );
}
