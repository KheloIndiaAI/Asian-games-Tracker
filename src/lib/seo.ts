export const SITE_URL = "https://ag.ccki.in";
export const SITE_TITLE = "Cheer4Bharat — India at the Asian Games 2026";
export const SITE_DESCRIPTION =
  "Live scores, schedule, results and medals for every Indian athlete at the Asian Games 2026 in Aichi-Nagoya. India time or Japan time.";
export const SHARE_IMAGE = `${SITE_URL}/og-image.png`;

export function pageHead({
  title = SITE_TITLE,
  description = SITE_DESCRIPTION,
  path = "/",
  type = "website",
}: {
  title?: string;
  description?: string;
  path?: string;
  type?: string;
} = {}) {
  const url = `${SITE_URL}${path === "/" ? "/" : path.replace(/\/$/, "")}`;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { name: "author", content: "Cheer4Bharat" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: type },
      { property: "og:site_name", content: "Cheer4Bharat" },
      { property: "og:locale", content: "en_IN" },
      { property: "og:url", content: url },
      { property: "og:image", content: SHARE_IMAGE },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Cheer4Bharat — India at the Asian Games 2026" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: SHARE_IMAGE },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}
