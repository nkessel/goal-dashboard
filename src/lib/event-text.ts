/**
 * Google event descriptions arrive as HTML full of meeting boilerplate
 * (Zoom / Meet / Teams joining instructions, separator lines). This turns
 * one into plain, readable text: line breaks kept, tags and entities gone,
 * the joining instructions cut, and blank runs squeezed.
 */
export function cleanEventDescription(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = raw
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    // Keep a link's address when its text doesn't already show it.
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, (_m, href: string, text: string) => (text.replace(/<[^>]+>/g, "").trim() && !href.includes(text.trim()) ? `${text} (${href})` : href))
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
  // Google's "-::~:~::~:~:~::-" fences wrap the Meet / Zoom block: drop it.
  s = s.replace(/-::~[:~]*::-[\s\S]*?-::~[:~]*::-/g, "").replace(/-::~[:~]*::-[\s\S]*$/g, "");
  // Common joining boilerplate, from its first line to the end.
  const cut = s.search(/\n\s*(Join Zoom Meeting|Join with Google Meet|Microsoft Teams meeting|Join on your computer|────────)/i);
  if (cut > 0) s = s.slice(0, cut);
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
