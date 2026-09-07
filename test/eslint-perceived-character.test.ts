import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

const eslint = new ESLint({ cwd: process.cwd() });

async function lint(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath, warnIgnored: false });
  return (result?.messages ?? []).map((m) => `${m.ruleId ?? 'unknown'}: ${m.message}`);
}

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
