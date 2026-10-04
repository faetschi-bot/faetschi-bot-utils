// Non-redundant recap output. A GitHub-flavoured Markdown comment (`--format
// gfm`) already renders the text surfaces — files, diffs, tables, JSON, and
// Mermaid — so embedding the full report PNG next to it duplicates the comment.
// A PNG is only uniquely valuable for what a comment cannot render: `wireframe`
// mockups, real `image`/`image-pair` screenshots, and raw `diagram` HTML. This
// module narrows a recap to those blocks so `--visuals-only` produces exactly
// the companion image (or nothing at all, when there is none).

export const VISUAL_BLOCK_TYPES = ['wireframe', 'image', 'image-pair', 'diagram'];

const CONTAINER_TYPES = new Set(['columns', 'tabs']);

// Keeps the blocks whose type is wanted, recursing through `columns`/`tabs`.
// Containers are structural: one survives only while it still holds a matching
// descendant, so a `columns` around two notes disappears under `--only image`.
function filterBlocks(blocks, types) {
  const kept = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    if (CONTAINER_TYPES.has(block.type)) {
      const key = block.type;
      const groups = Array.isArray(block[key]) ? block[key] : [];
      const keptGroups = groups
        .map((group) => {
          const children = filterBlocks(Array.isArray(group?.blocks) ? group.blocks : [], types);
          return children.length > 0 ? { ...group, blocks: children } : null;
        })
        .filter(Boolean);
      if (keptGroups.length > 0) kept.push({ ...block, [key]: keptGroups });
      continue;
    }
    if (types.has(block.type)) kept.push(block);
  }
  return kept;
}

// Returns a shallow clone of `recap` whose block tree keeps only the wanted
// types. Unknown top-level fields (and title/brief/meta) are preserved. The
// input is never mutated; with no types requested the recap is returned as-is.
export function filterRecapByTypes(recap, types) {
  const wanted = types == null ? [] : Array.from(types);
  if (wanted.length === 0) return recap;
  const typeSet = new Set(wanted);
  return { ...recap, blocks: filterBlocks(recap.blocks ?? [], typeSet) };
}
