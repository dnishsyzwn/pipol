export type PriorResult = { topic?: string; pointsPossible?: number; pointsEarned?: number; pendingReview?: boolean };

export function planStudent(results: PriorResult[], count: number) {
  if (!Array.isArray(results) || !results.length || results.some(r => !r || r.pendingReview || !Number.isFinite(r.pointsPossible) || !Number.isFinite(r.pointsEarned) || Number(r.pointsPossible) <= 0)) return null;
  const possible = results.reduce((n, r) => n + Number(r.pointsPossible || 0), 0);
  if (possible <= 0) return null;
  const earned = results.reduce((n, r) => n + Math.min(Number(r.pointsPossible || 0), Math.max(0, Number(r.pointsEarned || 0))), 0);
  const percentage = earned / possible * 100;
  const topics = new Map<string, { earned: number; possible: number }>();
  for (const r of results) {
    const topic = r.topic?.trim() || 'General';
    const stats = topics.get(topic) || { earned: 0, possible: 0 };
    stats.earned += Math.max(0, Number(r.pointsEarned || 0));
    stats.possible += Math.max(0, Number(r.pointsPossible || 0));
    topics.set(topic, stats);
  }
  const weakTopics = [...topics].filter(([, s]) => s.possible > 0 && s.earned < s.possible)
    .sort((a, b) => a[1].earned / a[1].possible - b[1].earned / b[1].possible).slice(0, 3).map(([topic]) => topic);
  return { percentage, targeted: percentage < 60, weakTopics, focusCount: Math.round(count * 0.7) };
}
