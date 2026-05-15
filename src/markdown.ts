import MarkdownIt from "markdown-it";

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escapeForCdata(text: string): string {
  // ]]> would prematurely close a CDATA section — split it across two sections
  return text.replace(/]]>/g, "]]]]><![CDATA[>");
}

function convertCodeBlocksToConfluenceMacros(html: string): string {
  return html.replace(
    /<pre><code(?:\s+class="language-([^"]*)")?>([\s\S]*?)<\/code><\/pre>/g,
    (_, language: string | undefined, code: string) => {
      const lang = language ? language.trim() : "";
      const langParam = lang
        ? `<ac:parameter ac:name="language">${lang}</ac:parameter>`
        : "";
      const escapedCode = escapeForCdata(decodeHtmlEntities(code));
      return `<ac:structured-macro ac:name="code">${langParam}<ac:plain-text-body><![CDATA[${escapedCode}]]></ac:plain-text-body></ac:structured-macro>`;
    }
  );
}

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

  return convertCodeBlocksToConfluenceMacros(md.render(markdown));
}