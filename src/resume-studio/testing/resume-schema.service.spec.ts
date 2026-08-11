import { BadRequestException } from '@nestjs/common';
import { EXTREME_RESUME_DATA } from './extreme-resume.fixture';
import { ResumeSchemaService } from '../services/resume-schema.service';
import { DEFAULT_RESUME_FIELD_SCHEMA } from '../constants/resume-field-catalog';

const service = new ResumeSchemaService();

describe('ResumeSchemaService', () => {
  it('accepts the configured extreme maximums without truncating data', () => {
    const normalized = service.normalizeResumeData(EXTREME_RESUME_DATA as unknown as Record<string, unknown>);
    expect(normalized.experience).toHaveLength(15);
    expect(normalized.education).toHaveLength(10);
    expect(normalized.skills).toHaveLength(40);
  });

  it('rejects entries above the hard section limits', () => {
    const tooManyJobs = {
      ...EXTREME_RESUME_DATA,
      experience: [...(EXTREME_RESUME_DATA.experience ?? []), EXTREME_RESUME_DATA.experience?.[0]],
    };
    expect(() => service.normalizeResumeData(tooManyJobs as unknown as Record<string, unknown>)).toThrow(BadRequestException);
  });

  it('normalizes common date formats', () => {
    const normalized = service.normalizeResumeData({
      experience: [{ company: 'Example', startDate: 'Jan 2024', endDate: '01/2025' }],
    });
    expect(normalized.experience?.[0].startDate).toBe('2024-01');
    expect(normalized.experience?.[0].endDate).toBe('2025-01');
  });

  it('normalizes pasted whitespace and repeated blank lines', () => {
    const normalized = service.normalizeResumeData({
      summary: '  First   line\n\n\n\nSecond   line  ',
    });
    expect(normalized.summary).toBe('First line\n\nSecond line');
  });

  it('keeps unicode text for multilingual CVs', () => {
    const normalized = service.normalizeResumeData({
      personal: { fullName: 'আমিন العربية 中文' },
      skills: ['Flutter', 'ইতালিয়ান', 'العربية', '中文'],
    });
    expect(normalized.personal?.fullName).toContain('আমিন');
    expect(normalized.skills).toContain('中文');
  });

  it('returns the stable field catalog with AI help on summary', () => {
    const schema = service.validateTemplateSchema(
      DEFAULT_RESUME_FIELD_SCHEMA as unknown as Record<string, unknown>,
    );
    const summary = schema.sections
      .find((section) => section.key === 'summary')
      ?.fields?.find((field) => field.key === 'summary');
    expect(summary?.aiAssist).toBe('summary-suggestions');
  });

  it('rejects template field keys that Flutter does not know', () => {
    const invalid = JSON.parse(JSON.stringify(DEFAULT_RESUME_FIELD_SCHEMA));
    invalid.sections[0].fields[0].key = 'personal.unknownField';
    expect(() =>
      service.validateTemplateSchema(invalid as Record<string, unknown>),
    ).toThrow(BadRequestException);
  });

  it('requires an explicit continuation strategy for two-column templates', () => {
    expect(() =>
      service.validateRendererConfig({
        layout: 'two-column',
        sidebarContinuation: 'not-applicable',
        recommendedMaxPages: 2,
        hardMaxPages: 6,
      }),
    ).toThrow(BadRequestException);
  });
});
