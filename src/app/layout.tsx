import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://lessio.app";

export async function generateMetadata(): Promise<Metadata> {
  // Must be a function, not a static object: the title, description and OG card
  // follow the request's locale, and a static export is evaluated once at build
  // time — which is how every English visitor used to get Hebrew metadata.
  const t = await getTranslations("meta");

  return {
    metadataBase: new URL(siteUrl),
    applicationName: "LESSIO",
    title: {
      default: t("title"),
      template: "%s · LESSIO",
    },
    description: t("description"),
    openGraph: {
      type: "website",
      siteName: "LESSIO",
      title: t("title"),
      description: t("description"),
      url: "/",
      locale: t("ogLocale"),
    },
    twitter: {
      card: "summary_large_image",
      title: t("twitterTitle"),
      description: t("twitterDescription"),
    },
  };
}

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
