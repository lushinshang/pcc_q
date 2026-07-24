import { githubPagesBase } from "../../config/pagesBase";

describe("REQ-F-004 GitHub Pages base path", () => {
  it("BASEPATH-T-001 supports project Pages and root/custom-domain deployments", () => {
    expect(githubPagesBase("owner/project-name")).toBe("/project-name/");
    expect(githubPagesBase(undefined)).toBe("/");
    expect(githubPagesBase("owner/project-name", "/")).toBe("/");
    expect(githubPagesBase("owner/project-name", "/nested/")).toBe("/nested/");
    expect(() =>
      githubPagesBase("owner/project-name", "https://evil.example/"),
    ).toThrow(/同源絕對目錄路徑/);
    expect(() => githubPagesBase("owner/project-name", "/../")).toThrow(
      /同源絕對目錄路徑/,
    );
  });
});
