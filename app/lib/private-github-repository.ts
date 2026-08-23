type GithubRef = { object: { sha: string } };
type GithubCommit = { tree: { sha: string } };
type GithubBlob = { sha: string };
type GithubTree = { sha: string };
type GithubCreatedCommit = { sha: string };

export function privateGithubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Ivy-Job-Radar-CV-Prebuilder",
  };
}

export async function privateGithubJson<T>(
  url: string,
  token: string,
  init?: RequestInit,
  allowedStatuses: number[] = [],
) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { ...privateGithubHeaders(token), ...(init?.headers ?? {}) },
  });
  if (!response.ok && !allowedStatuses.includes(response.status)) {
    const error = new Error(`GitHub request failed with ${response.status}.`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  if (response.status === 204 || allowedStatuses.includes(response.status) && !response.ok) {
    return { status: response.status } as T;
  }
  return response.json() as Promise<T>;
}

function decodeBase64Utf8(value: string) {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export async function readPrivateRepositoryTextFile(
  apiRoot: string,
  path: string,
  ref: string,
  token: string,
) {
  const payload = await privateGithubJson<{ content?: string; encoding?: string; sha?: string }>(
    `${apiRoot}/contents/${path}?ref=${encodeURIComponent(ref)}`,
    token,
  );
  if (payload.encoding !== "base64" || !payload.content) {
    throw new Error("Private repository file content is unavailable.");
  }
  return { text: decodeBase64Utf8(payload.content), sha: payload.sha ?? "" };
}

export async function readOptionalPrivateRepositoryTextFile(
  apiRoot: string,
  path: string,
  ref: string,
  token: string,
) {
  const response = await fetch(`${apiRoot}/contents/${path}?ref=${encodeURIComponent(ref)}`, {
    cache: "no-store",
    headers: privateGithubHeaders(token),
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const error = new Error(`GitHub request failed with ${response.status}.`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  const payload = await response.json() as { content?: string; encoding?: string; sha?: string };
  if (payload.encoding !== "base64" || !payload.content) return null;
  return { text: decodeBase64Utf8(payload.content), sha: payload.sha ?? "" };
}

export async function getPrivateRepositoryMainCommit(apiRoot: string, token: string) {
  const main = await privateGithubJson<GithubRef>(`${apiRoot}/git/ref/heads/main`, token);
  const commit = await privateGithubJson<GithubCommit>(`${apiRoot}/git/commits/${main.object.sha}`, token);
  return { commitSha: main.object.sha, treeSha: commit.tree.sha };
}

export async function commitPrivateRepositoryFiles(input: {
  apiRoot: string;
  token: string;
  files: Record<string, string>;
  message: string;
}) {
  const main = await getPrivateRepositoryMainCommit(input.apiRoot, input.token);
  const blobs = await Promise.all(Object.entries(input.files).map(async ([path, content]) => {
    const blob = await privateGithubJson<GithubBlob>(`${input.apiRoot}/git/blobs`, input.token, {
      method: "POST",
      body: JSON.stringify({ content, encoding: "utf-8" }),
    });
    return { path, mode: "100644", type: "blob", sha: blob.sha };
  }));
  const tree = await privateGithubJson<GithubTree>(`${input.apiRoot}/git/trees`, input.token, {
    method: "POST",
    body: JSON.stringify({ base_tree: main.treeSha, tree: blobs }),
  });
  const commit = await privateGithubJson<GithubCreatedCommit>(`${input.apiRoot}/git/commits`, input.token, {
    method: "POST",
    body: JSON.stringify({ message: input.message, tree: tree.sha, parents: [main.commitSha] }),
  });
  await privateGithubJson(`${input.apiRoot}/git/refs/heads/main`, input.token, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  return commit.sha;
}
