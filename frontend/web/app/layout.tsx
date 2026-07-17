import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SmartHealth Hub",
    template: "%s | SmartHealth Hub",
  },
  description:
    "Integrated Health Care Information Management System for Barangay Health Centers with NFC ID Card and SMS Notification Services",
  keywords: ["health", "barangay", "Philippines", "health center", "NFC", "SMS"],
};

interface RootLayoutProps {
  children: React.ReactNode;
}

/**
 * Root layout — wraps the entire application.
 * Global CSS (Tailwind v4 + design tokens) is imported here.
 */
export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body>
        {children}
      </body>
    </html>
  );
}
