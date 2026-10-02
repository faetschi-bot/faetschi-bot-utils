// Deterministic ranking metrics for the eval gate. Grades are 0-3; relevance
// for recall/MRR is grade >= 1. Pure functions so they can be unit-tested.
export function ndcgAtK(ranked, grades, k) {
  const relevance = (id) => grades[id] ?? 0;
  const dcg = ranked.slice(0, k).reduce((sum, id, index) => sum + (2 ** relevance(id) - 1) / Math.log2(index + 2), 0);
  const ideal = Object.values(grades)
    .sort((a, b) => b - a)
    .slice(0, k)
    .reduce((sum, grade, index) => sum + (2 ** grade - 1) / Math.log2(index + 2), 0);
  return ideal === 0 ? 0 : dcg / ideal;
}

export function recallAtK(ranked, grades, k) {
  const relevant = Object.entries(grades)
    .filter(([, grade]) => grade >= 1)
    .map(([id]) => id);
  if (relevant.length === 0) return 0;
  const found = ranked.slice(0, k).filter((id) => relevant.includes(id)).length;
  return found / relevant.length;
}

export function mrrAtK(ranked, grades, k) {
  for (let index = 0; index < Math.min(k, ranked.length); index += 1) {
    if ((grades[ranked[index]] ?? 0) >= 1) return 1 / (index + 1);
  }
  return 0;
}
