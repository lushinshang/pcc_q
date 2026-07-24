export function githubPagesBase(
  repositorySlug = process.env.GITHUB_REPOSITORY,
  explicitBasePath = process.env.PAGES_BASE_PATH,
): string {
  if (explicitBasePath) {
    if (
      explicitBasePath.includes("..") ||
      !/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(explicitBasePath)
    ) {
      throw new Error("PAGES_BASE_PATH 必須是同源絕對目錄路徑");
    }
    return explicitBasePath;
  }
  const repository = repositorySlug?.split("/")[1];
  return repository ? `/${repository}/` : "/";
}
