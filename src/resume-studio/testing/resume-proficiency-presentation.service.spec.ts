import { ResumeProficiencyPresentationService } from '../services/resume-proficiency-presentation.service';

const service = new ResumeProficiencyPresentationService();

describe('ResumeProficiencyPresentationService', () => {
  it.each([
    ['Beginner', 1],
    ['Basic', 2],
    ['Intermediate', 3],
    ['Advanced', 4],
    ['Expert', 5],
    ['Professional', 4],
    ['Fluent', 5],
    ['Native', 5],
    ['Basic (A2)', 2],
    ['B1', 3],
    ['C2', 5],
  ])('maps %s to visual level %i', (proficiency, level) => {
    const html = `<span class="fill" data-resume-proficiency="${proficiency}"></span>`;

    expect(service.enhanceRenderedHtml(html)).toContain(
      `data-resume-level="${level}"`,
    );
  });

  it('maps values case-insensitively without changing their displayed value', () => {
    const html =
      '<span class="fill" data-resume-proficiency=" professional "></span>';
    const result = service.enhanceRenderedHtml(html);

    expect(result).toContain('data-resume-proficiency=" professional "');
    expect(result).toContain('data-resume-level="4"');
  });

  it('supports the legacy data-proficiency marker used by existing templates', () => {
    const html = '<span class="fill" data-proficiency="Professional"></span>';

    expect(service.enhanceRenderedHtml(html)).toContain(
      'data-resume-level="4"',
    );
  });

  it('leaves unknown legacy values untouched', () => {
    const html =
      '<span class="fill" data-resume-proficiency="Custom level"></span>';

    expect(service.enhanceRenderedHtml(html)).toBe(html);
  });

  it('provides visibly increasing bar widths for levels one through five', () => {
    const css = service.buildRendererCss();

    expect(css).toContain('data-resume-level="1"]');
    expect(css).toContain('width: 35%');
    expect(css).toContain('width: 50%');
    expect(css).toContain('width: 65%');
    expect(css).toContain('width: 80%');
    expect(css).toContain('width: 95%');
  });

  it('applies levels to any bound proficiency indicator, not only .fill', () => {
    const css = service.buildRendererCss();

    expect(css).toContain(
      ':is([data-resume-proficiency],[data-proficiency])[data-resume-level="2"]',
    );
    expect(css).not.toContain('.fill[data-resume-level=');
  });

  it('hides a legacy meter rendered beside the data-bound meter', () => {
    const css = service.buildRendererCss();

    expect(css).toContain('~ :is(.fill,.bar,.progress,.progress-bar');
    expect(css).toContain('display: none !important');
  });

  it('replaces stale presentation metadata without mutating proficiency', () => {
    const html =
      '<span class="fill" data-resume-level="1" data-resume-proficiency="Native"></span>';
    const result = service.enhanceRenderedHtml(html);

    expect(result).toContain('data-resume-proficiency="Native"');
    expect(result).toContain('data-resume-level="5"');
    expect(result).not.toContain('data-resume-level="1"');
  });
});
