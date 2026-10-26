import type { Metadata } from "next";
import "@fontsource/lexend/400.css";
import "@fontsource/lexend/500.css";
import "@fontsource/lexend/600.css";
import "@fontsource/noto-sans-bengali/400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "RelayDesk | Your business, ready to reply.",
    template: "%s | RelayDesk",
  },
  description:
    "A thoughtful home for your business conversations. Products, policies, and helpful replies across your customer channels.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
