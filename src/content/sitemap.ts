import { ARTICLES, CONTENT_HUB_PATH, articlePath } from "./articles.js";

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function contentPaths(): string[] {
  return [CONTENT_HUB_PATH, ...ARTICLES.map((article) => articlePath(article.slug))];
}

export function buildSitemapXml(baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const urls = ["/", ...contentPaths()];
  const body = urls
    .map((path) => {
      const loc = `${base}${path}`;
      return `  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <changefreq>monthly</changefreq>\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function robotsTxt(baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, "");
  return `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`;
}
