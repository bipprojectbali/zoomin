/** Ringkas user agent → "Chrome di macOS" (tanpa library: cukup untuk daftar sesi). null/tak dikenal → "Perangkat tak dikenal". */
export function describeUserAgent(ua: string | null): string {
  if (!ua) return "Perangkat tak dikenal";
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
  if (browser && os) return `${browser} di ${os}`;
  return browser ?? os ?? "Perangkat tak dikenal";
}

/** Waktu relatif Indonesia ("5 menit yang lalu") dari epoch ms. */
export function relativeTime(at: number, now = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" });
  const sec = Math.round((at - now) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) if (Math.abs(sec) >= size) return rtf.format(Math.round(sec / size), unit);
  return rtf.format(0, "second");
}
