import { Injectable } from '@nestjs/common';

@Injectable()
export class ResumeProficiencyPresentationService {
  private readonly levels = new Map<string, number>([
    ['beginner', 1],
    ['basic', 2],
    ['a1', 2],
    ['a2', 2],
    ['basic (a2)', 2],
    ['basic (b1)', 2],
    ['intermediate', 3],
    ['b1', 3],
    ['b2', 3],
    ['advanced', 4],
    ['professional', 4],
    ['c1', 4],
    ['expert', 5],
    ['fluent', 5],
    ['native', 5],
    ['c2', 5],
  ]);

  enhanceRenderedHtml(html: string): string {
    return html.replace(
      /<[^>]*\bdata-(?:resume-)?proficiency\s*=\s*(["'])(.*?)\1[^>]*>/gi,
      (tag) => this.enhanceTag(tag),
    );
  }

  buildRendererCss(): string {
    return `
.fill[data-resume-level="1"]:is([data-resume-proficiency],[data-proficiency]) { width: 35% !important; }
.fill[data-resume-level="2"]:is([data-resume-proficiency],[data-proficiency]) { width: 50% !important; }
.fill[data-resume-level="3"]:is([data-resume-proficiency],[data-proficiency]) { width: 65% !important; }
.fill[data-resume-level="4"]:is([data-resume-proficiency],[data-proficiency]) { width: 80% !important; }
.fill[data-resume-level="5"]:is([data-resume-proficiency],[data-proficiency]) { width: 95% !important; }
`.trim();
  }

  private enhanceTag(tag: string): string {
    const proficiency = tag.match(
      /\bdata-(?:resume-)?proficiency\s*=\s*(["'])(.*?)\1/i,
    )?.[2];
    const level = this.resolveLevel(proficiency);
    if (level == null) return tag;

    if (/\bdata-resume-level\s*=/i.test(tag)) {
      return tag.replace(
        /\bdata-resume-level\s*=\s*(["']).*?\1/i,
        `data-resume-level="${level}"`,
      );
    }

    return tag.replace(/\s*(\/?)>$/, ` data-resume-level="${level}"$1>`);
  }

  private resolveLevel(value: string | undefined): number | null {
    if (!value) return null;

    const normalized = this.decodeHtmlAttribute(value)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');

    return this.levels.get(normalized) ?? null;
  }

  private decodeHtmlAttribute(value: string): string {
    return value
      .replace(/&quot;/gi, '"')
      .replace(/&#0*39;|&apos;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&');
  }
}
