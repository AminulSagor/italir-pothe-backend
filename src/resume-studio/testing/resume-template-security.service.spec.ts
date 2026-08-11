import { BadRequestException } from '@nestjs/common';
import { ResumeTemplateSecurityService } from '../services/resume-template-security.service';

const service = new ResumeTemplateSecurityService();

describe('ResumeTemplateSecurityService', () => {
  it('rejects JavaScript in template HTML', () => {
    expect(() => service.validate('<script>alert(1)</script>', '')).toThrow(BadRequestException);
  });

  it('rejects remote CSS imports', () => {
    expect(() => service.validate('<main></main>', '@import url("https://example.com/font.css");')).toThrow(BadRequestException);
  });

  it('allows safe HTML, CSS and placeholders', () => {
    expect(() => service.validate('<h1>{{personal.fullName}}</h1>', 'h1{font-size:24pt;}')).not.toThrow();
  });
});
