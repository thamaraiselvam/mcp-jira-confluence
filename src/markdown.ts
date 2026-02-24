import MarkdownIt from "markdown-it";

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

/**
 * Converts a Markdown string to HTML suitable for Confluence storage format.
 *
 * @param markdown - The raw Markdown content to convert.
 * @returns The rendered HTML string.
 */
export function convertMarkdownToHtml(markdown: string): string {
  if (!markdown) {
    return "";
  }

  return md.render(markdown);
}