import { highestBand, needsAttention, utilizationBand, utilizationPercent } from './utilization';

const q = (usage: number, limit: number | null, measured = true) => ({
  key: 'max_users',
  usage,
  limit,
  measured,
});

describe('Utilization bands', () => {
  it.each([
    [q(15, 20), 'normal', 75],
    [q(16, 20), 'approaching', 80],
    [q(19, 20), 'approaching', 95],
    [q(20, 20), 'atLimit', 100],
    [q(21, 20), 'overLimit', 105],
    [q(3, 3), 'atLimit', 100],
    [q(2, 3), 'normal', 66],
    [q(0, 0), 'atLimit', null],
    [q(4, null), 'notIncluded', null],
    [q(0, 40, false), 'notMeasured', null],
  ] as const)('classifies %o as %s', (quota, band, percent) => {
    expect(utilizationBand(quota)).toBe(band);
    expect(utilizationPercent(quota)).toBe(percent);
  });

  // The displayed number never contradicts the band, at either threshold or above the limit.
  it.each([
    [q(79, 100), 'normal', 79],
    [q(80, 100), 'approaching', 80],
    [q(159, 200), 'normal', 79],
    [q(160, 200), 'approaching', 80],
    [q(199, 200), 'approaching', 99],
    [q(100, 100), 'atLimit', 100],
    [q(101, 100), 'overLimit', 101],
    [q(1001, 1000), 'overLimit', 101],
    [q(18, 10), 'overLimit', 180],
    [q(1, 0), 'overLimit', null],
    [q(7205759403792792, 9007199254740991), 'normal', 79],
    [q(9007199254740989, 9007199254740990), 'approaching', 99],
  ] as const)('shows %o as %s at %s%%', (quota, band, percent) => {
    expect(utilizationBand(quota)).toBe(band);
    expect(utilizationPercent(quota)).toBe(percent);
  });

  it('summarises a company by its most pressing measured quota', () => {
    const summary = highestBand([
      { key: 'max_users', usage: 18, limit: 20, measured: true },
      { key: 'max_active_projects', usage: 3, limit: 3, measured: true },
      { key: 'max_subcontractors', usage: 0, limit: 40, measured: false },
    ]);
    expect(summary?.band).toBe('atLimit');
    expect(summary?.quota.key).toBe('max_active_projects');
    expect(
      highestBand([{ key: 'max_subcontractors', usage: 0, limit: 5, measured: false }]),
    ).toBeNull();
    expect(needsAttention('approaching')).toBe(true);
    expect(needsAttention('normal')).toBe(false);
  });
});
