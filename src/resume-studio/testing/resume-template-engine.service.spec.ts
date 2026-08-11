import { ResumeTemplateEngineService } from '../services/resume-template-engine.service';

const service = new ResumeTemplateEngineService();

describe('ResumeTemplateEngineService', () => {
  it('escapes user text instead of injecting HTML', () => {
    const result = service.render('<h1>{{personal.fullName}}</h1>', {
      personal: { fullName: '<script>alert(1)</script>' },
    });
    expect(result).toContain('&lt;script&gt;');
    expect(result).not.toContain('<script>');
  });

  it('renders nested repeatable content', () => {
    const result = service.render(
      '{{#each experience}}<h2>{{company}}</h2>{{#each bullets}}<p>{{this}}</p>{{/each}}{{/each}}',
      { experience: [{ company: 'A', bullets: ['One', 'Two'] }] },
    );
    expect(result).toContain('<h2>A</h2>');
    expect(result).toContain('<p>One</p><p>Two</p>');
  });

  it('hides conditional content when the field is missing', () => {
    expect(service.render('{{#if summary}}<p>{{summary}}</p>{{/if}}', {})).toBe('');
  });
});
