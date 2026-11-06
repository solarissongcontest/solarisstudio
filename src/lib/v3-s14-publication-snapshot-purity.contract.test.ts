import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stage9 = readFileSync(
  '.github/scripts/v3-s14-stage-9-publication.sh',
  'utf8',
);

const finalPublication = readFileSync(
  '.github/scripts/v3-s14-grand-final-publication.sh',
  'utf8',
);

describe('S14 publication snapshot purity', () => {
  it('keeps anonymous snapshot stdout reserved for normalized JSON', () => {
    const match = stage9.match(
      /anonymous_result_snapshot\(\)\s*\{([\s\S]*?)\n\}/,
    );

    expect(match).not.toBeNull();

    const body = match?.[1] ?? '';

    expect(body).toContain(
      'expect_success "anonymous Results refresh $show_id" >&2',
    );

    expect(body).toContain(
      'printf \'%s\' "$HTTP_BODY" | normalise_json',
    );
  });

  it('does not capture expect_success logging as snapshot data', () => {
    expect(stage9).not.toMatch(
      /anonymous_result_snapshot\(\)\s*\{[\s\S]*?expect_success "anonymous Results refresh \$show_id"\n[\s\S]*?\n\}/,
    );
  });

  it('protects both semifinal and Grand Final publication assertions', () => {
    expect(stage9).toContain(
      'pre_refresh="$(anonymous_result_snapshot "$show_id")"',
    );

    expect(finalPublication).toContain(
      'actual="$(anonymous_result_snapshot "$show_id")"',
    );
  });
});
