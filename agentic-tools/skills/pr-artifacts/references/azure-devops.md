# Azure DevOps publishing

Use Azure Repos publishing instructions for Azure DevOps PRs. The GitHub
temporary-image commits, `gh` commands, GitHub comment actions, and GFM recap
assumptions in the main workflow do not apply. Azure DevOps accepts basic
Markdown and PNG images, but do not assume GitHub `<details>` or Mermaid output
renders there. Keep PR description updates at or below 4,000 characters; put
larger evidence in a managed PR comment.

The PR body contract still applies. Keep a non-empty `## Artifact` section in
the description with the image or a link to the evidence comment. Preserve the
existing description when updating it. For a new PR, create it as a draft,
publish the evidence, validate the final body, and then mark it ready through
the discovered PR write tool. `ado publish` requires an existing PR ID.

Install `visual-shot` in the target project if it is not present:

```bash
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/visual-shot-latest/visual-shot.tgz
```

The package's full guide and pipeline example are
`node_modules/visual-shot/docs/azure-devops.md` and
`node_modules/visual-shot/azure-pipelines.yml`.
Require `visual-shot` 0.12.0 or newer. Check that `visual-shot ado --help` shows
`prepare` and `publish` before following these recipes.

## Choose one of three paths

1. **MCP-only, Work Item Tracking attachment.** Run
   `visual-shot ado prepare` with the image path, `--project`, `--out`, and
   `--json`, read the exact `{ project, fileName, content }` JSON payload, then
   discover the connected MCP schemas and call
   `wit_work_item_attachment_upload` with base64 `content`. A known linked work
   item can optionally receive the attachment with
   `wit_work_item_attachment_link`. Use the discovered repository comment tools
   to post or update Markdown with the returned attachment URL, then verify the
   image renders. Tool names and schemas can differ by server version; discover
   them before calling. Do not invent a tool or treat an MCP call as arbitrary
   REST execution. MCP tokens are not available to the local CLI, and a local
   shell path is not an image URL.

   This upload uses the Work Item Tracking attachment store, with Boards
   permissions and lifecycle. It is not a native PR attachment and does not
   satisfy a policy that requires native PR attachments.
   The payload must fit the client's tool argument limit. Pass the complete
   base64 value through file/tool orchestration, not the payload file path.
   Reuse the upload URL if comment creation fails.

2. **Queue a trusted manual pipeline.** Use the checked-in publisher when MCP
   can queue Azure Pipelines but cannot upload binary files. Configure the
   pipeline to run protected `main`; set `trigger: none`, `pr: none`, and
   `checkout: none`. The example accepts only string parameters
   `pullRequestId` and `screenshotUrl`, validates the URL against the
   admin-controlled exact preview origin, captures it on the agent, and uses
   `Build.Repository.ID` as the target repository. The agent must reach the
   preview URL; it cannot capture a developer's localhost.

   Discover the queue tool and schema before use. Newer local MCP versions use
   `pipelines_write` with `action: run_pipeline`; other versions may expose
   `pipelines_run_pipeline`. Pass template parameters as strings only. Do not
   pass image bytes through pipeline parameters. Require permission to queue
   the pipeline and grant its Build Service identity permission to contribute
   to PRs. `System.AccessToken` belongs only in the publish step. Do not run a
   PR branch of the publisher or allow untrusted users to change its YAML.
   Limit queue-time variables so a caller cannot override the configured
   preview origin. Keep the example's compile-time dollar escaping to prevent
   Azure macro expansion inside caller parameters.

3. **Direct OAuth publishing.** When a local or pipeline environment already
   has an Azure DevOps OAuth bearer token, run:

   ```bash
   visual-shot ado publish <image.png> \
     --organization https://dev.azure.com/<organization> \
     --project <project> --repository <target-repository-id-or-name> \
     --pr <pull-request-id> --token-env SYSTEM_ACCESSTOKEN --comment --json
   ```

   Set `SYSTEM_ACCESSTOKEN` in the invoking environment. The command uploads a
   native PR attachment and returns its URL and Markdown. `--comment` upserts a
   managed PR comment. It does not use `az`, obtain credentials, or accept a
   personal PAT as a substitute for an OAuth bearer token.

The detailed setup and source links are in the
[`visual-shot` Azure DevOps guide](https://github.com/faetschi-bot/faetschi-bot-utils/blob/main/visual-shot/docs/azure-devops.md).
