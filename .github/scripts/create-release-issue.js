// Creates one tracking issue for a release from the release issue template.
module.exports = async ({ github, context, core, version }) => {
  const fs = require("node:fs");

  if (!version) {
    throw new Error("A release version is required");
  }

  const title = `Release v${version}`;
  const label = "release";

  try {
    await github.rest.issues.createLabel({
      ...context.repo,
      name: label,
      color: "0e8a16",
      description: "Tracks release verification and production promotion",
    });
  } catch (error) {
    // 422 means the label already exists — anything else is unexpected.
    if (error.status !== 422) throw error;
  }

  const searchResult = await github.rest.search.issuesAndPullRequests({
    q: `repo:${context.repo.owner}/${context.repo.repo} type:issue in:title "${title}"`,
  });
  const existingIssue = searchResult.data.items.find(
    (issue) => issue.title.trim().toLowerCase() === title.toLowerCase(),
  );

  if (existingIssue) {
    const hasLabel = existingIssue.labels.some((item) => (typeof item === "string" ? item : item.name) === label);
    if (!hasLabel) {
      await github.rest.issues.addLabels({
        ...context.repo,
        issue_number: existingIssue.number,
        labels: [label],
      });
    }
    core.notice(`Release issue already exists: ${existingIssue.html_url}`);
    return;
  }

  const templatePath = ".github/ISSUE_TEMPLATE/release.md";
  const rawBody = fs.readFileSync(templatePath, "utf8");

  const withoutFrontmatter = rawBody.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  if (withoutFrontmatter === rawBody) {
    throw new Error(`Failed to strip YAML frontmatter from ${templatePath}`);
  }

  const body = withoutFrontmatter.replaceAll("X.Y.Z", version);

  const { data: issue } = await github.rest.issues.create({
    ...context.repo,
    title,
    body,
    labels: [label],
  });
  core.notice(`Created release issue: ${issue.html_url}`);
};
