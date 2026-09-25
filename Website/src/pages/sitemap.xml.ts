import type { APIContext } from "astro";
import { getPublishedUpdates } from "../lib/updates";

const pages = [
  ["/", "weekly", "1.0"],
  ["/guides/", "weekly", "0.9"],
  ["/docs/documentation/", "weekly", "0.8"],
  ["/docs/charts/documentation/", "weekly", "0.7"],
  ["/pipeline/", "monthly", "0.7"],
  ["/differences-from-swiftui/", "monthly", "0.7"],
  ["/showcase/", "monthly", "0.8"],
  ["/compare/", "monthly", "0.7"],
  ["/updates/", "weekly", "0.8"],
] as const;

export async function GET(context: APIContext) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const site = context.site;
  if (!site) throw new Error("The sitemap requires an Astro site URL.");
  const updates = await getPublishedUpdates();
  const entries: {
    path: string;
    frequency: string;
    priority: string;
    lastmod?: string;
  }[] = pages.map(([path, frequency, priority]) => ({
    path,
    frequency,
    priority,
  }));

  for (const post of updates) {
    entries.push({
      path: `/updates/${post.id}/`,
      frequency: "monthly",
      priority: "0.7",
      lastmod: post.data.published.toISOString().slice(0, 10),
    });
  }

  const urls = entries.map(({ path, frequency, priority, lastmod }) => {
    const location = new URL(`${base}${path}`, site).href.replaceAll(
      "&",
      "&amp;",
    );
    return `  <url>\n    <loc>${location}</loc>\n    <changefreq>${frequency}</changefreq>\n    <priority>${priority}</priority>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}\n  </url>`;
  });

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
}
