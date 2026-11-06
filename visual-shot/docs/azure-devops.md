# Publish visual evidence to Azure DevOps

Azure DevOps has a native pull request attachment API. `visual-shot ado publish`
uploads a PNG to that PR and can create or update one managed Markdown comment.
Use the native attachment when a PR policy requires a PR attachment. A Boards
work item attachment is a different store and does not meet that requirement.

The commands below ship in `visual-shot` 0.12.0. The release is published when
that version merges to `main`. Publishing targets Azure DevOps Services cloud
organizations. Azure DevOps Server URLs are not supported by this adapter.
The PR must already exist. For a new PR, create a draft, publish its evidence,
update its description, and then mark it ready for review.

## Choose a publishing path

### 1. MCP-only: upload through Work Item Tracking

Use this when the connected Azure DevOps MCP server exposes the required tools
and no native PR attachment is required:

Enable the required write tools in the MCP connection. The caller needs work
item attachment permissions and **Contribute to pull requests**. A read-only
connection cannot publish evidence even when it can inspect a PR.

1. Capture the PNG and create the exact upload payload:

   ```bash
   npx visual-shot --url "$APP_URL" --out preview.png --json
   npx visual-shot ado prepare preview.png --project "My Project" \
     --out ado-attachment.json --json
   ```

   `ado-attachment.json` contains exactly `{ "project", "fileName", "content" }`;
   `content` is the PNG as base64. The command prints only a summary to stdout.
   It does not start a browser, read a token, or make a network request. It
   rejects PNGs larger than the helper's 4 MiB limit. This is not the Azure
   service limit. Base64 adds about one third to the file size, and an MCP
   client's tool argument limit can be smaller. Crop the capture or use the
   publisher pipeline if the client cannot transfer the payload intact.

2. Discover the current MCP schemas, then call
   `wit_work_item_attachment_upload` with the project's name and the base64
   `content` from the payload. Use the returned attachment URL in a PR comment
   created or updated with the available repository tools. If the PR already
   has a linked work item and you want the image there too, use
   `wit_work_item_attachment_link` for that known work item.

   Pass the JSON payload object through the client's file and tool
   orchestration facilities. `content` must contain the complete base64 data,
   not a file path or a placeholder. Reuse a successful upload's returned URL
   if posting the comment fails, instead of uploading another copy.

   MCP tool names and schemas vary by server version. Discover them before
   calling; do not infer argument names from this example. MCP credentials stay
   inside the MCP server and are not available to the local CLI. An MCP tool
   call also cannot run arbitrary REST requests or pass a local shell path as
   an image URL.

3. Open the PR and confirm the image renders for reviewers. Work Item Tracking
   attachment permissions and lifecycle apply. This path does **not** create a
   native PR attachment and will not satisfy a native-attachment-only policy.

### 2. Queue the checked-in Azure Pipelines publisher

Use [`../azure-pipelines.yml`](../azure-pipelines.yml) when the MCP server can
queue pipelines but cannot upload binary data. The pipeline captures the URL
from an Azure Pipelines agent, then publishes the image as a native PR
attachment with `System.AccessToken`.

Before using it:

- Add this YAML as a pipeline and set its default branch to protected `main`.
  Protect the YAML and allow only trusted maintainers to edit or queue this
  publisher. It uses `trigger: none`, `pr: none`, and `checkout: none`; never run
  a PR branch version of the publisher.
- Create an admin-controlled variable group named
  `visual-shot-ado-publisher`, authorized only for this pipeline, with
  `VISUAL_PREVIEW_ORIGIN` set to the exact expected preview origin, for example
  `https://preview.example.com`. Do not set it from a run parameter.
- Enable **Limit variables that can be set at queue time** and leave
  `VISUAL_PREVIEW_ORIGIN` unavailable for queue-time overrides. Variable group
  authorization alone does not stop a caller from supplying run variables.
- The pipeline agent must be able to reach that preview URL. A hosted agent
  cannot reach a developer's `localhost`. The example expects a preview that
  needs no interactive sign-in. For an authenticated local capture, use
  `visual-shot --storage-state` and the MCP upload path instead.
- Grant users permission to queue this pipeline. Grant its project Build
  Service identity the Azure Repos permission to contribute to pull requests.
  Map `System.AccessToken` only into the publish step, as shown in the YAML.
  The job declares `uses.repositories: [self]` to authorize its repository
  without checking out code when repository protection is enabled.
- Discover the pipeline MCP tool and its schema before queueing. Newer local MCP
  servers use `pipelines_write` with `action: run_pipeline`; other server
  versions may expose `pipelines_run_pipeline`. Use the discovered schema and
  send only string template-parameter values for `pullRequestId` and
  `screenshotUrl`. Do not try to pass image bytes through pipeline parameters.

For a server exposing `pipelines_write`, the queue arguments look like this:

```json
{
  "action": "run_pipeline",
  "project": "My Project",
  "pipelineId": 7,
  "resources": { "repositories": { "self": { "refName": "refs/heads/main" } } },
  "templateParameters": {
    "pullRequestId": "123",
    "screenshotUrl": "https://preview.example.com/pr/123"
  }
}
```

Use the returned run ID with the discovered pipeline status and log tools.
Require a successful publish step, then read its `attachmentUrl` and `markdown`
from the JSON result. The example posts the image in a managed PR comment.

The capture step checks that `screenshotUrl` is an HTTP or HTTPS URL with no
credentials and that its origin exactly matches the protected
`VISUAL_PREVIEW_ORIGIN`, before launching Chromium. Parameters are passed
through environment variables, with dollar signs escaped at compile time so
caller values cannot expand Azure `$(...)` macros. The pipeline does not
evaluate parameter text as shell code. It takes the target repository ID from trusted
`Build.Repository.ID` metadata.
The origin check covers the starting URL. It does not restrict redirects,
subresources, or browser network access. Capture trusted previews on an isolated
agent, and do not put application credentials in the publisher variable group.

Do not give the pipeline arbitrary PR shell commands, interpolate user values
into script bodies, or let a PR author modify the publisher definition. No
personal PAT or Azure CLI login is needed on the caller's machine.

### 3. Run `ado publish` with an OAuth bearer token

Use this when the local environment or a trusted pipeline already has a
short-lived Azure DevOps OAuth bearer token in an environment variable. The
CLI uses the native REST upload; it does not use `az` or obtain credentials.
The native uploader accepts PNGs up to 20 MiB. This helper limit is separate
from the 4 MiB MCP payload limit and any limit imposed by the Azure service.

```bash
npx visual-shot ado publish preview.png \
  --organization https://dev.azure.com/contoso \
  --project "My Project" --repository 00000000-0000-0000-0000-000000000000 \
  --pr 123 --alt "Updated settings page" \
  --token-env SYSTEM_ACCESSTOKEN --comment --json
```

Set `SYSTEM_ACCESSTOKEN` in the environment that invokes the command. Do not
put a PAT in shell history or a checked-in file. In Azure Pipelines, explicitly
map `System.AccessToken` to the publish step's `SYSTEM_ACCESSTOKEN` environment
variable. The command returns the native attachment URL and Markdown; with
`--comment`, it upserts the managed PR comment. Review the result and confirm
the image renders. The comment is keyed by the source PNG filename and the
authenticated publisher identity. Reusing that filename updates the existing
comment when the image changes. Replies and other authors' comments stay intact.
New evidence threads are closed because they are informational. They do not
create an unresolved review request for comment-resolution branch policies.
Older content-hashed attachments are kept so previous links remain valid.

## Comments and PR descriptions

The managed comment is the preferred place for evidence larger than a short PR
description. Keep a PR description update at or below 4,000 characters. For a
longer recap, use a managed comment and keep the PR description concise.
When following the `pr-artifacts` skill, the description still needs its
`## Artifact` section. Put the uploaded image or a link to its evidence comment
there, preserving the rest of the description. A comment alone does not satisfy
the skill's PR body checker.

Azure DevOps Markdown support differs from GitHub Flavored Markdown. A PNG and
basic Markdown link or image are portable; do not assume `<details>`, Mermaid,
or a GitHub `recap --format gfm` output renders the same way in an Azure DevOps
PR. Use a provider-specific short Markdown comment, then verify it in the PR.

The GitHub workflow in [`../README.md`](../README.md#using-it-for-github-prs) is
unchanged. Its temporary GitHub commits and `gh` commands apply only to GitHub;
use one of the Azure DevOps paths above for Azure Repos.

## References

- [Pull Request Attachments - Create REST API](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-attachments/create?view=azure-devops-rest-7.1)
- [Pull Request Threads - Create REST API](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-threads/create?view=azure-devops-rest-7.1)
- [Azure Pipelines `System.AccessToken`](https://learn.microsoft.com/en-us/azure/devops/pipelines/build/variables?view=azure-devops#systemaccesstoken)
- [Queue-time variable restrictions](https://learn.microsoft.com/en-us/azure/devops/pipelines/security/inputs?view=azure-devops#limit-variables-that-can-be-set-at-queue-time)
- [Job access tokens and repository protection](https://learn.microsoft.com/en-us/azure/devops/pipelines/process/access-tokens?view=azure-devops)
- [Azure DevOps MCP toolset reference](https://github.com/microsoft/azure-devops-mcp/blob/main/docs/TOOLSET.md)
- [Azure DevOps remote MCP available tools](https://learn.microsoft.com/en-us/azure/devops/mcp-server/remote-mcp-server?view=azure-devops#available-tools)
