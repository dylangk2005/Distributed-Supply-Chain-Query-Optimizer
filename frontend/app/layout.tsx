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
              <Link href="/">One-Page Demo</Link>
            </div>
          </nav>
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
