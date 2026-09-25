import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getPublishedUpdates, updatePath } from "../../lib/updates";

export async function GET(context: APIContext) {
  const site = context.site;
  if (!site) throw new Error("The Updates feed requires an Astro site URL.");
  const updates = await getPublishedUpdates();
  return rss({
    title: "SwiftTUI Updates",
    description: "Authored release stories and closer looks at SwiftTUI.",
    site,
    items: updates.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.published,
      link: updatePath(post.id),
    })),
    customData: "<language>en-us</language>",
  });
}
