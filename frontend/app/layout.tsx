import Link from "next/link";
import "./globals.css";

export const metadata = {
  title: "Supply Chain Map",
  description: "Distributed graph query optimizer demo"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <nav className="nav">
            <Link href="/" className="brand">Supply Chain Map</Link>
            <div className="links">
              <Link href="/demo">Demo</Link>
              <Link href="/query">Query</Link>
              <Link href="/execution-plan">Execution Plan</Link>
              <Link href="/benchmark">Benchmark</Link>
              <Link href="/topology">Topology</Link>
            </div>
          </nav>
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
