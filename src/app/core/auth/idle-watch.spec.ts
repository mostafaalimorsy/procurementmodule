import { IdleWatch } from './idle-watch';

describe('IdleWatch (CF-068)', () => {
  it('warns two minutes before the idle timeout and expires at it; activity resets both', () => {
    const watch = new IdleWatch();
    const start = 1_000_000;
    watch.touch(start);
    watch.check(15, start + 12 * 60_000);
    expect([watch.warning(), watch.expired()]).toEqual([false, false]);
    watch.check(15, start + 13.5 * 60_000);
    expect([watch.warning(), watch.expired()]).toEqual([true, false]);
    watch.check(15, start + 15 * 60_000 + 1);
    expect([watch.warning(), watch.expired()]).toEqual([false, true]);
    watch.touch(start + 16 * 60_000);
    expect([watch.warning(), watch.expired()]).toEqual([false, false]);
  });
});
