import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Warmailer",
  description: "Outbound email operations for multiple client workspaces.",
};

// Runs before first paint so a stored dark theme never flashes light on reload.
const themeScript = `(function(){try{var t=localStorage.getItem("wm-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){document.documentElement.setAttribute("data-theme","light")}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
