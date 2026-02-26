import { OGImageRoute } from "astro-og-canvas";

const pages: Record<string, { title: string; description: string }> = {
  index: {
    title: "CompositeVoice Design System",
    description: "Design tokens, components, and patterns for CompositeVoice.",
  },
  colors: { title: "Colors", description: "Color tokens and palettes." },
  typography: { title: "Typography", description: "Type scale and font families." },
  icons: { title: "Icons", description: "Icon set and usage." },
  buttons: { title: "Buttons", description: "Button variants and states." },
  alerts: { title: "Alerts", description: "Alert components." },
  badges: { title: "Badges", description: "Badge variants." },
  forms: { title: "Forms", description: "Form controls and inputs." },
  cards: { title: "Cards", description: "Card layout components." },
  loading: { title: "Loading", description: "Spinners, skeletons, and progress." },
  tooltips: { title: "Tooltips", description: "Tooltip component." },
  tabs: { title: "Tabs", description: "Tab navigation component." },
  pagination: { title: "Pagination", description: "Pagination component." },
  tables: { title: "Tables", description: "Table components." },
  overlays: { title: "Overlays", description: "Modal and overlay components." },
  banners: { title: "Banners", description: "Banner component." },
  code: { title: "Code & Prose", description: "Code blocks and prose typography." },
};

export const { getStaticPaths, GET } = await OGImageRoute({
  param: "slug",
  pages,
  getImageOptions: (_path, page) => ({
    title: page.title,
    description: page.description,
    bgGradient: [[24, 24, 27]],
    border: { color: [16, 185, 129], width: 4, side: "inline-start" },
    font: {
      title: { weight: "Bold", size: 48, color: [255, 255, 255] },
      description: { size: 24, color: [161, 161, 170] },
    },
  }),
});
