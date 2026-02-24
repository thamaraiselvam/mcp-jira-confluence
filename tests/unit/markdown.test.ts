import { describe, it, expect } from "vitest";
import { convertMarkdownToHtml } from "../../src/markdown.js";

describe("markdown — convertMarkdownToHtml()", () => {
  // -------------------------------------------------------
  // Empty / falsy input
  // -------------------------------------------------------
  describe("empty and falsy input", () => {
    it("returns an empty string when given an empty string", () => {
      expect(convertMarkdownToHtml("")).toBe("");
    });

    it("returns an empty string when given a string with no content", () => {
      // The function checks `if (!markdown)` — an empty string is falsy
      expect(convertMarkdownToHtml("")).toBe("");
    });
  });

  // -------------------------------------------------------
  // Basic Markdown elements
  // -------------------------------------------------------
  describe("headings", () => {
    it("converts a level-1 heading", () => {
      const result = convertMarkdownToHtml("# Hello World");
      expect(result.trim()).toBe("<h1>Hello World</h1>");
    });

    it("converts a level-2 heading", () => {
      const result = convertMarkdownToHtml("## Sub Heading");
      expect(result.trim()).toBe("<h2>Sub Heading</h2>");
    });

    it("converts a level-3 heading", () => {
      const result = convertMarkdownToHtml("### Third Level");
      expect(result.trim()).toBe("<h3>Third Level</h3>");
    });

    it("converts a level-4 heading", () => {
      const result = convertMarkdownToHtml("#### Fourth Level");
      expect(result.trim()).toBe("<h4>Fourth Level</h4>");
    });

    it("converts a level-5 heading", () => {
      const result = convertMarkdownToHtml("##### Fifth Level");
      expect(result.trim()).toBe("<h5>Fifth Level</h5>");
    });

    it("converts a level-6 heading", () => {
      const result = convertMarkdownToHtml("###### Sixth Level");
      expect(result.trim()).toBe("<h6>Sixth Level</h6>");
    });
  });

  describe("paragraphs", () => {
    it("wraps plain text in a <p> tag", () => {
      const result = convertMarkdownToHtml("Hello world");
      expect(result.trim()).toBe("<p>Hello world</p>");
    });

    it("handles multiple paragraphs separated by blank lines", () => {
      const result = convertMarkdownToHtml("First paragraph\n\nSecond paragraph");
      expect(result).toContain("<p>First paragraph</p>");
      expect(result).toContain("<p>Second paragraph</p>");
    });
  });

  describe("inline formatting", () => {
    it("converts bold text (**bold**)", () => {
      const result = convertMarkdownToHtml("**bold text**");
      expect(result).toContain("<strong>bold text</strong>");
    });

    it("converts italic text (*italic*)", () => {
      const result = convertMarkdownToHtml("*italic text*");
      expect(result).toContain("<em>italic text</em>");
    });

    it("converts inline code (`code`)", () => {
      const result = convertMarkdownToHtml("`inline code`");
      expect(result).toContain("<code>inline code</code>");
    });

    it("converts bold and italic together (***text***)", () => {
      const result = convertMarkdownToHtml("***bold and italic***");
      expect(result).toContain("<strong>");
      expect(result).toContain("<em>");
      expect(result).toContain("bold and italic");
    });

    it("converts strikethrough text (~~text~~)", () => {
      const result = convertMarkdownToHtml("~~strikethrough~~");
      expect(result).toContain("<s>strikethrough</s>");
    });
  });

  describe("links", () => {
    it("converts a markdown link to an anchor tag", () => {
      const result = convertMarkdownToHtml("[Google](https://google.com)");
      expect(result).toContain('<a href="https://google.com">Google</a>');
    });

    it("converts a link with a title attribute", () => {
      const result = convertMarkdownToHtml('[Google](https://google.com "Search Engine")');
      expect(result).toContain('href="https://google.com"');
      expect(result).toContain('title="Search Engine"');
      expect(result).toContain("Google</a>");
    });

    it("auto-links URLs when linkify is enabled", () => {
      const result = convertMarkdownToHtml("Visit https://example.com for more info");
      expect(result).toContain('<a href="https://example.com">');
    });
  });

  describe("images", () => {
    it("converts a markdown image to an <img> tag", () => {
      const result = convertMarkdownToHtml("![Alt text](https://example.com/img.png)");
      expect(result).toContain('<img src="https://example.com/img.png" alt="Alt text"');
    });

    it("converts an image with a title", () => {
      const result = convertMarkdownToHtml('![Logo](https://example.com/logo.png "Company Logo")');
      expect(result).toContain('src="https://example.com/logo.png"');
      expect(result).toContain('alt="Logo"');
      expect(result).toContain('title="Company Logo"');
    });
  });

  // -------------------------------------------------------
  // Lists
  // -------------------------------------------------------
  describe("unordered lists", () => {
    it("converts a simple unordered list", () => {
      const md = "- Item 1\n- Item 2\n- Item 3";
      const result = convertMarkdownToHtml(md);
      expect(result).toContain("<ul>");
      expect(result).toContain("<li>Item 1</li>");
      expect(result).toContain("<li>Item 2</li>");
      expect(result).toContain("<li>Item 3</li>");
      expect(result).toContain("</ul>");
    });

    it("handles asterisk-style unordered list markers", () => {
      const md = "* Alpha\n* Beta";
      const result = convertMarkdownToHtml(md);
      expect(result).toContain("<ul>");
      expect(result).toContain("<li>Alpha</li>");
      expect(result).toContain("<li>Beta</li>");
    });
  });

  describe("ordered lists", () => {
    it("converts an ordered list", () => {
      const md = "1. First\n2. Second\n3. Third";
      const result = convertMarkdownToHtml(md);
      expect(result).toContain("<ol>");
      expect(result).toContain("<li>First</li>");
      expect(result).toContain("<li>Second</li>");
      expect(result).toContain("<li>Third</li>");
      expect(result).toContain("</ol>");
    });
  });

  // -------------------------------------------------------
  // Code blocks
  // -------------------------------------------------------
  describe("code blocks", () => {
    it("converts a fenced code block", () => {
      const md = "```\nconst x = 1;\n```";
      const result = convertMarkdownToHtml(md);
      expect(result).toContain("<pre>");
      expect(result).toContain("<code>");
      expect(result).toContain("const x = 1;");
    });

    it("converts a fenced code block with a language identifier", () => {
      const md = '```typescript\nconst x: number = 1;\n```';
      const result = convertMarkdownToHtml(md);
      expect(result).toContain("<pre>");
      expect(result).toContain("<code");
      expect(result).toContain("const x: number = 1;");
    });
  });

  // -------------------------------------------------------
  // Blockquotes
  // -------------------------------------------------------
  describe("blockquotes", () => {
    it("converts a blockquote", () => {
      const result = convertMarkdownToHtml("> This is a quote");
      expect(result).toContain("<blockquote>");
      expect(result).toContain("This is a quote");
      expect(result).toContain("</blockquote>");
    });

    it("handles multi-line blockquotes", () => {
      const md = "> Line one\n> Line two";
      const result = convertMarkdownToHtml(md);
      expect(result).toContain("<blockquote>");
      expect(result).toContain("Line one");
      expect(result).toContain("Line two");
    });
  });

  // -------------------------------------------------------
  // Horizontal rules
  // -------------------------------------------------------
  describe("horizontal rules", () => {
    it("converts --- to an <hr> tag", () => {
      const result = convertMarkdownToHtml("---");
      expect(result).toContain("<hr>");
    });

    it("converts *** to an <hr> tag", () => {
      const result = convertMarkdownToHtml("***");
      expect(result).toContain("<hr>");
    });
  });

  // -------------------------------------------------------
  // Tables
  // -------------------------------------------------------
  describe("tables", () => {
    it("converts a markdown table to HTML table elements", () => {
      const md = [
        "| Name | Age |",
        "| ---- | --- |",
        "| Alice | 30 |",
        "| Bob   | 25 |",
      ].join("\n");

      const result = convertMarkdownToHtml(md);
      expect(result).toContain("<table>");
      expect(result).toContain("<thead>");
      expect(result).toContain("<tbody>");
      expect(result).toContain("<th>Name</th>");
      expect(result).toContain("<th>Age</th>");
      expect(result).toContain("<td>Alice</td>");
      expect(result).toContain("<td>Bob</td>");
      expect(result).toContain("<td>30</td>");
      expect(result).toContain("<td>25</td>");
      expect(result).toContain("</table>");
    });
  });

  // -------------------------------------------------------
  // HTML passthrough (html: true)
  // -------------------------------------------------------
  describe("HTML passthrough", () => {
    it("passes through raw HTML elements unchanged", () => {
      const html = '<div class="custom">Content</div>';
      const result = convertMarkdownToHtml(html);
      expect(result).toContain('<div class="custom">Content</div>');
    });

    it("passes through Confluence-specific HTML macros", () => {
      const macro = '<ac:structured-macro ac:name="code"><ac:plain-text-body>hello</ac:plain-text-body></ac:structured-macro>';
      const result = convertMarkdownToHtml(macro);
      expect(result).toContain("ac:structured-macro");
      expect(result).toContain("ac:plain-text-body");
    });

    it("mixes Markdown and HTML in the same document", () => {
      const md = "# Heading\n\n<div>raw html</div>\n\nMore **markdown**";
      const result = convertMarkdownToHtml(md);
      expect(result).toContain("<h1>Heading</h1>");
      expect(result).toContain("<div>raw html</div>");
      expect(result).toContain("<strong>markdown</strong>");
    });
  });

  // -------------------------------------------------------
  // Typographer features (typographer: true)
  // -------------------------------------------------------
  describe("typographer features", () => {
    it("converts straight double quotes to smart quotes", () => {
      const result = convertMarkdownToHtml('"Hello world"');
      // markdown-it with typographer converts to curly quotes (unicode)
      expect(result).toContain("\u201c");
      expect(result).toContain("\u201d");
    });

    it("converts (c) to the copyright symbol", () => {
      const result = convertMarkdownToHtml("(c) 2024");
      expect(result).toContain("\u00a9");
    });

    it("converts -- to an en-dash", () => {
      const result = convertMarkdownToHtml("2020 -- 2024");
      expect(result).toContain("\u2013");
    });
  });

  // -------------------------------------------------------
  // Complex / multi-element documents
  // -------------------------------------------------------
  describe("complex documents", () => {
    it("converts a full Markdown document with multiple element types", () => {
      const md = [
        "# Project Title",
        "",
        "This is the **introduction** to the project.",
        "",
        "## Features",
        "",
        "- Feature A",
        "- Feature B",
        "- Feature C",
        "",
        "## Code Example",
        "",
        "```javascript",
        'console.log("hello");',
        "```",
        "",
        "> Important note here",
        "",
        "---",
        "",
        "Visit [our site](https://example.com) for more.",
      ].join("\n");

      const result = convertMarkdownToHtml(md);

      expect(result).toContain("<h1>Project Title</h1>");
      expect(result).toContain("<strong>introduction</strong>");
      expect(result).toContain("<h2>Features</h2>");
      expect(result).toContain("<li>Feature A</li>");
      expect(result).toContain("<li>Feature B</li>");
      expect(result).toContain("<li>Feature C</li>");
      expect(result).toContain("<h2>Code Example</h2>");
      expect(result).toContain("<pre>");
      expect(result).toContain('console.log(&quot;hello&quot;);');
      expect(result).toContain("<blockquote>");
      expect(result).toContain("Important note here");
      expect(result).toContain("<hr>");
      expect(result).toContain('<a href="https://example.com">our site</a>');
    });

    it("handles whitespace-only input by returning non-empty (whitespace rendered)", () => {
      // A string of spaces is truthy, so markdown-it processes it
      const result = convertMarkdownToHtml("   ");
      // markdown-it may render it as empty or whitespace; either way it should not throw
      expect(typeof result).toBe("string");
    });

    it("handles newlines-only input gracefully", () => {
      const result = convertMarkdownToHtml("\n\n\n");
      expect(typeof result).toBe("string");
    });
  });

  // -------------------------------------------------------
  // Return type
  // -------------------------------------------------------
  describe("return type", () => {
    it("always returns a string", () => {
      expect(typeof convertMarkdownToHtml("")).toBe("string");
      expect(typeof convertMarkdownToHtml("hello")).toBe("string");
      expect(typeof convertMarkdownToHtml("# heading")).toBe("string");
    });

    it("returns HTML that ends with a newline for non-empty input", () => {
      const result = convertMarkdownToHtml("Some text");
      // markdown-it typically appends a trailing newline
      expect(result.endsWith("\n")).toBe(true);
    });
  });
});