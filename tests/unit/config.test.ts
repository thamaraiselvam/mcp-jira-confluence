import { describe, it, expect } from "vitest";
import { loadConfig } from "../../src/config.js";

describe("config — loadConfig()", () => {
  // -------------------------------------------------------
  // Happy-path: all required variables present
  // -------------------------------------------------------
  describe("when all required environment variables are provided", () => {
    const validEnv = {
      CONFLUENCE_URL: "https://my-org.atlassian.net",
      CONFLUENCE_EMAIL: "user@example.com",
      CONFLUENCE_API_TOKEN: "super-secret-token",
    };

    it("returns a valid ConfluenceConfig object", () => {
      const config = loadConfig(validEnv);

      expect(config).toEqual({
        baseUrl: "https://my-org.atlassian.net",
        email: "user@example.com",
        apiToken: "super-secret-token",
        ignoreTlsErrors: false,
      });
    });

    it("strips trailing slashes from CONFLUENCE_URL", () => {
      const env = { ...validEnv, CONFLUENCE_URL: "https://my-org.atlassian.net///" };
      const config = loadConfig(env);

      expect(config.baseUrl).toBe("https://my-org.atlassian.net");
    });

    it("strips a single trailing slash from CONFLUENCE_URL", () => {
      const env = { ...validEnv, CONFLUENCE_URL: "https://my-org.atlassian.net/" };
      const config = loadConfig(env);

      expect(config.baseUrl).toBe("https://my-org.atlassian.net");
    });

    it("leaves CONFLUENCE_URL unchanged when there is no trailing slash", () => {
      const config = loadConfig(validEnv);

      expect(config.baseUrl).toBe("https://my-org.atlassian.net");
    });
  });

  // -------------------------------------------------------
  // Missing required variables
  // -------------------------------------------------------
  describe("when required environment variables are missing", () => {
    it("throws when CONFLUENCE_URL is missing", () => {
      const env = {
        CONFLUENCE_EMAIL: "user@example.com",
        CONFLUENCE_API_TOKEN: "token",
      };

      expect(() => loadConfig(env)).toThrowError("CONFLUENCE_URL");
    });

    it("throws when CONFLUENCE_EMAIL is missing", () => {
      const env = {
        CONFLUENCE_URL: "https://example.com",
        CONFLUENCE_API_TOKEN: "token",
      };

      expect(() => loadConfig(env)).toThrowError("CONFLUENCE_EMAIL");
    });

    it("throws when CONFLUENCE_API_TOKEN is missing", () => {
      const env = {
        CONFLUENCE_URL: "https://example.com",
        CONFLUENCE_EMAIL: "user@example.com",
      };

      expect(() => loadConfig(env)).toThrowError("CONFLUENCE_API_TOKEN");
    });

    it("throws listing ALL missing variables when none are provided", () => {
      expect(() => loadConfig({})).toThrowError(
        "Missing required environment variables: CONFLUENCE_URL or ATLASSIAN_URL, CONFLUENCE_EMAIL or ATLASSIAN_EMAIL, CONFLUENCE_API_TOKEN or ATLASSIAN_API_TOKEN"
      );
    });

    it("throws listing multiple missing variables when two are absent", () => {
      const env = {
        CONFLUENCE_URL: "https://example.com",
      };

      expect(() => loadConfig(env)).toThrowError("CONFLUENCE_EMAIL or ATLASSIAN_EMAIL, CONFLUENCE_API_TOKEN or ATLASSIAN_API_TOKEN");
    });

    it("treats an empty string as missing", () => {
      const env = {
        CONFLUENCE_URL: "",
        CONFLUENCE_EMAIL: "user@example.com",
        CONFLUENCE_API_TOKEN: "token",
      };

      expect(() => loadConfig(env)).toThrowError("CONFLUENCE_URL");
    });

    it("treats undefined value as missing", () => {
      const env: Record<string, string | undefined> = {
        CONFLUENCE_URL: undefined,
        CONFLUENCE_EMAIL: "user@example.com",
        CONFLUENCE_API_TOKEN: "token",
      };

      expect(() => loadConfig(env)).toThrowError("CONFLUENCE_URL");
    });
  });

  // -------------------------------------------------------
  // IGNORE_TLS_ERRORS parsing
  // -------------------------------------------------------
  describe("IGNORE_TLS_ERRORS parsing", () => {
    const baseEnv = {
      CONFLUENCE_URL: "https://my-org.atlassian.net",
      CONFLUENCE_EMAIL: "user@example.com",
      CONFLUENCE_API_TOKEN: "token",
    };

    it('returns ignoreTlsErrors=true when set to "true"', () => {
      const config = loadConfig({ ...baseEnv, IGNORE_TLS_ERRORS: "true" });

      expect(config.ignoreTlsErrors).toBe(true);
    });

    it('returns ignoreTlsErrors=true when set to "TRUE" (case-insensitive)', () => {
      const config = loadConfig({ ...baseEnv, IGNORE_TLS_ERRORS: "TRUE" });

      expect(config.ignoreTlsErrors).toBe(true);
    });

    it('returns ignoreTlsErrors=true when set to "True" (mixed case)', () => {
      const config = loadConfig({ ...baseEnv, IGNORE_TLS_ERRORS: "True" });

      expect(config.ignoreTlsErrors).toBe(true);
    });

    it('returns ignoreTlsErrors=true when set to "1"', () => {
      const config = loadConfig({ ...baseEnv, IGNORE_TLS_ERRORS: "1" });

      expect(config.ignoreTlsErrors).toBe(true);
    });

    it('returns ignoreTlsErrors=false when set to "false"', () => {
      const config = loadConfig({ ...baseEnv, IGNORE_TLS_ERRORS: "false" });

      expect(config.ignoreTlsErrors).toBe(false);
    });

    it('returns ignoreTlsErrors=false when set to "0"', () => {
      const config = loadConfig({ ...baseEnv, IGNORE_TLS_ERRORS: "0" });

      expect(config.ignoreTlsErrors).toBe(false);
    });

    it("returns ignoreTlsErrors=false when not set (undefined)", () => {
      const config = loadConfig(baseEnv);

      expect(config.ignoreTlsErrors).toBe(false);
    });

    it('returns ignoreTlsErrors=false when set to an empty string', () => {
      const config = loadConfig({ ...baseEnv, IGNORE_TLS_ERRORS: "" });

      expect(config.ignoreTlsErrors).toBe(false);
    });

    it('returns ignoreTlsErrors=false for arbitrary string like "yes"', () => {
      const config = loadConfig({ ...baseEnv, IGNORE_TLS_ERRORS: "yes" });

      expect(config.ignoreTlsErrors).toBe(false);
    });

    it('returns ignoreTlsErrors=false for "2"', () => {
      const config = loadConfig({ ...baseEnv, IGNORE_TLS_ERRORS: "2" });

      expect(config.ignoreTlsErrors).toBe(false);
    });
  });

  // -------------------------------------------------------
  // Return type shape
  // -------------------------------------------------------
  describe("return type shape", () => {
    const validEnv = {
      CONFLUENCE_URL: "https://my-org.atlassian.net",
      CONFLUENCE_EMAIL: "user@example.com",
      CONFLUENCE_API_TOKEN: "super-secret-token",
    };

    it("returns an object with exactly five keys", () => {
      const config = loadConfig(validEnv);
      const keys = Object.keys(config).sort();

      expect(keys).toEqual(["apiToken", "baseUrl", "email", "ignoreTlsErrors", "spaceKey"]);
    });

    it("returns string types for baseUrl, email, and apiToken", () => {
      const config = loadConfig(validEnv);

      expect(typeof config.baseUrl).toBe("string");
      expect(typeof config.email).toBe("string");
      expect(typeof config.apiToken).toBe("string");
    });

    it("returns boolean type for ignoreTlsErrors", () => {
      const config = loadConfig(validEnv);

      expect(typeof config.ignoreTlsErrors).toBe("boolean");
    });
  });

  // -------------------------------------------------------
  // Priority fallback: ATLASSIAN_* variables
  // -------------------------------------------------------
  describe("when using ATLASSIAN_* common credentials", () => {
    const atlassianEnv = {
      ATLASSIAN_URL: "https://example.atlassian.net",
      ATLASSIAN_EMAIL: "user@example.com",
      ATLASSIAN_API_TOKEN: "common-token-123",
      CONFLUENCE_SPACE_KEY: "TEST",
    };

    it("loads Confluence config from ATLASSIAN_* variables", () => {
      const config = loadConfig(atlassianEnv);

      expect(config).toEqual({
        baseUrl: "https://example.atlassian.net",
        email: "user@example.com",
        apiToken: "common-token-123",
        ignoreTlsErrors: false,
        spaceKey: "TEST",
      });
    });

    it("CONFLUENCE_URL overrides ATLASSIAN_URL", () => {
      const env = {
        ...atlassianEnv,
        CONFLUENCE_URL: "https://confluence-specific.atlassian.net",
      };
      const config = loadConfig(env);

      expect(config.baseUrl).toBe("https://confluence-specific.atlassian.net");
    });

    it("CONFLUENCE_EMAIL overrides ATLASSIAN_EMAIL", () => {
      const env = {
        ...atlassianEnv,
        CONFLUENCE_EMAIL: "confluence@example.com",
      };
      const config = loadConfig(env);

      expect(config.email).toBe("confluence@example.com");
    });

    it("CONFLUENCE_API_TOKEN overrides ATLASSIAN_API_TOKEN", () => {
      const env = {
        ...atlassianEnv,
        CONFLUENCE_API_TOKEN: "confluence-token",
      };
      const config = loadConfig(env);

      expect(config.apiToken).toBe("confluence-token");
    });
  });
});

describe("config — loadJiraConfig()", () => {
  // -------------------------------------------------------
  // Priority fallback: ATLASSIAN_* variables
  // -------------------------------------------------------
  describe("when using ATLASSIAN_* common credentials", () => {
    const atlassianEnv = {
      ATLASSIAN_URL: "https://example.atlassian.net",
      ATLASSIAN_EMAIL: "user@example.com",
      ATLASSIAN_API_TOKEN: "common-token-123",
      JIRA_PROJECT_KEY: "PROJ",
    };

    it("loads Jira config from ATLASSIAN_* variables", async () => {
      const { loadJiraConfig } = await import("../../src/config.js");
      const config = loadJiraConfig(atlassianEnv);

      expect(config).toEqual({
        baseUrl: "https://example.atlassian.net",
        email: "user@example.com",
        apiToken: "common-token-123",
        ignoreTlsErrors: false,
        projectKey: "PROJ",
      });
    });

    it("JIRA_URL overrides ATLASSIAN_URL", async () => {
      const { loadJiraConfig } = await import("../../src/config.js");
      const env = {
        ...atlassianEnv,
        JIRA_URL: "https://jira-specific.atlassian.net",
      };
      const config = loadJiraConfig(env);

      expect(config.baseUrl).toBe("https://jira-specific.atlassian.net");
    });

    it("JIRA_EMAIL overrides ATLASSIAN_EMAIL", async () => {
      const { loadJiraConfig } = await import("../../src/config.js");
      const env = {
        ...atlassianEnv,
        JIRA_EMAIL: "jira@example.com",
      };
      const config = loadJiraConfig(env);

      expect(config.email).toBe("jira@example.com");
    });

    it("JIRA_API_TOKEN overrides ATLASSIAN_API_TOKEN", async () => {
      const { loadJiraConfig } = await import("../../src/config.js");
      const env = {
        ...atlassianEnv,
        JIRA_API_TOKEN: "jira-token",
      };
      const config = loadJiraConfig(env);

      expect(config.apiToken).toBe("jira-token");
    });
  });

  // -------------------------------------------------------
  // Happy-path: using Jira-specific variables
  // -------------------------------------------------------
  describe("when Jira-specific environment variables are provided", () => {
    const jiraEnv = {
      JIRA_URL: "https://jira.example.com",
      JIRA_EMAIL: "jira@example.com",
      JIRA_API_TOKEN: "jira-token-123",
      JIRA_PROJECT_KEY: "PROJ",
    };

    it("returns a valid JiraConfig object", async () => {
      const { loadJiraConfig } = await import("../../src/config.js");
      const config = loadJiraConfig(jiraEnv);

      expect(config).toEqual({
        baseUrl: "https://jira.example.com",
        email: "jira@example.com",
        apiToken: "jira-token-123",
        ignoreTlsErrors: false,
        projectKey: "PROJ",
      });
    });

    it("strips trailing slashes from JIRA_URL", async () => {
      const { loadJiraConfig } = await import("../../src/config.js");
      const env = { ...jiraEnv, JIRA_URL: "https://jira.example.com///" };
      const config = loadJiraConfig(env);

      expect(config.baseUrl).toBe("https://jira.example.com");
    });

    it("sets projectKey to undefined when not provided", async () => {
      const { loadJiraConfig } = await import("../../src/config.js");
      const env = { ...jiraEnv };
      delete env.JIRA_PROJECT_KEY;
      const config = loadJiraConfig(env);

      expect(config.projectKey).toBeUndefined();
    });

    it("sets projectKey to undefined when empty string", async () => {
      const { loadJiraConfig } = await import("../../src/config.js");
      const env = { ...jiraEnv, JIRA_PROJECT_KEY: "" };
      const config = loadJiraConfig(env);

      expect(config.projectKey).toBeUndefined();
    });

    it("sets projectKey to undefined when only whitespace", async () => {
      const { loadJiraConfig } = await import("../../src/config.js");
      const env = { ...jiraEnv, JIRA_PROJECT_KEY: "   " };
      const config = loadJiraConfig(env);

      expect(config.projectKey).toBeUndefined();
    });
  });

  // -------------------------------------------------------
  // Fallback to Confluence variables
  // -------------------------------------------------------
  describe("when Jira variables are missing, falls back to Confluence vars", () => {
    const confluenceEnv = {
      CONFLUENCE_URL: "https://confluence.example.com",
      CONFLUENCE_EMAIL: "confluence@example.com",
      CONFLUENCE_API_TOKEN: "confluence-token-456",
    };

    it("uses CONFLUENCE_URL when JIRA_URL is not set", async () => {
      const { loadJiraConfig } = await import("../../src/config.js");
      const config = loadJiraConfig(confluenceEnv);

      expect(config.baseUrl).toBe("https://confluence.example.com");
    });

    it("uses CONFLUENCE_EMAIL when JIRA_EMAIL is not set", async () => {
      const { loadJiraConfig } = await import("../../src/config.js");
      const config = loadJiraConfig(confluenceEnv);

      expect(config.email).toBe("confluence@example.com");
    });

    it("uses CONFLUENCE_API_TOKEN when JIRA_API_TOKEN is not set", async () => {
      const { loadJiraConfig } = await import("../../src/config.js");
      const config = loadJiraConfig(confluenceEnv);

      expect(config.apiToken).toBe("confluence-token-456");
    });
  });

  // -------------------------------------------------------
  // Missing required variables
  // -------------------------------------------------------
  describe("when required environment variables are missing", () => {
    it("throws an error when JIRA_URL and CONFLUENCE_URL are missing", async () => {
      const { loadJiraConfig } = await import("../../src/config.js");
      const env = {
        JIRA_EMAIL: "user@example.com",
        JIRA_API_TOKEN: "token",
      };

      expect(() => loadJiraConfig(env)).toThrow(
        "Missing required environment variables for Jira: JIRA_URL or ATLASSIAN_URL"
      );
    });

    it("throws an error when JIRA_EMAIL and CONFLUENCE_EMAIL are missing", async () => {
      const { loadJiraConfig } = await import("../../src/config.js");
      const env = {
        JIRA_URL: "https://jira.example.com",
        JIRA_API_TOKEN: "token",
      };

      expect(() => loadJiraConfig(env)).toThrow(
        "Missing required environment variables for Jira: JIRA_EMAIL or ATLASSIAN_EMAIL"
      );
    });

    it("throws an error when JIRA_API_TOKEN and CONFLUENCE_API_TOKEN are missing", async () => {
      const { loadJiraConfig } = await import("../../src/config.js");
      const env = {
        JIRA_URL: "https://jira.example.com",
        JIRA_EMAIL: "user@example.com",
      };

      expect(() => loadJiraConfig(env)).toThrow(
        "Missing required environment variables for Jira: JIRA_API_TOKEN or ATLASSIAN_API_TOKEN"
      );
    });

    it("throws an error listing all missing variables", async () => {
      const { loadJiraConfig } = await import("../../src/config.js");
      const env = {};

      expect(() => loadJiraConfig(env)).toThrow(
        "Missing required environment variables for Jira: JIRA_URL or ATLASSIAN_URL, JIRA_EMAIL or ATLASSIAN_EMAIL, JIRA_API_TOKEN or ATLASSIAN_API_TOKEN"
      );
    });
  });

  // -------------------------------------------------------
  // IGNORE_TLS_ERRORS flag
  // -------------------------------------------------------
  describe("IGNORE_TLS_ERRORS flag", () => {
    const baseEnv = {
      JIRA_URL: "https://jira.example.com",
      JIRA_EMAIL: "user@example.com",
      JIRA_API_TOKEN: "token",
    };

    it('returns ignoreTlsErrors=true when set to "true"', async () => {
      const { loadJiraConfig } = await import("../../src/config.js");
      const config = loadJiraConfig({ ...baseEnv, IGNORE_TLS_ERRORS: "true" });

      expect(config.ignoreTlsErrors).toBe(true);
    });

    it('returns ignoreTlsErrors=true when set to "TRUE"', async () => {
      const { loadJiraConfig } = await import("../../src/config.js");
      const config = loadJiraConfig({ ...baseEnv, IGNORE_TLS_ERRORS: "TRUE" });

      expect(config.ignoreTlsErrors).toBe(true);
    });

    it('returns ignoreTlsErrors=true when set to "1"', async () => {
      const { loadJiraConfig } = await import("../../src/config.js");
      const config = loadJiraConfig({ ...baseEnv, IGNORE_TLS_ERRORS: "1" });

      expect(config.ignoreTlsErrors).toBe(true);
    });

    it('returns ignoreTlsErrors=false when set to "false"', async () => {
      const { loadJiraConfig } = await import("../../src/config.js");
      const config = loadJiraConfig({ ...baseEnv, IGNORE_TLS_ERRORS: "false" });

      expect(config.ignoreTlsErrors).toBe(false);
    });

    it("returns ignoreTlsErrors=false when not set", async () => {
      const { loadJiraConfig } = await import("../../src/config.js");
      const config = loadJiraConfig(baseEnv);

      expect(config.ignoreTlsErrors).toBe(false);
    });
  });
});