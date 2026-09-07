import { beforeAll, describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

const eslint = new ESLint({ cwd: process.cwd() });

async function lint(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath, warnIgnored: false });
  return (result?.messages ?? []).map((m) => `${m.ruleId ?? 'unknown'}: ${m.message}`);
}

// The FIRST lintText call in the process pays ESLint's whole bootstrap — config
// resolution, plugin loading, and typescript-eslint's parser — which is seconds,
// not milliseconds, on a cold or loaded machine. Whichever `it` happened to run
// first therefore carried that cost inside the default 5s test timeout and could
// time out for reasons that have nothing to do with what it asserts. Pay it here
// instead, with a timeout sized for the bootstrap; every case below is then a
// few milliseconds.
beforeAll(async () => {
  await lint('src/engine/rules/warmup.ts', 'export const warm = 1;\n');
}, 120_000);

describe('§4.1 enforcement — where perceivedCharacterId may be imported', () => {
  it('rejects the import from a rules module', async () => {
    const messages = await lint(
      'src/engine/rules/demonKill.ts',
      `import { perceivedCharacterId } from '../selectors/players';\nexport const x = perceivedCharacterId;\n`,
    );
    expect(messages.join('\n')).toMatch(/no-restricted-imports/);
    expect(messages.join('\n')).toMatch(/§4\.1/);
  });

  it('rejects the aliased import from a rules module too', async () => {
    const messages = await lint(
      'src/engine/rules/demonKill.ts',
      `import { playersWithPerceivedCharacter } from '@/engine/selectors/players';\nexport const x = playersWithPerceivedCharacter;\n`,
    );
    expect(messages.join('\n')).toMatch(/no-restricted-imports/);
  });

  // The literal-specifier gap this closes: '**/selectors/players' and the '@/…'
  // alias both require the text 'selectors' to appear in the import specifier,
  // which a file that already LIVES in src/engine/selectors/ never writes when
  // importing its sibling players.ts. Before the fix, this exact case produced
  // NO error — verified by hand against the real eslint CLI.
  it('rejects the same-directory relative form (a file inside selectors/ itself)', async () => {
    const messages = await lint(
      'src/engine/selectors/victory.ts',
      `import { perceivedCharacterId } from './players';\nexport const x = perceivedCharacterId;\n`,
    );
    expect(messages.join('\n')).toMatch(/no-restricted-imports/);
    expect(messages.join('\n')).toMatch(/§4\.1/);
  });

  // The barrel is NOT exempt. A Task 16 ruling REMOVED perceivedCharacterId and
  // playersWithPerceivedCharacter from src/engine/index.ts "to turn a lint
  // question into a compile error" — and that only holds while re-adding them
  // is itself an error. eslint.config.js used to list the barrel in `ignores`,
  // which meant a re-export would have linted clean and quietly re-opened the
  // §4.1 laundering route the ruling closed. Redden by: restoring the
  // 'src/engine/index.ts' entry to the `ignores` array in eslint.config.js.
  it('rejects a re-export of the restricted names from the engine barrel', async () => {
    const messages = await lint(
      'src/engine/index.ts',
      `export { perceivedCharacterId } from './selectors/players';\n`,
    );
    expect(messages.join('\n')).toMatch(/no-restricted-imports/);
    expect(messages.join('\n')).toMatch(/§4\.1/);
  });

  it('allows other imports from the same module', async () => {
    const messages = await lint(
      'src/engine/rules/demonKill.ts',
      `import { alive } from '../selectors/players';\nexport const x = alive;\n`,
    );
    expect(messages.join('\n')).not.toMatch(/no-restricted-imports/);
  });

  it('allows the import in the night order, where wakes() lives', async () => {
    const messages = await lint(
      'src/editions/troubleBrewing/nightOrder.ts',
      `import { playersWithPerceivedCharacter } from '@/engine/selectors/players';\nexport const x = playersWithPerceivedCharacter;\n`,
    );
    expect(messages.join('\n')).not.toMatch(/no-restricted-imports/);
  });

  it('allows the import in UI code', async () => {
    const messages = await lint(
      'src/ui/Grimoire.tsx',
      `import { perceivedCharacterId } from '@/engine/selectors/players';\nexport const x = perceivedCharacterId;\n`,
    );
    expect(messages.join('\n')).not.toMatch(/no-restricted-imports/);
  });
});
