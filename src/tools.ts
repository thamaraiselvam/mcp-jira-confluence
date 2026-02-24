import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { AxiosInstance } from "axios";
import { searchConfluence, updateConfluencePage, getConfluencePage, createConfluencePage, addConfluenceComment, getConfluencePageVersions, checkPermissions } from "./confluence.js";
import { searchJira, getJiraIssue, createJiraIssue, updateJiraIssue, transitionJiraIssue, getJiraIssueTransitions } from "./jira.js";
import { ConfluenceConfig, JiraConfig } from "./config.js";

export function registerTools(
  server: Server,
  client: AxiosInstance,
  config: ConfluenceConfig,
  jiraClient: AxiosInstance,
  jiraConfig: JiraConfig
): void {
  // ---------- List Tools ----------
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "search_confluence",
          description:
            "Search Confluence pages using a CQL (Confluence Query Language) query string.",
          inputSchema: {
            type: "object" as const,
            properties: {
              cql: {
                type: "string",
                description:
                  'The CQL query to execute, e.g. \'type=page AND text~"MCP"\'.',
              },
              limit: {
                type: "number",
                description:
                  "Maximum number of results to return (1-100, default 25).",
              },
            },
            required: ["cql"],
          },
        },
        {
          name: "get_confluence_page",
          description:
            "Read a Confluence page by its ID. Returns the page title, space, version, URL, and full body content in Confluence storage format (HTML).",
          inputSchema: {
            type: "object" as const,
            properties: {
              pageId: {
                type: "string",
                description: "The ID of the Confluence page to read.",
              },
            },
            required: ["pageId"],
          },
        },
        {
          name: "create_confluence_page",
          description:
            "Create a new Confluence page in a given space. Accepts Markdown content which is converted to Confluence storage format (HTML). Optionally nest the page under a parent page.",
          inputSchema: {
            type: "object" as const,
            properties: {
              spaceKey: {
                type: "string",
                description: "The key of the Confluence space to create the page in (e.g. 'ENG').",
              },
              title: {
                type: "string",
                description: "The title of the new page.",
              },
              markdownContent: {
                type: "string",
                description: "The page body in Markdown format. This will be converted to HTML for Confluence.",
              },
              parentPageId: {
                type: "string",
                description: "Optional. The ID of an existing page to nest this new page under.",
              },
            },
            required: ["spaceKey", "title", "markdownContent"],
          },
        },
        {
          name: "update_confluence_page",
          description:
            "Update an existing Confluence page. Accepts Markdown content which is converted to Confluence storage format (HTML). Automatically handles version bumping.",
          inputSchema: {
            type: "object" as const,
            properties: {
              pageId: {
                type: "string",
                description: "The ID of the Confluence page to update.",
              },
              title: {
                type: "string",
                description: "The new title for the page.",
              },
              markdownContent: {
                type: "string",
                description:
                  "The page body content in Markdown format. This will be converted to HTML for Confluence.",
              },
            },
            required: ["pageId", "title", "markdownContent"],
          },
        },
        {
          name: "add_confluence_comment",
          description:
            "Add an inline comment to an existing Confluence page. Accepts Markdown content which is converted to Confluence storage format (HTML).",
          inputSchema: {
            type: "object" as const,
            properties: {
              pageId: {
                type: "string",
                description: "The ID of the Confluence page to comment on.",
              },
              markdownContent: {
                type: "string",
                description: "The comment body in Markdown format. This will be converted to HTML for Confluence.",
              },
            },
            required: ["pageId", "markdownContent"],
          },
        },
        {
          name: "get_confluence_page_versions",
          description:
            "Get the version history of a Confluence page. Returns a list of versions with author, timestamp, and optional version message.",
          inputSchema: {
            type: "object" as const,
            properties: {
              pageId: {
                type: "string",
                description: "The ID of the Confluence page to retrieve version history for.",
              },
              limit: {
                type: "number",
                description: "Maximum number of versions to return (1-200, default 25).",
              },
            },
            required: ["pageId"],
          },
        },
        {
          name: "check_confluence_permissions",
          description:
            "Check whether the configured API token is valid and has the required permissions. Validates authentication, read/search access, and optionally write access to a specific page.",
          inputSchema: {
            type: "object" as const,
            properties: {
              pageId: {
                type: "string",
                description:
                  "Optional. A Confluence page ID to check write access against. If omitted, only authentication and read access are validated.",
              },
            },
            required: [],
          },
        },
        // ── Jira tools ──────────────────────────────────────────────────────
        {
          name: "jira_search",
          description:
            "Search Jira issues using a JQL (Jira Query Language) query string. Returns a list of matching issues with key details including status, assignee, priority, and description.",
          inputSchema: {
            type: "object" as const,
            properties: {
              jql: {
                type: "string",
                description:
                  'The JQL query to execute, e.g. \'project=PROJ AND status="In Progress"\' or \'assignee=currentUser() ORDER BY updated DESC\'.',
              },
              limit: {
                type: "number",
                description:
                  "Maximum number of results to return (1–100, default 25).",
              },
              startAt: {
                type: "number",
                description:
                  "Zero-based pagination offset (default 0).",
              },
            },
            required: ["jql"],
          },
        },
        {
          name: "jira_get_issue",
          description:
            "Get full details of a single Jira issue by its key (e.g. 'PROJ-123') or numeric ID. Returns summary, status, type, priority, assignee, reporter, description, labels, and timestamps.",
          inputSchema: {
            type: "object" as const,
            properties: {
              issueIdOrKey: {
                type: "string",
                description:
                  "The Jira issue key (e.g. 'PROJ-123') or numeric issue ID.",
              },
            },
            required: ["issueIdOrKey"],
          },
        },
        {
          name: "jira_create_issue",
          description:
            "Create a new Jira issue (Story, Bug, Task, etc.) in a given project. Supports setting summary, description, assignee, priority, and labels.",
          inputSchema: {
            type: "object" as const,
            properties: {
              projectKey: {
                type: "string",
                description:
                  "The key of the Jira project to create the issue in (e.g. 'PROJ').",
              },
              issueType: {
                type: "string",
                description:
                  "The issue type name, e.g. 'Story', 'Bug', 'Task', 'Epic'.",
              },
              summary: {
                type: "string",
                description: "The issue summary / title.",
              },
              description: {
                type: "string",
                description:
                  "Optional. Markdown-formatted description for the issue (supports headers, lists, bold, italic, code, links). Automatically converted to Atlassian Document Format (ADF) for Jira Cloud.",
              },
              assigneeAccountId: {
                type: "string",
                description:
                  "Optional. The Atlassian account ID of the user to assign the issue to.",
              },
              priority: {
                type: "string",
                description:
                  "Optional. Priority name, e.g. 'Highest', 'High', 'Medium', 'Low', 'Lowest'.",
              },
              labels: {
                type: "array",
                items: { type: "string" },
                description: "Optional. List of label strings to attach to the issue.",
              },
            },
            required: ["projectKey", "issueType", "summary"],
          },
        },
        {
          name: "jira_update_issue",
          description:
            "Update one or more fields on an existing Jira issue. Provide only the fields you want to change. Supports summary, description (Markdown format), assignee (accountId), priority, labels, and any other valid Jira field.",
          inputSchema: {
            type: "object" as const,
            properties: {
              issueIdOrKey: {
                type: "string",
                description:
                  "The Jira issue key (e.g. 'PROJ-123') or numeric issue ID.",
              },
              fields: {
                type: "object",
                description:
                  "An object containing the fields to update. Well-known keys: 'summary' (string), 'description' (Markdown string or null to clear), 'assignee' (accountId string or null to unassign), 'priority' (name string), 'labels' (string[]). Any other valid Jira field can also be included.",
                additionalProperties: true,
              },
            },
            required: ["issueIdOrKey", "fields"],
          },
        },
        {
          name: "jira_transition_issue",
          description:
            "Change the status of a Jira issue by performing a workflow transition. Accepts either a transition name (e.g. 'In Progress', 'Done') or a numeric transition ID. Use jira_get_issue to see the current status first.",
          inputSchema: {
            type: "object" as const,
            properties: {
              issueIdOrKey: {
                type: "string",
                description:
                  "The Jira issue key (e.g. 'PROJ-123') or numeric issue ID.",
              },
              transition: {
                type: "string",
                description:
                  "The transition name (case-insensitive, e.g. 'In Progress', 'Done', 'To Do') or the numeric transition ID. If the name is not found, an error listing available transitions is returned.",
              },
            },
            required: ["issueIdOrKey", "transition"],
          },
        },
        {
          name: "jira_get_transitions",
          description:
            "List all available workflow transitions for a Jira issue. Use this to discover valid transition names before calling jira_transition_issue.",
          inputSchema: {
            type: "object" as const,
            properties: {
              issueIdOrKey: {
                type: "string",
                description:
                  "The Jira issue key (e.g. 'PROJ-123') or numeric issue ID.",
              },
            },
            required: ["issueIdOrKey"],
          },
        },
      ],
    };
  });

  // ---------- Call Tool ----------
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "search_confluence": {
        const cql = args?.cql as string;
        const limit = (args?.limit as number) ?? 25;

        try {
          const searchResponse = await searchConfluence(client, cql, limit, config.spaceKey);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(searchResponse, null, 2),
              },
            ],
          };
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text" as const,
                text: `Error searching Confluence: ${message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "create_confluence_page": {
        const spaceKey = args?.spaceKey as string;
        const title = args?.title as string;
        const markdownContent = args?.markdownContent as string;
        const parentPageId = args?.parentPageId as string | undefined;

        try {
          const createResponse = await createConfluencePage(
            client,
            spaceKey,
            title,
            markdownContent,
            parentPageId,
            config.spaceKey
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    message: `Page "${createResponse.title}" created successfully in space "${createResponse.spaceKey}".`,
                    ...createResponse,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text" as const,
                text: `Error creating Confluence page: ${message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "get_confluence_page": {
        const pageId = args?.pageId as string;

        try {
          const pageResponse = await getConfluencePage(client, pageId, config.spaceKey);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(pageResponse, null, 2),
              },
            ],
          };
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text" as const,
                text: `Error reading Confluence page: ${message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "add_confluence_comment": {
        const pageId = args?.pageId as string;
        const markdownContent = args?.markdownContent as string;

        try {
          const commentResponse = await addConfluenceComment(
            client,
            pageId,
            markdownContent,
            config.spaceKey
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    message: `Comment added successfully to page ${commentResponse.pageId}.`,
                    ...commentResponse,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text" as const,
                text: `Error adding comment to Confluence page: ${message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "get_confluence_page_versions": {
        const pageId = args?.pageId as string;
        const limit = (args?.limit as number) ?? 25;

        try {
          const versionsResponse = await getConfluencePageVersions(
            client,
            pageId,
            limit,
            config.spaceKey
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(versionsResponse, null, 2),
              },
            ],
          };
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text" as const,
                text: `Error fetching Confluence page versions: ${message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "update_confluence_page": {
        const pageId = args?.pageId as string;
        const title = args?.title as string;
        const markdownContent = args?.markdownContent as string;

        try {
          const updateResponse = await updateConfluencePage(
            client,
            pageId,
            title,
            markdownContent,
            config.spaceKey
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    message: `Page "${updateResponse.title}" updated successfully to version ${updateResponse.version}.`,
                    ...updateResponse,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text" as const,
                text: `Error updating Confluence page: ${message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "check_confluence_permissions": {
        const pageId = args?.pageId as string | undefined;

        try {
          const permissionsResponse = await checkPermissions(client, pageId);

          const summary: string[] = [];

          if (permissionsResponse.authenticated && permissionsResponse.user) {
            summary.push(
              `✅ Authentication: Valid (User: ${permissionsResponse.user.displayName}, Email: ${permissionsResponse.user.email})`
            );
          } else {
            summary.push("❌ Authentication: Failed");
          }

          if (permissionsResponse.readAccess) {
            const spaceNames = permissionsResponse.accessibleSpaces
              .map((s) => `${s.name} (${s.key})`)
              .join(", ");
            summary.push(
              `✅ Read Access: Confirmed (Spaces: ${spaceNames || "none listed"})`
            );
          } else {
            summary.push("❌ Read Access: Not confirmed");
          }

          if (permissionsResponse.writeCheckPageId) {
            if (permissionsResponse.writeAccess === true) {
              summary.push(
                `✅ Write Access: Confirmed for page ${permissionsResponse.writeCheckPageId}`
              );
            } else {
              summary.push(
                `❌ Write Access: Not confirmed for page ${permissionsResponse.writeCheckPageId}`
              );
            }
          } else {
            summary.push(
              "ℹ️ Write Access: Not checked (no pageId provided)"
            );
          }

          if (permissionsResponse.errors.length > 0) {
            summary.push(
              `\n⚠️ Errors:\n${permissionsResponse.errors.map((e) => `  - ${e}`).join("\n")}`
            );
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    summary: summary.join("\n"),
                    ...permissionsResponse,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text" as const,
                text: `Error checking permissions: ${message}`,
              },
            ],
            isError: true,
          };
        }
      }

      // ── Jira tool handlers ────────────────────────────────────────────────

      case "jira_search": {
        const jql = args?.jql as string;
        const limit = (args?.limit as number) ?? 25;
        const startAt = (args?.startAt as number) ?? 0;

        try {
          const searchResponse = await searchJira(
            jiraClient,
            jql,
            limit,
            startAt,
            jiraConfig.projectKey
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(searchResponse, null, 2),
              },
            ],
          };
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text" as const,
                text: `Error searching Jira: ${message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "jira_get_issue": {
        const issueIdOrKey = args?.issueIdOrKey as string;

        try {
          const issue = await getJiraIssue(jiraClient, issueIdOrKey);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(issue, null, 2),
              },
            ],
          };
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text" as const,
                text: `Error getting Jira issue: ${message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "jira_create_issue": {
        const projectKey = args?.projectKey as string;
        const issueType = args?.issueType as string;
        const summary = args?.summary as string;
        const description = args?.description as string | undefined;
        const assigneeAccountId = args?.assigneeAccountId as string | undefined;
        const priority = args?.priority as string | undefined;
        const labels = args?.labels as string[] | undefined;

        try {
          const createResponse = await createJiraIssue(
            jiraClient,
            projectKey,
            issueType,
            summary,
            description,
            assigneeAccountId,
            priority,
            labels,
            jiraConfig.projectKey
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    message: `Issue "${createResponse.key}" created successfully in project "${projectKey}".`,
                    ...createResponse,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text" as const,
                text: `Error creating Jira issue: ${message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "jira_update_issue": {
        const issueIdOrKey = args?.issueIdOrKey as string;
        const fields = args?.fields as Record<string, unknown>;

        try {
          const updateResponse = await updateJiraIssue(
            jiraClient,
            issueIdOrKey,
            fields
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    message: `Issue "${updateResponse.key}" updated successfully.`,
                    ...updateResponse,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text" as const,
                text: `Error updating Jira issue: ${message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "jira_transition_issue": {
        const issueIdOrKey = args?.issueIdOrKey as string;
        const transition = args?.transition as string;

        try {
          const transitionResponse = await transitionJiraIssue(
            jiraClient,
            issueIdOrKey,
            transition
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    message: `Issue "${transitionResponse.issueKey}" transitioned to "${transitionResponse.transitionName}" successfully.`,
                    ...transitionResponse,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text" as const,
                text: `Error transitioning Jira issue: ${message}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "jira_get_transitions": {
        const issueIdOrKey = args?.issueIdOrKey as string;

        try {
          const transitions = await getJiraIssueTransitions(jiraClient, issueIdOrKey);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    issueKey: issueIdOrKey,
                    transitions,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text" as const,
                text: `Error fetching Jira transitions: ${message}`,
              },
            ],
            isError: true,
          };
        }
      }

      default:
        return {
          content: [
            {
              type: "text" as const,
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  });
}