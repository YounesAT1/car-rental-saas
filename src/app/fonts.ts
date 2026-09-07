import localFont from "next/font/local";

const manrope = localFont({
  src: "./fonts/manrope-latin.woff2",
  variable: "--font-manrope",
  weight: "400 700",
  display: "swap",
});
const plexSans = localFont({
  src: "./fonts/ibm-plex-sans-latin.woff2",
  variable: "--font-plex-sans",
  weight: "400 600",
  display: "swap",
});
const arabic = localFont({
  src: "./fonts/noto-sans-arabic.woff2",
  variable: "--font-arabic",
  weight: "400 700",
  display: "swap",
  preload: false,
});

export const fontClasses = `${manrope.variable} ${plexSans.variable} ${arabic.variable}`;
