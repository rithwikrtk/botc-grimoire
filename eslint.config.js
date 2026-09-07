import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const PERCEIVED_CHARACTER_MESSAGE =
  '§4.1: perceivedCharacterId may be consulted only by a step\'s wakes() in ' +
  'nightOrder.ts and by step/UI rendering. Rules predicates must read the true ' +
  'characterId — otherwise a Drunk-believing-Soldier survives the Demon.';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: [
      // wakes() lives here — this is the sanctioned reader.
      'src/editions/troubleBrewing/nightOrder.ts',
      // The cursor resolves wakes() and hands the acting actor's perceived
      // character to the step event and to rendering, so the command layer never
      // has to read it. Second sanctioned reader, and deliberately the last.
      'src/engine/selectors/nightCursor.ts',
      // The definition itself.
      'src/engine/selectors/players.ts',
      // Rendering is sanctioned by §4.1.
      'src/ui/**',
      // Tests assert the behaviour and must be able to call it.
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // '**/selectors/players' and the '@/…' alias catch every import that
              // spells out the 'selectors' segment. Neither catches a file that
              // already LIVES in src/engine/selectors/ importing its sibling
              // players.ts via './players' (or '../players' one level down) —
              // that specifier has no 'selectors' segment in its own text, so the
              // glob silently doesn't match. Found empirically: eslint on a probe
              // file importing perceivedCharacterId from './players' produced NO
              // error under the two patterns above. Listed explicitly because
              // seating.ts already uses the relative-import idiom in this
              // directory and more files land here later (§4.1).
              group: [
                '**/selectors/players',
                '@/engine/selectors/players',
                './players',
                '../players',
                '@/engine',
                '@/engine/index',
              ],
              importNames: ['perceivedCharacterId', 'playersWithPerceivedCharacter'],
              message: PERCEIVED_CHARACTER_MESSAGE,
            },
          ],
        },
      ],
    },
  },
);
