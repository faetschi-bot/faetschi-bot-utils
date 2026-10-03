// Merges the two recap inputs into one document: an agent-authored JSON
// (rich content) and/or a git diff range (mechanical file map + patches).

export function assembleRecap({ from, gitData, title, range } = {}) {
  const warnings = [];
  const recap = from
    ? structuredClone(from)
    : { version: 1, title: title || (range ? `Changes in ${range}` : 'Changes'), blocks: [] };

  // A non-empty CLI --title always wins, whether or not a recap JSON was given.
  if (typeof title === 'string' && title.length > 0) recap.title = title;

  if (gitData) {
    // An empty range (e.g. `main...HEAD` with no commits) must not add a
    // file-tree with no entries — the schema rejects that and the report would
    // claim changes that are not there. Just warn about the empty range.
    if (gitData.entries.length === 0) {
      warnings.push(range ? `no changes in ${range}` : 'no changes in the given range');
    }
    if (gitData.entries.length > 0 && !recap.blocks.some((block) => block.type === 'file-tree')) {
      recap.blocks.unshift({
        type: 'file-tree',
        title: 'Files changed',
        entries: gitData.entries.map((entry) => ({ path: entry.path, change: entry.change })),
      });
    }
    const tabs = [...gitData.patches.entries()].map(([path, patch]) => ({
      label: path,
      blocks: [{ type: 'patch', filename: path, patch }],
    }));
    if (tabs.length > 0) recap.blocks.push({ type: 'tabs', tabs });
    if (gitData.truncated) {
      warnings.push(`inline patches limited to ${tabs.length} of ${gitData.total} changed files`);
    }
  }

  return { recap, warnings };
}
