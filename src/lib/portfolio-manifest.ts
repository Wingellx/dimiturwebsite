import "server-only";

import fs from "node:fs";
import path from "node:path";

import type { PortfolioItem } from "./data";

const PORTFOLIO_DIR = path.join(process.cwd(), "public", "portfolio");
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

/**
 * Reads whatever is sitting in /public/portfolio.
 *
 * Deliberately filesystem-driven rather than a hand-maintained list: Dimitur's
 * photos get dropped into that one folder and they appear on the site. Files
 * are shown in filename order, so prefixing them (01-, 02-, ...) sets the
 * running order without anyone editing code.
 *
 * A filename becomes the alt text, so `01-fine-line-snake-forearm.jpg` reads
 * as "fine line snake forearm" to a screen reader and to Google.
 */
export const staticPortfolio: PortfolioItem[] = readPortfolioDir();

function readPortfolioDir(): PortfolioItem[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(PORTFOLIO_DIR);
  } catch {
    return [];
  }

  return entries
    .filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => ({
      id: name,
      src: `/portfolio/${encodeURIComponent(name)}`,
      alt: altFromFilename(name),
    }));
}

function altFromFilename(name: string): string {
  const base = path
    .basename(name, path.extname(name))
    .replace(/^\d+[-_\s]*/, "") // drop an ordering prefix
    .replace(/[-_]+/g, " ")
    .trim();

  return base.length > 0
    ? `${base.charAt(0).toUpperCase()}${base.slice(1)} tattoo by Dimitur Penchev`
    : "Tattoo by Dimitur Penchev";
}
