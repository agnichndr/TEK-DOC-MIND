export function parseGitHubRepositoryUrl(value: string) {
  const url = new URL(value);
  const [owner, rawName] = url.pathname
    .replace(/\/+$/, "")
    .split("/")
    .filter(Boolean);
  const name = rawName.endsWith(".git") ? rawName.slice(0, -4) : rawName;

  if (!owner || !name) {
    throw new Error("Invalid GitHub repository URL.");
  }

  return {
    owner,
    name,
    url: `https://github.com/${owner}/${name}`,
  };
}
