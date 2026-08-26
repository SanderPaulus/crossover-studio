import { defineConfig } from 'vitest/config';

// Standalone test config: the lib is framework-free, so tests run in a plain
// node environment without the React plugin (which avoids Vite version-type
// clashes between the app build and the test runner).
//
// `.test.tsx` IS included, and it is one file's worth of surface on purpose.
// The toggle invariant makes a claim about what the dialog RENDERS with the
// engine off, and a source scan cannot make that claim — it can show that the
// value an annotation hangs off is null, not that nothing else draws the
// markup. `react-dom/server`'s `renderToStaticMarkup` answers it in a plain
// node environment, with no DOM library and no new dependency: render the
// component with no windows and read the output. The JSX transform comes from
// the app tsconfig's `react-jsx`, which esbuild honours.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
