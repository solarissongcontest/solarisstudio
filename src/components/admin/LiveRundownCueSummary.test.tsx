import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LiveRundownCueSummary } from './LiveRundownCueSummary';

describe('Organizer Live read-only cue summary', () => {
  it('renders the canonical current and next segment labels without fake clocks', () => {
    const html = renderToStaticMarkup(
      <LiveRundownCueSummary current="12 · Oland" next="13 · Vendia" />,
    );
    expect(html).toContain('12 · Oland');
    expect(html).toContain('13 · Vendia');
    expect(html).toContain('Now · on air');
    expect(html).toContain('Next · queued');
    expect(html).not.toContain('countdown');
  });

  it('renders next queued cue without claiming anything is on air', () => {
    const html = renderToStaticMarkup(
      <LiveRundownCueSummary current={null} next="Opening sequence" />,
    );
    expect(html).toContain('No cue is on air');
    expect(html).toContain('Opening sequence');
  });

  it('does not invent a live cue panel when authoritative rundown is unavailable', () => {
    expect(renderToStaticMarkup(
      <LiveRundownCueSummary current={null} next={null} />,
    )).toBe('');
  });

  it('shows an honest empty-next state for the final live segment', () => {
    const html = renderToStaticMarkup(
      <LiveRundownCueSummary current="Closing sequence" next={null} />,
    );
    expect(html).toContain('Closing sequence');
    expect(html).toContain('No next cue is queued');
  });
});
