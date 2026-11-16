import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "SuperArtex",
  version: packageJson.version,
  copyright: `© ${currentYear}, SuperArtex.`,
  meta: {
    title: "SuperArtex — Autonomous Penetration Testing Console",
    description: "Console for the LLM-driven autonomous penetration testing system",
  },
};
