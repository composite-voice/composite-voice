import { OGImageRoute } from "astro-og-canvas";

const pages: Record<string, { title: string; description: string }> = {
  index: {
    title: "CompositeVoice",
    description:
      "An open-source SDK for building composable voice interfaces on the web.",
  },
};

export const { getStaticPaths, GET } = await OGImageRoute({
  param: "slug",
  pages,
  getImageOptions: (_path, page) => ({
    title: page.title,
    description: page.description,
    bgGradient: [[24, 24, 27]],
    border: { color: [99, 102, 241], width: 4, side: "inline-start" },
    logo: {
      path: "./src/assets/brand-wordmark-light.png",
      size: [300],
    },
    font: {
      title: { weight: "Bold", size: 56, color: [255, 255, 255] },
      description: { size: 28, color: [161, 161, 170] },
    },
  }),
});
