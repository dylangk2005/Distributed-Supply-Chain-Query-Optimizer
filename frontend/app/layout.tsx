import Link from "next/link";
import "./globals.css";

// Metadata hiển thị trên browser tab và SEO cơ bản của Next.js.
export const metadata = {
  title: "Distributed Supply Chain Graph Query Optimizer",
  description: "Distributed graph query optimizer demo"
};

// Root layout bọc toàn bộ app: top navigation + vùng content.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <nav className="nav">
            <Link href="/" className="brand">Distributed Supply Chain Graph Query Optimizer</Link>
            {/* Anchor links giúp demo theo đúng thứ tự 6 phần trên dashboard. */}
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
