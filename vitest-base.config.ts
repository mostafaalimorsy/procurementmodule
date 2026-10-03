import { defineConfig } from 'vitest/config';

// Each spec file runs in its own module graph. The Angular builder defaults to a shared one, where a
// component's translated template is cached by whichever spec renders it first — so an English spec could
// leave an Arabic spec with English templates (or the reverse) depending on scheduling.
export default defineConfig({
  test: {
    isolate: true,
  },
});
