import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import "./globals.css";
import ToastContainer from "@/components/ui/toast-container";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const dmSerifDisplay = DM_Serif_Display({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-dm-serif",
  display: "swap",
  preload: false,
});

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
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth" className={`${dmSans.variable} ${dmSerifDisplay.variable}`}>
      <head />
      <body>
        {children}
        <ToastContainer />
      </body>
    </html>
  );
}
