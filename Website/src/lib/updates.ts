import { getCollection } from "astro:content";

export async function getPublishedUpdates() {
  const updates = await getCollection("updates");
  return updates.sort(
    (a, b) =>
      b.data.published.getTime() - a.data.published.getTime() ||
      a.id.localeCompare(b.id),
  );
}

export function updatePath(id: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}/updates/${id}/`;
}
