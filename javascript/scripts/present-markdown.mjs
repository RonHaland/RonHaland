#!/usr/bin/env node
/**
 * Terminal Markdown Presenter
 *
 * Structure:
 *   H1 = Title page + its content
 *   H2 = Pages
 *   H3 = Sub-pages (H2 title stays at top)
 *
 *  Colors:
 *    - Green: Headings
 *    - Red: Bold
 *    - Cyan: Italic
 *    - Orange: Inline/block code
 *    - Reset: Normal text
 *
 * Usage: node scripts/present-markdown.mjs <file.md>
 * Keys: n/→/space = next, p/←/b = previous, q = quit
 */

import { createReadStream } from "fs";
import { createInterface } from "readline";

const ESC = "\x1b";
const clearScreen = `${ESC}[2J${ESC}[H`;
const hideCursor = `${ESC}[?25l`;
const showCursor = `${ESC}[?25h`;

const green = `${ESC}[32m`;
const red = `${ESC}[31m`;
const cyan = `${ESC}[36m`;
const orange = `${ESC}[38;5;208m`;
const reset = `${ESC}[0m`;

async function readFile(path) {
  const stream = createReadStream(path, "utf8");
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  const lines = [];
  for await (const line of rl) lines.push(line);
  return lines.join("\n");
}

function parseMarkdown(md) {
  const pages = [];
  const lines = md.split("\n");
  let i = 0;

  // Extract H1 title page
  while (i < lines.length) {
    const line = lines[i];
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) {
      const content = [];
      i++;
      while (i < lines.length && !lines[i].match(/^#{1,3}\s/)) {
        content.push(lines[i]);
        i++;
      }
      pages.push({
        type: "title",
        title: h1[1].trim(),
        content: content.join("\n").trim(),
      });
      break;
    }
    i++;
  }

  // Extract H2 pages and H3 sub-pages
  while (i < lines.length) {
    const line = lines[i];
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      const pageTitle = h2[1].trim();
      const subPages = [];
      i++;
      let currentContent = [];
      let brokeDueToH2 = false;

      while (i < lines.length) {
        const l = lines[i];
        const h3 = l.match(/^###\s+(.+)$/);
        const h2Next = l.match(/^##\s+/);

        if (h2Next) {
          if (currentContent.length > 0) {
            const trimmed = currentContent.join("\n").trim();
            if (trimmed) {
              const firstLine = currentContent[0];
              const h3Match = firstLine.match(/^###\s+(.+)$/);
              subPages.push({
                subtitle: h3Match ? h3Match[1].trim() : null,
                content: trimmed,
              });
            }
          }
          brokeDueToH2 = true;
          break;
        }

        if (h3) {
          if (currentContent.length > 0) {
            const trimmed = currentContent.join("\n").trim();
            if (trimmed) {
              const firstLine = currentContent[0];
              const h3Match = firstLine.match(/^###\s+(.+)$/);
              subPages.push({
                subtitle: h3Match ? h3Match[1].trim() : null,
                content: trimmed,
              });
            }
          }
          currentContent = [l];
          i++;
          continue;
        }

        currentContent.push(l);
        i++;
      }

      // Handle content at end of section (EOF or last sub-section)
      if (!brokeDueToH2 && currentContent.length > 0) {
        const trimmed = currentContent.join("\n").trim();
        if (trimmed) {
          const firstLine = currentContent[0];
          const h3Match = firstLine.match(/^###\s+(.+)$/);
          subPages.push({
            subtitle: h3Match ? h3Match[1].trim() : null,
            content: trimmed,
          });
        }
      }

      if (subPages.length === 0) {
        pages.push({
          type: "page",
          title: pageTitle,
          subtitle: null,
          content: "",
        });
      } else {
        for (const sp of subPages) {
          const content = sp.subtitle
            ? sp.content.replace(/^###\s+[^\n]+\n?/, "").trim()
            : sp.content;
          pages.push({
            type: "page",
            title: pageTitle,
            subtitle: sp.subtitle,
            content,
          });
        }
      }
      continue;
    }
    i++;
  }

  return pages;
}

function formatContent(text) {
  // Code blocks (```...```) - process before inline code
  let result = text.replace(/```[\s\S]*?```/g, (block) => {
    const lines = block.slice(3, -3).split("\n");
    const lang = lines[0].match(/^\w+$/) ? lines[0] : null;
    const codeLines = lang ? lines.slice(1) : lines;
    return codeLines
      .map((l) => `${orange}  ${l.replace(/\s+$/, "")}${reset}`)
      .join("\n");
  });

  return result
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, `${red}$1${reset}`)
    .replace(/__([^_]+)__/g, `${red}$1${reset}`)
    .replace(/\*([^*]+)\*/g, `${cyan}$1${reset}`)
    .replace(/_([^_]+)_/g, `${cyan}$1${reset}`)
    .replace(/`([^`]+)`/g, `${orange}$1${reset}`)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[-*]\s+/gm, "  • ")
    .replace(/^\d+\.\s+/gm, "  ");
}

const MIN_COLUMNS_FOR_PADDING = 100;
const LEFT_PADDING_SPACES = 4;

function getTerminalSize() {
  const { rows = 24, columns = 80 } = process.stdout;
  return { rows, columns };
}

function addLeftPadding(text, columns) {
  if (columns < MIN_COLUMNS_FOR_PADDING) return text;
  const pad = " ".repeat(LEFT_PADDING_SPACES);
  return text.split("\n").map((line) => pad + line).join("\n");
}

function padContentBelow(contentLines, availableRows) {
  const contentHeight = contentLines.length;
  const padding = Math.max(0, Math.floor((availableRows - contentHeight) / 2));
  const top = "\n".repeat(padding);
  const bottom = "\n".repeat(
    Math.max(0, availableRows - padding - contentHeight)
  );
  return top + contentLines.join("\n") + bottom;
}

function wrapLine(line, width) {
  const words = line.split(" ");
  const result = [];
  let current = "";
  for (const w of words) {
    if (w.length > width) {
      if (current) {
        result.push(current);
        current = "";
      }
      for (let i = 0; i < w.length; i += width) {
        result.push(w.slice(i, i + width));
      }
    } else if (current.length + w.length + 1 <= width) {
      current += (current ? " " : "") + w;
    } else {
      if (current) result.push(current);
      current = w;
    }
  }
  if (current) result.push(current);
  return result;
}

function formatPage(page, size) {
  const { rows, columns } = size;
  const totalRows = rows - 1; // Reserve bottom line for nav hint
  const leftPadding =
    columns >= MIN_COLUMNS_FOR_PADDING ? LEFT_PADDING_SPACES : 0;
  const contentWidth = columns - leftPadding;

  let output;

  if (page.type === "title") {
    const header = `${green}${page.title}${reset}\n`;
    const contentLines = page.content
      ? formatContent(page.content)
          .split("\n")
          .filter(Boolean)
          .flatMap((cl) => wrapLine(cl, contentWidth))
      : [];
    const availableForContent = totalRows - 1; // minus header line
    output = header + padContentBelow(contentLines, availableForContent);
  } else {
    const headerLines = [`${green}${page.title}${reset}`];
    if (page.subtitle) {
      headerLines.push("");
      headerLines.push(`  ${green}${page.subtitle}${reset}`);
    }
    const header = headerLines.join("\n") + "\n";
    const contentLines = page.content
      ? formatContent(page.content)
          .split("\n")
          .filter(Boolean)
          .flatMap((cl) => wrapLine(cl, contentWidth))
      : [];
    const headerHeight = headerLines.length;
    const availableForContent = totalRows - headerHeight;
    output =
      header + padContentBelow(contentLines, Math.max(0, availableForContent));
  }

  return addLeftPadding(output, columns);
}

function render(page, index, total) {
  const size = getTerminalSize();
  const output = formatPage(page, size);
  process.stdout.write(clearScreen + hideCursor + output);
  process.stdout.write(`\n${ESC}[2m[${index + 1}/${total}] q:quit${ESC}[0m`);
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: node present-markdown.mjs <file.md>");
    process.exit(1);
  }

  readFile(path)
    .then((md) => {
      const pages = parseMarkdown(md);
      if (pages.length === 0) {
        console.error("No valid structure found (need H1 or H2 headings)");
        process.exit(1);
      }

      let idx = 0;

      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding("utf8");

      process.stdout.on("resize", () => render(pages[idx], idx, pages.length));

      render(pages[idx], idx, pages.length);

      process.stdin.on("data", (key) => {
        const k = key.toString();
        if (k === "q" || k === "\u0003") {
          process.stdout.write(clearScreen + showCursor);
          process.exit(0);
        }
        if (
          k === "n" ||
          k === " " ||
          k === "\u001b[C" ||
          k === "j" ||
          k === "\r"
        ) {
          idx = Math.min(idx + 1, pages.length - 1);
          render(pages[idx], idx, pages.length);
        }
        if (k === "p" || k === "b" || k === "\u001b[D" || k === "k") {
          idx = Math.max(idx - 1, 0);
          render(pages[idx], idx, pages.length);
        }
      });
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

main();
