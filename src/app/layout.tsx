import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://lessio.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "LESSIO",
  title: {
    default: "LESSIO — תשתית עסקית למורים פרטיים ומרכזי למידה",
    template: "%s · LESSIO",
  },
  description:
    "מערכת אחת שמרכזת תיאום, ביטולים, גבייה ותקשורת עם הורים. ההורים נשארים ב-WhatsApp — בלי כאוס תפעולי.",
  openGraph: {
    type: "website",
    siteName: "LESSIO",
    title: "LESSIO — תשתית עסקית למורים פרטיים ומרכזי למידה",
    description:
      "מערכת אחת שמרכזת תיאום, ביטולים, גבייה ותקשורת עם הורים. ההורים נשארים ב-WhatsApp — בלי כאוס תפעולי.",
    url: "/",
    locale: "he_IL",
  },
  twitter: {
    card: "summary_large_image",
    title: "LESSIO — תשתית עסקית למורים פרטיים",
    description: "כל השוטף במקום אחד. ההורים נשארים ב-WhatsApp.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d9488",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const dir = locale === "he" ? "rtl" : "ltr";

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden flex flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <Toaster position="bottom-center" richColors />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
