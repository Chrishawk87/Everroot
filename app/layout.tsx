import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

// Meta (Facebook) Pixel id — public by design (it ships to the browser), so it's
// safe to inline. Used by the Facebook ad campaigns to attribute signups/purchases.
const META_PIXEL_ID = "1586083516452093";

export const metadata: Metadata = {
  title: "Everroot — the Living Legacy Forest",
  description: "Preserve your family's history before it's gone.",
};

// Mobile-first: fill the notch, lock zoom so the app feels native on phones.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0a1a11",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Meta Pixel — loads Facebook's fbevents.js, then fires the initial
            PageView. strategy="afterInteractive" runs it as soon as the page is
            interactive, on every route, without blocking first paint. */}
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${META_PIXEL_ID}');
          fbq('track', 'PageView');`}
        </Script>
      </head>
      <body>
        {/* Pixel fallback for browsers with JavaScript disabled. */}
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
            alt=""
          />
        </noscript>
        {children}
      </body>
    </html>
  );
}
