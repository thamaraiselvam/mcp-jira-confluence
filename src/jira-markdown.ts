/**
 * Convert Markdown text to Atlassian Document Format (ADF) for Jira.
 * 
 * This module converts common Markdown syntax to Jira's ADF JSON structure.
 * ADF is used by Jira Cloud for rich text descriptions.
 */

interface AdfNode {
  type: string;
  content?: AdfNode[];
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

/**
 * Convert Markdown text to ADF document structure.
 * Supports: headings, bold, italic, code, links, lists, paragraphs.
 */
export function markdownToAdf(markdown: string): Record<string, unknown> {
  if (!markdown || markdown.trim().length === 0) {
    return {
      type: "doc",
      version: 1,
      content: [],
    };
  }

  const lines = markdown.split("\n");
  const content: AdfNode[] = [];
  let currentParagraph: string[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let codeLanguage = "";
  let listItems: string[] = [];
  let listType: "bulletList" | "orderedList" | null = null;

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      const text = currentParagraph.join("\n").trim();
      if (text) {
        content.push(createParagraph(text));
      }
      currentParagraph = [];
    }
  };

  const flushList = () => {
    if (listItems.length > 0 && listType) {
      content.push(createList(listItems, listType));
      listItems = [];
      listType = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Handle code blocks
    if (trimmedLine.startsWith("```")) {
      if (inCodeBlock) {
        // End code block
        content.push(createCodeBlock(codeBlockLines.join("\n"), codeLanguage));
        codeBlockLines = [];
        codeLanguage = "";
        inCodeBlock = false;
      } else {
        // Start code block
        flushParagraph();
        flushList();
        codeLanguage = trimmedLine.substring(3).trim();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Handle tables (| col1 | col2 |)
    if (trimmedLine.startsWith("|") && trimmedLine.endsWith("|")) {
      flushParagraph();
      flushList();
      
      // Collect table rows
      const tableLines: string[] = [trimmedLine];
      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (nextLine.startsWith("|") && nextLine.endsWith("|")) {
          tableLines.push(nextLine);
          i++;
        } else {
          break;
        }
      }
      
      // Parse and create table
      const tableNode = parseTable(tableLines);
      if (tableNode) {
        content.push(tableNode);
      }
      continue;
    }

    // Handle horizontal rules (---, ***, ___)
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmedLine)) {
      flushParagraph();
      flushList();
      content.push(createHorizontalRule());
      continue;
    }

    // Handle blockquotes (> text)
    const blockquoteMatch = line.match(/^>\s*(.*)$/);
    if (blockquoteMatch) {
      flushParagraph();
      flushList();
      // Collect all consecutive blockquote lines
      const blockquoteLines: string[] = [blockquoteMatch[1]];
      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const nextMatch = nextLine.match(/^>\s*(.*)$/);
        if (nextMatch) {
          blockquoteLines.push(nextMatch[1]);
          i++;
        } else {
          break;
        }
      }
      content.push(createBlockquote(blockquoteLines.join("\n")));
      continue;
    }

    // Handle headings (h1-h6)
    const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      content.push(createHeading(text, level));
      continue;
    }

    // Handle bullet lists
    const bulletMatch = line.match(/^(\s*)[*\-+]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      if (listType !== "bulletList") {
        flushList();
        listType = "bulletList";
      }
      listItems.push(bulletMatch[2]);
      continue;
    }

    // Handle ordered lists
    const orderedMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listType !== "orderedList") {
        flushList();
        listType = "orderedList";
      }
      listItems.push(orderedMatch[2]);
      continue;
    }

    // Empty line
    if (trimmedLine === "") {
      flushParagraph();
      flushList();
      continue;
    }

    // Regular paragraph line
    flushList();
    currentParagraph.push(line);
  }

  // Flush remaining content
  flushParagraph();
  flushList();
  if (inCodeBlock && codeBlockLines.length > 0) {
    content.push(createCodeBlock(codeBlockLines.join("\n"), codeLanguage));
  }

  return {
    type: "doc",
    version: 1,
    content,
  };
}

function createHorizontalRule(): AdfNode {
  return {
    type: "rule",
  };
}

function createBlockquote(text: string): AdfNode {
  return {
    type: "blockquote",
    content: [
      {
        type: "paragraph",
        content: parseInlineContent(text),
      },
    ],
  };
}

function createHeading(text: string, level: number): AdfNode {
  return {
    type: "heading",
    attrs: { level: Math.min(Math.max(level, 1), 6) },
    content: parseInlineContent(text),
  };
}

function createParagraph(text: string): AdfNode {
  return {
    type: "paragraph",
    content: parseInlineContent(text),
  };
}

function createCodeBlock(code: string, language: string): AdfNode {
  const node: AdfNode = {
    type: "codeBlock",
    content: [
      {
        type: "text",
        text: code,
      },
    ],
  };

  if (language) {
    node.attrs = { language };
  }

  return node;
}

function createList(items: string[], listType: "bulletList" | "orderedList"): AdfNode {
  return {
    type: listType,
    content: items.map((item) => ({
      type: "listItem",
      content: [
        {
          type: "paragraph",
          content: parseInlineContent(item),
        },
      ],
    })),
  };
}

/**
 * Parse a markdown table into ADF table structure.
 * Expects table lines in format: | col1 | col2 |
 */
function parseTable(tableLines: string[]): AdfNode | null {
  if (tableLines.length < 2) {
    return null;
  }

  // Parse cells from a row
  const parseCells = (line: string): string[] => {
    return line
      .split("|")
      .slice(1, -1) // Remove first and last empty strings
      .map((cell) => cell.trim());
  };

  const rows: string[][] = [];
  let headerRow: string[] | null = null;
  let separatorFound = false;

  for (let i = 0; i < tableLines.length; i++) {
    const line = tableLines[i];
    
    // Check if this is a separator line (|---|---|)
    if (/^\|[\s\-:|]+\|$/.test(line)) {
      separatorFound = true;
      // The previous row is the header
      if (i > 0 && rows.length > 0) {
        headerRow = rows.pop() || null;
      }
      continue;
    }

    rows.push(parseCells(line));
  }

  // If no separator found, treat first row as header
  if (!separatorFound && rows.length > 0) {
    headerRow = rows.shift() || null;
  }

  // Build ADF table structure
  const tableRows: AdfNode[] = [];

  // Add header row if exists
  if (headerRow) {
    tableRows.push({
      type: "tableRow",
      content: headerRow.map((cellText) => ({
        type: "tableHeader",
        attrs: {},
        content: [
          {
            type: "paragraph",
            content: parseInlineContent(cellText),
          },
        ],
      })),
    });
  }

  // Add data rows
  rows.forEach((row) => {
    tableRows.push({
      type: "tableRow",
      content: row.map((cellText) => ({
        type: "tableCell",
        attrs: {},
        content: [
          {
            type: "paragraph",
            content: parseInlineContent(cellText),
          },
        ],
      })),
    });
  });

  if (tableRows.length === 0) {
    return null;
  }

  return {
    type: "table",
    attrs: {
      isNumberColumnEnabled: false,
      layout: "default",
    },
    content: tableRows,
  };
}

/**
 * Parse inline content (bold, italic, code, links, strikethrough).
 * Returns an array of text nodes with optional marks.
 */
function parseInlineContent(text: string): AdfNode[] {
  const nodes: AdfNode[] = [];
  let remaining = text;
  let pos = 0;

  while (pos < remaining.length) {
    // Bold + Italic: ***text*** or ___text___
    const boldItalicMatch = remaining.slice(pos).match(/^(\*{3}|_{3})(.+?)\1/);
    if (boldItalicMatch) {
      nodes.push({
        type: "text",
        text: boldItalicMatch[2],
        marks: [{ type: "strong" }, { type: "em" }],
      });
      pos += boldItalicMatch[0].length;
      continue;
    }

    // Bold: **text** or __text__
    const boldMatch = remaining.slice(pos).match(/^(\*\*|__)(.+?)\1/);
    if (boldMatch) {
      nodes.push({
        type: "text",
        text: boldMatch[2],
        marks: [{ type: "strong" }],
      });
      pos += boldMatch[0].length;
      continue;
    }

    // Italic: *text* or _text_
    const italicMatch = remaining.slice(pos).match(/^(\*|_)(.+?)\1/);
    if (italicMatch) {
      nodes.push({
        type: "text",
        text: italicMatch[2],
        marks: [{ type: "em" }],
      });
      pos += italicMatch[0].length;
      continue;
    }

    // Strikethrough: ~~text~~
    const strikeMatch = remaining.slice(pos).match(/^~~(.+?)~~/);
    if (strikeMatch) {
      nodes.push({
        type: "text",
        text: strikeMatch[1],
        marks: [{ type: "strike" }],
      });
      pos += strikeMatch[0].length;
      continue;
    }

    // Inline code: `code`
    const codeMatch = remaining.slice(pos).match(/^`([^`]+)`/);
    if (codeMatch) {
      nodes.push({
        type: "text",
        text: codeMatch[1],
        marks: [{ type: "code" }],
      });
      pos += codeMatch[0].length;
      continue;
    }

    // Link: [text](url)
    const linkMatch = remaining.slice(pos).match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      nodes.push({
        type: "text",
        text: linkMatch[1],
        marks: [{ type: "link", attrs: { href: linkMatch[2] } }],
      });
      pos += linkMatch[0].length;
      continue;
    }

    // Regular text
    nodes.push({
      type: "text",
      text: remaining[pos],
    });
    pos++;
  }

  // Merge consecutive plain text nodes
  const merged: AdfNode[] = [];
  for (const node of nodes) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.type === "text" &&
      node.type === "text" &&
      !last.marks &&
      !node.marks
    ) {
      last.text = (last.text || "") + (node.text || "");
    } else {
      merged.push(node);
    }
  }

  return merged;
}
