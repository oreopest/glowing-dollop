/**
 * distributeImpressions.js — Pure logic, zero DOM dependencies.
 *
 * TEST 1: Two full weeks, 50 imps → even split → [25, 25]
 * TEST 2: Partial start (5d+7d), 120 → day-based → [50, 70]
 * TEST 3: Dark full week in middle, 100 → [50, 0, 50]
 * TEST 4: Mid-week go-live partial dark (cd=5,ad=0) → NOT Dark label, [0, 70]
 * TEST 5: All days dark → error "No live days..."
 */
export function distributeImpressions(vendorPlannedImpressions, weekData) {
  const imps = vendorPlannedImpressions;
  const numWeeks = weekData.length;
  const totalLiveDays = weekData.reduce((s, w) => s + w.activeDaysInWeek, 0);

  if (totalLiveDays === 0) {
    return { error: 'No live days available after applying dark days.' };
  }

  const allFullLive = weekData.every(
    (w) => w.campaignDaysInWeek === 7 && w.activeDaysInWeek === 7
  );

  if (allFullLive) {
    const base = Math.floor(imps / numWeeks);
    const remainder = imps % numWeeks;
    const result = weekData.map(() => base);
    result[numWeeks - 1] += remainder;
    return { weeklyImpressions: result };
  }

  const impressionsPerDay = imps / totalLiveDays;
  const weeklyImps = weekData.map((w) =>
    Math.round(w.activeDaysInWeek * impressionsPerDay)
  );

  const currentSum = weeklyImps.reduce((a, b) => a + b, 0);
  let remainder = imps - currentSum;

  for (let i = weekData.length - 1; i >= 0; i--) {
    if (weekData[i].activeDaysInWeek > 0) {
      weeklyImps[i] += remainder;
      break;
    }
  }

  return { weeklyImpressions: weeklyImps };
}
