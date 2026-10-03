import { requestKey } from './request-key';

describe('request keys', () => {
  it('are version-4 GUIDs even where crypto.randomUUID is unavailable (plain-HTTP hosts)', () => {
    const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(requestKey()).toMatch(guid);
    const original = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: undefined,
      configurable: true,
    });
    try {
      expect(requestKey()).toMatch(guid);
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', {
        value: original,
        configurable: true,
      });
    }
  });
});
