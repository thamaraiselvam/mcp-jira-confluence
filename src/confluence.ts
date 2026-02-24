import { AxiosInstance, AxiosError } from "axios";
import { convertMarkdownToHtml } from "./markdown.js";

export interface PermissionCheck {
  authenticated: boolean;
  user: {
    displayName: string;
    email: string;
    accountId: string;
  } | null;
  readAccess: boolean;
  accessibleSpaces: { key: string; name: string }[];
  writeAccess: boolean | null;
  writeCheckPageId: string | null;
  errors: string[];
}

export async function checkPermissions(
  client: AxiosInstance,
  pageId?: string
): Promise<PermissionCheck> {
  const result: PermissionCheck = {
    authenticated: false,
    user: null,
    readAccess: false,
    accessibleSpaces: [],
    writeAccess: pageId ? null : null,
    writeCheckPageId: pageId ?? null,
    errors: [],
  };

  // Step 1: Validate authentication via /wiki/rest/api/user/current
  try {
    const userResponse = await client.get("/wiki/rest/api/user/current");
    const userData = userResponse.data;

    result.authenticated = true;
    result.user = {
      displayName: userData.displayName ?? "Unknown",
      email: userData.email ?? "Unknown",
      accountId: userData.accountId ?? userData.userKey ?? "Unknown",
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const status = (error as AxiosError)?.response?.status;
    if (status === 401) {
      result.errors.push("Authentication failed: Invalid email or API token (401 Unauthorized)");
    } else if (status === 403) {
      result.errors.push("Authentication failed: Access denied (403 Forbidden)");
    } else {
      result.errors.push(`Authentication check failed: ${message}`);
    }
    return result;
  }

  // Step 2: Validate read/search access via /wiki/rest/api/space
  try {
    const spaceResponse = await client.get("/wiki/rest/api/space", {
      params: { limit: 5 },
    });

    const spaces = spaceResponse.data.results ?? [];
    result.readAccess = true;
    result.accessibleSpaces = spaces.map(
      (s: { key: string; name: string }) => ({
        key: s.key,
        name: s.name,
      })
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push(`Read access check failed: ${message}`);
  }

  // Step 3: Optionally validate write access to a specific page
  if (pageId && pageId.trim().length > 0) {
    try {
      const pageResponse = await client.get(
        `/wiki/rest/api/content/${pageId}`,
        {
          params: { expand: "version" },
        }
      );

      const version = pageResponse.data.version?.number;
      if (typeof version === "number") {
        result.writeAccess = true;
      } else {
        result.writeAccess = false;
        result.errors.push(`Page ${pageId} exists but version info is unavailable`);
      }
    } catch (error: unknown) {
      result.writeAccess = false;
      const status = (error as AxiosError)?.response?.status;
      if (status === 404) {
        result.errors.push(`Write access check failed: Page ${pageId} not found (404)`);
      } else if (status === 403) {
        result.errors.push(`Write access check failed: No permission to access page ${pageId} (403 Forbidden)`);
      } else {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`Write access check failed: ${message}`);
      }
    }
  }

  return result;
}

export interface SearchResult {
  id: string;
  title: string;
  url: string;
}

export interface SearchResponse {
  results: SearchResult[];
  totalSize: number;
}

export interface CreatePageResponse {
  id: string;
  title: string;
  spaceKey: string;
  version: number;
  url: string;
}

export interface AddCommentResponse {
  id: string;
  pageId: string;
  url: string;
}

export interface PageVersion {
  number: number;
  when: string;
  by: {
    displayName: string;
    email: string;
  } | null;
  message: string;
}

export interface PageVersionsResponse {
  pageId: string;
  versions: PageVersion[];
  totalSize: number;
}

export interface GetPageResponse {
  id: string;
  title: string;
  spaceKey: string;
  version: number;
  url: string;
  content: string;
}

export interface UpdateResponse {
  id: string;
  title: string;
  version: number;
  url: string;
}

export async function createConfluencePage(
  client: AxiosInstance,
  spaceKey: string,
  title: string,
  markdownContent: string,
  parentPageId?: string,
  configuredSpaceKey?: string
): Promise<CreatePageResponse> {
  if (!spaceKey || spaceKey.trim().length === 0) {
    throw new Error("Space key must not be empty");
  }

  if (!title || title.trim().length === 0) {
    throw new Error("Title must not be empty");
  }

  // Space-scoping guard — reject creation in a space other than the configured one
  if (configuredSpaceKey && configuredSpaceKey.trim().length > 0) {
    if (spaceKey.trim() !== configuredSpaceKey.trim()) {
      throw new Error(
        `Cannot create page in space "${spaceKey}" — this server is scoped to space "${configuredSpaceKey}". Creation rejected.`
      );
    }
  }

  const htmlContent = convertMarkdownToHtml(markdownContent);

  const payload: Record<string, unknown> = {
    type: "page",
    title,
    space: { key: spaceKey },
    body: {
      storage: {
        value: htmlContent,
        representation: "storage",
      },
    },
  };

  if (parentPageId && parentPageId.trim().length > 0) {
    payload.ancestors = [{ id: parentPageId }];
  }

  const response = await client.post("/wiki/rest/api/content", payload);

  const data = response.data;
  const baseUrl = client.defaults.baseURL ?? "";

  return {
    id: data.id,
    title: data.title,
    spaceKey: data.space?.key ?? spaceKey,
    version: data.version?.number ?? 1,
    url: `${baseUrl}/wiki${data._links?.webui ?? ""}`,
  };
}

export async function addConfluenceComment(
  client: AxiosInstance,
  pageId: string,
  markdownContent: string,
  spaceKey?: string
): Promise<AddCommentResponse> {
  if (!pageId || pageId.trim().length === 0) {
    throw new Error("Page ID must not be empty");
  }

  if (!markdownContent || markdownContent.trim().length === 0) {
    throw new Error("Comment content must not be empty");
  }

  // Space-scoping guard — fetch the page first to verify its space
  if (spaceKey && spaceKey.trim().length > 0) {
    const pageResponse = await client.get(`/wiki/rest/api/content/${pageId}`, {
      params: { expand: "space" },
    });
    const pageSpaceKey: string | undefined = pageResponse.data.space?.key;
    if (pageSpaceKey !== spaceKey) {
      throw new Error(
        `Page ${pageId} belongs to space "${pageSpaceKey ?? "unknown"}" but this server is scoped to space "${spaceKey}". Comment rejected.`
      );
    }
  }

  const htmlContent = convertMarkdownToHtml(markdownContent);

  const payload = {
    type: "comment",
    container: { id: pageId, type: "page" },
    body: {
      storage: {
        value: htmlContent,
        representation: "storage",
      },
    },
  };

  const response = await client.post("/wiki/rest/api/content", payload);

  const data = response.data;
  const baseUrl = client.defaults.baseURL ?? "";

  return {
    id: data.id,
    pageId,
    url: `${baseUrl}/wiki${data._links?.webui ?? ""}`,
  };
}

export async function getConfluencePageVersions(
  client: AxiosInstance,
  pageId: string,
  limit: number = 25,
  spaceKey?: string
): Promise<PageVersionsResponse> {
  if (!pageId || pageId.trim().length === 0) {
    throw new Error("Page ID must not be empty");
  }

  if (limit < 1 || limit > 200) {
    throw new Error("Limit must be between 1 and 200");
  }

  // Space-scoping guard — verify the page belongs to the configured space
  if (spaceKey && spaceKey.trim().length > 0) {
    const pageResponse = await client.get(`/wiki/rest/api/content/${pageId}`, {
      params: { expand: "space" },
    });
    const pageSpaceKey: string | undefined = pageResponse.data.space?.key;
    if (pageSpaceKey !== spaceKey) {
      throw new Error(
        `Page ${pageId} belongs to space "${pageSpaceKey ?? "unknown"}" but this server is scoped to space "${spaceKey}". Read rejected.`
      );
    }
  }

  const response = await client.get(`/wiki/rest/api/content/${pageId}/version`, {
    params: { limit },
  });

  const data = response.data;

  const versions: PageVersion[] = (data.results ?? []).map(
    (v: {
      number: number;
      when?: string;
      by?: { displayName?: string; email?: string };
      message?: string;
    }) => ({
      number: v.number,
      when: v.when ?? "",
      by: v.by
        ? {
            displayName: v.by.displayName ?? "Unknown",
            email: v.by.email ?? "Unknown",
          }
        : null,
      message: v.message ?? "",
    })
  );

  return {
    pageId,
    versions,
    totalSize: data.size ?? versions.length,
  };
}

export async function getConfluencePage(
  client: AxiosInstance,
  pageId: string,
  spaceKey?: string
): Promise<GetPageResponse> {
  if (!pageId || pageId.trim().length === 0) {
    throw new Error("Page ID must not be empty");
  }

  const response = await client.get(`/wiki/rest/api/content/${pageId}`, {
    params: {
      expand: "body.storage,version,space",
    },
  });

  const data = response.data;

  // Space-scoping guard — reject reads of pages outside the configured space
  if (spaceKey && spaceKey.trim().length > 0) {
    const pageSpaceKey: string | undefined = data.space?.key;
    if (pageSpaceKey !== spaceKey) {
      throw new Error(
        `Page ${pageId} belongs to space "${pageSpaceKey ?? "unknown"}" but this server is scoped to space "${spaceKey}". Read rejected.`
      );
    }
  }

  const baseUrl = client.defaults.baseURL ?? "";

  return {
    id: data.id,
    title: data.title,
    spaceKey: data.space?.key ?? "unknown",
    version: data.version?.number ?? 0,
    url: `${baseUrl}/wiki${data._links?.webui ?? ""}`,
    content: data.body?.storage?.value ?? "",
  };
}

export async function searchConfluence(
  client: AxiosInstance,
  cql: string,
  limit: number = 25,
  spaceKey?: string
): Promise<SearchResponse> {
  if (!cql || cql.trim().length === 0) {
    throw new Error("CQL query string must not be empty");
  }

  if (limit < 1 || limit > 100) {
    throw new Error("Limit must be between 1 and 100");
  }

  // Auto-scope to configured space if spaceKey is set and not already in the CQL
  let scopedCql = cql;
  if (spaceKey && !/\bspace\s*=/i.test(cql)) {
    scopedCql = `space="${spaceKey}" AND ${cql}`;
  }

  const response = await client.get("/wiki/rest/api/content/search", {
    params: {
      cql: scopedCql,
      limit,
    },
  });

  const data = response.data;
  const baseUrl = client.defaults.baseURL ?? "";

  const results: SearchResult[] = (data.results ?? []).map(
    (page: { id: string; title: string; _links?: { webui?: string } }) => ({
      id: page.id,
      title: page.title,
      url: `${baseUrl}/wiki${page._links?.webui ?? ""}`,
    })
  );

  return {
    results,
    totalSize: data.totalSize ?? results.length,
  };
}

export async function updateConfluencePage(
  client: AxiosInstance,
  pageId: string,
  title: string,
  markdownContent: string,
  spaceKey?: string
): Promise<UpdateResponse> {
  if (!pageId || pageId.trim().length === 0) {
    throw new Error("Page ID must not be empty");
  }

  if (!title || title.trim().length === 0) {
    throw new Error("Title must not be empty");
  }

  // Step 1: Fetch the current page to get the version number (and space, for scope guard)
  const currentPage = await client.get(
    `/wiki/rest/api/content/${pageId}`,
    {
      params: {
        expand: "version,space",
      },
    }
  );

  // Step 1a: Enforce space-scoping guard — reject updates to pages outside the configured space
  if (spaceKey && spaceKey.trim().length > 0) {
    const pageSpaceKey: string | undefined = currentPage.data.space?.key;
    if (pageSpaceKey !== spaceKey) {
      throw new Error(
        `Page ${pageId} belongs to space "${pageSpaceKey ?? "unknown"}" but this server is scoped to space "${spaceKey}". Update rejected to prevent unintended modification.`
      );
    }
  }

  const currentVersion: number = currentPage.data.version?.number;

  if (typeof currentVersion !== "number") {
    throw new Error(
      `Unable to determine current version for page ${pageId}`
    );
  }

  const newVersion = currentVersion + 1;

  // Step 2: Convert Markdown to HTML (Confluence storage format)
  const htmlContent = convertMarkdownToHtml(markdownContent);

  // Step 3: PUT the updated page with incremented version
  const updatePayload = {
    id: pageId,
    type: "page",
    title,
    version: {
      number: newVersion,
    },
    body: {
      storage: {
        value: htmlContent,
        representation: "storage",
      },
    },
  };

  const updateResponse = await client.put(
    `/wiki/rest/api/content/${pageId}`,
    updatePayload
  );

  const updatedData = updateResponse.data;
  const baseUrl = client.defaults.baseURL ?? "";

  return {
    id: updatedData.id,
    title: updatedData.title,
    version: updatedData.version?.number ?? newVersion,
    url: `${baseUrl}/wiki${updatedData._links?.webui ?? ""}`,
  };
}