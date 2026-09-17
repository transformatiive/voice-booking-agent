import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ARTICLES,
  CONTENT_HUB,
  CONTENT_HUB_PATH,
  articlePath,
  articlesByGroup,
  contentGroupLabel,
  getArticle,
} from "../src/content/articles.js";
import { buildSitemapXml, contentPaths, robotsTxt } from "../src/content/sitemap.js";

function readWeb(path: string): string {
  return readFileSync(new URL(`../web/src/${path}`, import.meta.url), "utf8");
}

const SLOP = [
  /no mundo (atual|de hoje)/i,
  /é (essencial|fundamental|crucial)/i,
  /revolu[cç]ion/i,
  /estudos mostram/i,
  /milhares de empresas/i,
  /\d+\s*%/,
  /celular/,
  /você tá/,
  /ai-answering-service/,
];

describe("conteúdos SEO pt-PT", () => {
  it("keeps unique titles, slugs and H1s for ten long-tail guides", () => {
    expect(ARTICLES).toHaveLength(10);
    const titles = ARTICLES.map((article) => article.title);
    const slugs = ARTICLES.map((article) => article.slug);
    const h1s = ARTICLES.map((article) => article.title);
    expect(new Set(titles).size).toBe(10);
    expect(new Set(slugs).size).toBe(10);
    expect(new Set(h1s).size).toBe(10);
    expect(CONTENT_HUB.title).toBe("Guias para PME que atendem o telefone em Portugal");
    expect(titles).not.toContain(CONTENT_HUB.title);
  });

  it("covers the six industry families plus practical PME queries", () => {
    const families = articlesByGroup("setor").map((article) => article.family);
    expect(families).toEqual([
      "Saúde",
      "Beleza e bem-estar",
      "Restauração e hotelaria",
      "Casa, auto e campo",
      "Serviços profissionais",
      "Fitness e formação",
    ]);
    const pratico = articlesByGroup("pratico").map((article) => article.menuLabel);
    expect(pratico).toEqual(["Atendedor virtual", "Marcação por telefone", "Número +351", "Google Calendar"]);
    expect(contentGroupLabel("setor")).toBe("Setores");
    expect(contentGroupLabel("pratico")).toBe("Na prática");
    const body = ARTICLES.map((article) =>
      [article.title, article.description, ...article.sections.flatMap((section) => section.paragraphs)].join(" "),
    ).join("\n");
    expect(body).toMatch(/atendedor virtual/i);
    expect(body).toMatch(/marcação por telefone/i);
    expect(body).toMatch(/\+351/);
    expect(body).toMatch(/Google Calendar/);
  });

  it("writes real copy without slop, stuffing or fake stats", () => {
    for (const article of ARTICLES) {
      const text = [
        article.title,
        article.description,
        ...article.sections.flatMap((section) => [section.heading, ...section.paragraphs]),
      ].join("\n");
      expect(text.length).toBeGreaterThan(900);
      expect(article.sections.length).toBeGreaterThanOrEqual(3);
      for (const pattern of SLOP) {
        expect(text).not.toMatch(pattern);
      }
      for (const related of article.related) {
        expect(getArticle(related)?.slug).toBe(related);
        expect(related).not.toBe(article.slug);
      }
    }
  });

  it("adds a Conteúdos menu instead of dumping article cards on the homepage", () => {
    const header = readWeb("components/site-header.tsx");
    const menu = readWeb("components/content-menu.tsx");
    const landing = readWeb("pages/Landing.tsx");
    const hub = readWeb("pages/Contents.tsx");
    const page = readWeb("pages/Article.tsx");
    expect(header).toContain("ContentMenu");
    expect(header).toContain("landing-header");
    expect(header).toContain("Conteúdos");
    expect(readWeb("pages/Backoffice.tsx")).toContain("SiteHeader");
    expect(menu).toContain("NavigationMenu");
    expect(menu).toContain("data-content-menu");
    expect(menu).not.toMatch(/<select/);
    expect(landing).toContain("SiteHeader");
    expect(landing).toContain("landing-hero");
    expect(landing).not.toMatch(/ARTICLES\.map/);
    expect(landing).not.toContain("/conteudos/");
    expect(hub).toContain("{article.title}");
    expect(page).toContain("{article.title}");
    expect(page).toContain("<h1");
    expect(readWeb("components/onboard-dialog.tsx")).not.toMatch(/<select/);
  });

  it("lists every guide on the sitemap and robots file", () => {
    const xml = buildSitemapXml("https://example.test");
    expect(xml).toContain("https://example.test/");
    expect(xml).toContain(`https://example.test${CONTENT_HUB_PATH}`);
    for (const article of ARTICLES) {
      expect(xml).toContain(`https://example.test${articlePath(article.slug)}`);
    }
    expect(contentPaths()).toHaveLength(ARTICLES.length + 1);
    expect(robotsTxt("https://example.test")).toContain("Sitemap: https://example.test/sitemap.xml");
  });

  it("wires Express to the hub, articles, sitemap and robots", () => {
    const server = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
    expect(server).toContain("CONTENT_HUB_PATH");
    expect(server).toContain("/sitemap.xml");
    expect(server).toContain("/robots.txt");
    expect(readWeb("main.tsx")).toContain("/conteudos");
    expect(readWeb("main.tsx")).toContain("/conteudos/:slug");
  });
});
