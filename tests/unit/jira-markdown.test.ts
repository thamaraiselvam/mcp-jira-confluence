import { describe, it, expect } from "vitest";
import { markdownToAdf } from "../../src/jira-markdown.js";

describe("jira-markdown — markdownToAdf()", () => {
  describe("empty input", () => {
    it("returns empty document for empty string", () => {
      const result = markdownToAdf("");
      expect(result).toEqual({
        type: "doc",
        version: 1,
        content: [],
      });
    });

    it("returns empty document for whitespace only", () => {
      const result = markdownToAdf("   \n  \n  ");
      expect(result).toEqual({
        type: "doc",
        version: 1,
        content: [],
      });
    });
  });

  describe("headings", () => {
    it("converts h1 heading", () => {
      const result = markdownToAdf("# Main Title");
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Main Title" }],
      });
    });

    it("converts h2 heading", () => {
      const result = markdownToAdf("## Section Title");
      expect(result.content[0]).toEqual({
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Section Title" }],
      });
    });

    it("converts h3 heading", () => {
      const result = markdownToAdf("### Subsection");
      expect(result.content[0]).toEqual({
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Subsection" }],
      });
    });

    it("converts h6 heading", () => {
      const result = markdownToAdf("###### Small Heading");
      expect(result.content[0]).toEqual({
        type: "heading",
        attrs: { level: 6 },
        content: [{ type: "text", text: "Small Heading" }],
      });
    });

    it("handles heading with inline formatting", () => {
      const result = markdownToAdf("## **Bold** Heading");
      expect(result.content[0].content).toEqual([
        { type: "text", text: "Bold", marks: [{ type: "strong" }] },
        { type: "text", text: " Heading" },
      ]);
    });
  });

  describe("paragraphs", () => {
    it("converts simple paragraph", () => {
      const result = markdownToAdf("This is a simple paragraph.");
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({
        type: "paragraph",
        content: [{ type: "text", text: "This is a simple paragraph." }],
      });
    });

    it("converts multiple paragraphs separated by blank lines", () => {
      const result = markdownToAdf("First paragraph.\n\nSecond paragraph.");
      expect(result.content).toHaveLength(2);
      expect(result.content[0].type).toBe("paragraph");
      expect(result.content[1].type).toBe("paragraph");
    });

    it("preserves line breaks within a paragraph", () => {
      const result = markdownToAdf("Line one\nLine two");
      expect(result.content).toHaveLength(1);
      expect(result.content[0].content[0].text).toBe("Line one\nLine two");
    });
  });

  describe("inline formatting", () => {
    it("converts bold with **", () => {
      const result = markdownToAdf("This is **bold** text.");
      const content = result.content[0].content;
      expect(content).toContainEqual({
        type: "text",
        text: "bold",
        marks: [{ type: "strong" }],
      });
    });

    it("converts bold with __", () => {
      const result = markdownToAdf("This is __bold__ text.");
      const content = result.content[0].content;
      expect(content).toContainEqual({
        type: "text",
        text: "bold",
        marks: [{ type: "strong" }],
      });
    });

    it("converts italic with *", () => {
      const result = markdownToAdf("This is *italic* text.");
      const content = result.content[0].content;
      expect(content).toContainEqual({
        type: "text",
        text: "italic",
        marks: [{ type: "em" }],
      });
    });

    it("converts italic with _", () => {
      const result = markdownToAdf("This is _italic_ text.");
      const content = result.content[0].content;
      expect(content).toContainEqual({
        type: "text",
        text: "italic",
        marks: [{ type: "em" }],
      });
    });

    it("converts inline code", () => {
      const result = markdownToAdf("Use `console.log()` for debugging.");
      const content = result.content[0].content;
      expect(content).toContainEqual({
        type: "text",
        text: "console.log()",
        marks: [{ type: "code" }],
      });
    });

    it("converts links", () => {
      const result = markdownToAdf("Visit [GitHub](https://github.com) now.");
      const content = result.content[0].content;
      expect(content).toContainEqual({
        type: "text",
        text: "GitHub",
        marks: [{ type: "link", attrs: { href: "https://github.com" } }],
      });
    });

    it("handles multiple inline formats", () => {
      const result = markdownToAdf("**Bold** and *italic* and `code`.");
      const content = result.content[0].content;
      expect(content[0]).toEqual({
        type: "text",
        text: "Bold",
        marks: [{ type: "strong" }],
      });
      expect(content[2]).toEqual({
        type: "text",
        text: "italic",
        marks: [{ type: "em" }],
      });
      expect(content[4]).toEqual({
        type: "text",
        text: "code",
        marks: [{ type: "code" }],
      });
    });

    it("converts bold and italic combined (***text***)", () => {
      const result = markdownToAdf("***bold and italic***");
      expect(result.content[0].content[0]).toEqual({
        type: "text",
        text: "bold and italic",
        marks: [{ type: "strong" }, { type: "em" }],
      });
    });

    it("converts bold and italic combined with underscores (___text___)", () => {
      const result = markdownToAdf("___bold and italic___");
      expect(result.content[0].content[0]).toEqual({
        type: "text",
        text: "bold and italic",
        marks: [{ type: "strong" }, { type: "em" }],
      });
    });

    it("converts strikethrough (~~text~~)", () => {
      const result = markdownToAdf("~~strikethrough text~~");
      expect(result.content[0].content[0]).toEqual({
        type: "text",
        text: "strikethrough text",
        marks: [{ type: "strike" }],
      });
    });

    it("handles mixed bold, italic, and strikethrough", () => {
      const result = markdownToAdf("**bold** and ~~strike~~ and *italic*");
      const content = result.content[0].content;
      expect(content[0].marks[0].type).toBe("strong");
      expect(content[2].marks[0].type).toBe("strike");
      expect(content[4].marks[0].type).toBe("em");
    });
  });

  describe("blockquotes", () => {
    it("converts single line blockquote", () => {
      const result = markdownToAdf("> This is a quote");
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({
        type: "blockquote",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "This is a quote" }],
          },
        ],
      });
    });

    it("converts multi-line blockquote", () => {
      const result = markdownToAdf("> Line one\n> Line two\n> Line three");
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("blockquote");
      expect(result.content[0].content[0].content[0].text).toContain("Line one");
      expect(result.content[0].content[0].content[0].text).toContain("Line two");
    });

    it("converts blockquote with inline formatting", () => {
      const result = markdownToAdf("> **Bold** in quote");
      expect(result.content[0].type).toBe("blockquote");
      expect(result.content[0].content[0].content[0].marks[0].type).toBe("strong");
    });

    it("separates blockquote from paragraphs", () => {
      const result = markdownToAdf("Paragraph\n\n> Quote\n\nAnother paragraph");
      expect(result.content).toHaveLength(3);
      expect(result.content[0].type).toBe("paragraph");
      expect(result.content[1].type).toBe("blockquote");
      expect(result.content[2].type).toBe("paragraph");
    });

    it("handles empty blockquote line", () => {
      const result = markdownToAdf(">");
      expect(result.content[0].type).toBe("blockquote");
      // Empty blockquote should have a paragraph but might not have text nodes
      expect(result.content[0].content[0].type).toBe("paragraph");
    });
  });

  describe("bullet lists", () => {
    it("converts bullet list with *", () => {
      const result = markdownToAdf("* Item 1\n* Item 2\n* Item 3");
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("bulletList");
      expect(result.content[0].content).toHaveLength(3);
      expect(result.content[0].content[0].content[0].content[0].text).toBe("Item 1");
    });

    it("converts bullet list with -", () => {
      const result = markdownToAdf("- First\n- Second");
      expect(result.content[0].type).toBe("bulletList");
      expect(result.content[0].content).toHaveLength(2);
    });

    it("converts bullet list with +", () => {
      const result = markdownToAdf("+ Alpha\n+ Beta");
      expect(result.content[0].type).toBe("bulletList");
      expect(result.content[0].content).toHaveLength(2);
    });

    it("handles bullet list items with inline formatting", () => {
      const result = markdownToAdf("* **Bold** item\n* *Italic* item");
      const firstItem = result.content[0].content[0].content[0].content;
      expect(firstItem[0]).toEqual({
        type: "text",
        text: "Bold",
        marks: [{ type: "strong" }],
      });
    });
  });

  describe("ordered lists", () => {
    it("converts ordered list", () => {
      const result = markdownToAdf("1. First\n2. Second\n3. Third");
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("orderedList");
      expect(result.content[0].content).toHaveLength(3);
    });

    it("handles ordered list with non-sequential numbers", () => {
      const result = markdownToAdf("1. Item A\n5. Item B\n10. Item C");
      expect(result.content[0].type).toBe("orderedList");
      expect(result.content[0].content).toHaveLength(3);
    });
  });

  describe("code blocks", () => {
    it("converts code block without language", () => {
      const result = markdownToAdf("```\nconsole.log('hello');\n```");
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("codeBlock");
      expect(result.content[0].content[0].text).toBe("console.log('hello');");
    });

    it("converts code block with language", () => {
      const result = markdownToAdf("```javascript\nconst x = 42;\n```");
      expect(result.content[0].type).toBe("codeBlock");
      expect(result.content[0].attrs).toEqual({ language: "javascript" });
      expect(result.content[0].content[0].text).toBe("const x = 42;");
    });

    it("preserves multiple lines in code block", () => {
      const result = markdownToAdf("```\nline 1\nline 2\nline 3\n```");
      expect(result.content[0].content[0].text).toBe("line 1\nline 2\nline 3");
    });

    it("handles empty code block", () => {
      const result = markdownToAdf("```\n```");
      expect(result.content[0].type).toBe("codeBlock");
      expect(result.content[0].content[0].text).toBe("");
    });
  });

  describe("tables", () => {
    it("converts a simple table with header and data rows", () => {
      const md = `| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
| Cell 3   | Cell 4   |`;
      const result = markdownToAdf(md);
      
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("table");
      expect(result.content[0].content).toHaveLength(3); // 1 header row + 2 data rows
      
      // Check header row
      expect(result.content[0].content[0].type).toBe("tableRow");
      expect(result.content[0].content[0].content[0].type).toBe("tableHeader");
      expect(result.content[0].content[0].content[0].content[0].content[0].text).toBe("Header 1");
      
      // Check data row
      expect(result.content[0].content[1].content[0].type).toBe("tableCell");
    });

    it("converts table with multiple columns", () => {
      const md = `| Col 1 | Col 2 | Col 3 | Col 4 |
|-------|-------|-------|-------|
| A     | B     | C     | D     |`;
      const result = markdownToAdf(md);
      
      expect(result.content[0].type).toBe("table");
      expect(result.content[0].content[0].content).toHaveLength(4); // 4 columns
    });

    it("handles table with inline formatting", () => {
      const md = `| Name | Status |
|------|--------|
| **Bold** | *Italic* |`;
      const result = markdownToAdf(md);
      
      const cell = result.content[0].content[1].content[0];
      expect(cell.content[0].content[0].marks[0].type).toBe("strong");
    });

    it("separates table from surrounding content", () => {
      const md = `Paragraph before

| H1 | H2 |
|----|-----|
| C1 | C2 |

Paragraph after`;
      const result = markdownToAdf(md);
      
      expect(result.content).toHaveLength(3);
      expect(result.content[0].type).toBe("paragraph");
      expect(result.content[1].type).toBe("table");
      expect(result.content[2].type).toBe("paragraph");
    });

    it("handles table without separator (treats first row as header)", () => {
      const md = `| Header 1 | Header 2 |
| Data 1   | Data 2   |`;
      const result = markdownToAdf(md);
      
      expect(result.content[0].type).toBe("table");
      expect(result.content[0].content).toHaveLength(2);
      expect(result.content[0].content[0].content[0].type).toBe("tableHeader");
    });

    it("handles single row table", () => {
      const md = `| Single | Row |
|--------|-----|
| Data   | Row |`;
      const result = markdownToAdf(md);
      
      expect(result.content[0].type).toBe("table");
      expect(result.content[0].content).toHaveLength(2); // header + 1 data row
    });

    it("handles empty cells", () => {
      const md = `| H1 | H2 |
|----|-----|
|    | C2 |`;
      const result = markdownToAdf(md);
      
      expect(result.content[0].type).toBe("table");
      const firstCell = result.content[0].content[1].content[0];
      // Empty cells will have empty content array or empty text
      expect(firstCell.content[0].content.length).toBeGreaterThanOrEqual(0);
    });

    it("preserves multiple tables in document", () => {
      const md = `| T1H1 | T1H2 |
|------|------|
| T1D1 | T1D2 |

Some text

| T2H1 | T2H2 |
|------|------|
| T2D1 | T2D2 |`;
      const result = markdownToAdf(md);
      
      const tableCount = result.content.filter(n => n.type === "table").length;
      expect(tableCount).toBe(2);
    });
  });

  describe("horizontal rules", () => {
    it("converts --- to a rule node", () => {
      const result = markdownToAdf("---");
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({
        type: "rule",
      });
    });

    it("converts *** to a rule node", () => {
      const result = markdownToAdf("***");
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({
        type: "rule",
      });
    });

    it("converts ___ to a rule node", () => {
      const result = markdownToAdf("___");
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({
        type: "rule",
      });
    });

    it("converts longer sequences (----) to a rule node", () => {
      const result = markdownToAdf("------");
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({
        type: "rule",
      });
    });

    it("separates paragraphs with horizontal rule", () => {
      const result = markdownToAdf("First paragraph.\n\n---\n\nSecond paragraph.");
      expect(result.content).toHaveLength(3);
      expect(result.content[0].type).toBe("paragraph");
      expect(result.content[1].type).toBe("rule");
      expect(result.content[2].type).toBe("paragraph");
    });

    it("handles multiple horizontal rules", () => {
      const result = markdownToAdf("Para 1\n\n---\n\nPara 2\n\n***\n\nPara 3");
      expect(result.content).toHaveLength(5);
      expect(result.content[0].type).toBe("paragraph");
      expect(result.content[1].type).toBe("rule");
      expect(result.content[2].type).toBe("paragraph");
      expect(result.content[3].type).toBe("rule");
      expect(result.content[4].type).toBe("paragraph");
    });

    it("does not treat -- (two dashes) as horizontal rule", () => {
      const result = markdownToAdf("--");
      expect(result.content[0].type).toBe("paragraph");
      expect(result.content[0].content[0].text).toBe("--");
    });

    it("handles horizontal rule with text before and after", () => {
      const result = markdownToAdf("# Heading\n\nText\n\n---\n\nMore text");
      expect(result.content).toHaveLength(4);
      expect(result.content[0].type).toBe("heading");
      expect(result.content[1].type).toBe("paragraph");
      expect(result.content[2].type).toBe("rule");
      expect(result.content[3].type).toBe("paragraph");
    });
  });

  describe("mixed content", () => {
    it("converts heading followed by paragraph", () => {
      const result = markdownToAdf("# Title\n\nSome content.");
      expect(result.content).toHaveLength(2);
      expect(result.content[0].type).toBe("heading");
      expect(result.content[1].type).toBe("paragraph");
    });

    it("converts paragraph, list, and code block", () => {
      const md = "Intro text.\n\n* Item 1\n* Item 2\n\n```\ncode\n```";
      const result = markdownToAdf(md);
      expect(result.content).toHaveLength(3);
      expect(result.content[0].type).toBe("paragraph");
      expect(result.content[1].type).toBe("bulletList");
      expect(result.content[2].type).toBe("codeBlock");
    });

    it("handles complex story description", () => {
      const md = `# User Story

## Description
As a user, I want to **login** to the system.

## Acceptance Criteria
* User can enter username
* User can enter password
* Click \`Submit\` button

## Technical Notes
\`\`\`javascript
const login = (user, pass) => {
  return api.authenticate(user, pass);
};
\`\`\``;

      const result = markdownToAdf(md);
      expect(result.content.length).toBeGreaterThan(5);
      expect(result.content[0].type).toBe("heading");
      expect(result.content[0].attrs.level).toBe(1);
    });
  });

  describe("edge cases", () => {
    it("handles heading without space after #", () => {
      const result = markdownToAdf("#NoSpace");
      // Should not be treated as heading
      expect(result.content[0].type).toBe("paragraph");
    });

    it("handles multiple blank lines", () => {
      const result = markdownToAdf("Para 1\n\n\n\nPara 2");
      expect(result.content).toHaveLength(2);
    });

    it("handles text with # in middle", () => {
      const result = markdownToAdf("This is not a # heading.");
      expect(result.content[0].type).toBe("paragraph");
      expect(result.content[0].content[0].text).toContain("#");
    });

    it("handles unclosed code block", () => {
      const result = markdownToAdf("```\ncode without closing");
      expect(result.content[0].type).toBe("codeBlock");
      expect(result.content[0].content[0].text).toBe("code without closing");
    });

    it("handles list interrupted by paragraph", () => {
      const result = markdownToAdf("* Item 1\n\nParagraph\n\n* Item 2");
      expect(result.content).toHaveLength(3);
      expect(result.content[0].type).toBe("bulletList");
      expect(result.content[1].type).toBe("paragraph");
      expect(result.content[2].type).toBe("bulletList");
    });
  });
});
