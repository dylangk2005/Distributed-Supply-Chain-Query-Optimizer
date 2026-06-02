import Link from "next/link";
import "./globals.css";

export const metadata = {
  title: "Distributed Supply Chain Graph Query Optimizer",
  description: "Distributed graph query optimizer demo"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <nav className="nav">
            <Link href="/" className="brand">Distributed Supply Chain Graph Query Optimizer</Link>
            <div className="links">
              <a href="/#prepare-data">1. Prepare</a>
              <a href="/#material-directory">2. Directory</a>
              <a href="/#query-lab">3. Query</a>
              <a href="/#execution-plan">4. Plan</a>
              <a href="/#benchmark">5. Benchmark</a>
              <a href="/#topology">6. Topology</a>
            </div>
          </nav>
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
