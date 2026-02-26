import { OGImageRoute } from "astro-og-canvas";
import { getCollection } from "astro:content";

const docs = await getCollection("docs");
const pages: Record<string, { title: string; description: string }> = {
  index: {
    title: "CompositeVoice Documentation",
    description:
      "SDK documentation for building composable voice interfaces on the web.",
  },
};

for (const doc of docs) {
  pages[doc.id] = {
    title: doc.data.title,
    description: doc.data.description || "",
  };
}

export const { getStaticPaths, GET } = await OGImageRoute({
  param: "slug",
  pages,
  getImageOptions: (_path, page) => ({
    title: page.title,
    description: page.description,
    bgGradient: [[24, 24, 27]],
    border: { color: [99, 102, 241], width: 4, side: "inline-start" },
    font: {
      title: { weight: "Bold", size: 48, color: [255, 255, 255] },
      description: { size: 24, color: [161, 161, 170] },
    },
  }),
});
