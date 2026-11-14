/** Ringkas user agent → "Chrome on macOS" (tanpa library: cukup untuk daftar sesi). null/tak dikenal → "Unknown device". */
export function describeUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser =
    /Edg(e|A|iOS)?\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /Firefox\/|FxiOS\//.test(ua) ? "Firefox"
    : /Chrome\/|CriOS\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : null;
  const os =
    /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /CrOS/.test(ua) ? "ChromeOS"
    : /Linux/.test(ua) ? "Linux"
    : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? "Unknown device";
}

/** Waktu relatif English ("5 minutes ago") dari epoch ms. */
export function relativeTime(at: number, now = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  const sec = Math.round((at - now) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) if (Math.abs(sec) >= size) return rtf.format(Math.round(sec / size), unit);
  return rtf.format(0, "second");
}
