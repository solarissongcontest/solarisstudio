import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/integrations/v3/live-source.server.ts', 'utf8');
const model = readFileSync('src/lib/v3-live.ts', 'utf8');
const screen = readFileSync('src/components/v3/V3LiveScreen.tsx', 'utf8');

describe('V3 Public reveal lifecycle projection', () => {
  it('reads reveal progress from the canonical server RPC instead of deriving lifecycle in the browser', () => {
    expect(source).toContain('studio2_public_reveal_snapshot');
    expect(source).toContain('loadPublicReveal');
    expect(model).toContain('reveal: V3LiveRevealState');
    expect(model).toContain('const reveal = input.reveal ?? HIDDEN_REVEAL');
  });

  it('treats anything before server Live/Complete as hidden', () => {
    expect(source).toContain('if (row.state !== "live" && row.state !== "complete") return hidden;');
    expect(model).toContain('state: "hidden" | "live" | "complete"');
  });

  it('renders only bounded progress after reveal visibility opens', () => {
    expect(screen).toContain('experience.reveal.state !== "hidden"');
    expect(screen).toContain('Canonical reveal progress');
    expect(screen).toContain('aria-label="Results reveal progress"');
    expect(screen).toContain('Future reveal order stays private until each step is executed.');
  });

  it('does not render the raw already-revealed identity token as public UI copy', () => {
    expect(screen).not.toContain('experience.reveal.lastRevealedId');
  });
});
