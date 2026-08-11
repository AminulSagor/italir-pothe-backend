import { BadRequestException, Injectable } from '@nestjs/common';
import { RESUME_LIMITS } from '../constants/resume-limits';

@Injectable()
export class ResumeTemplateSecurityService {
  validate(html: string, css: string): void {
    if (!html.trim()) throw new BadRequestException('Template HTML is required');
    if (html.length > RESUME_LIMITS.templateHtml) {
      throw new BadRequestException(`Template HTML exceeds ${RESUME_LIMITS.templateHtml} characters`);
    }
    if (css.length > RESUME_LIMITS.templateCss) {
      throw new BadRequestException(`Template CSS exceeds ${RESUME_LIMITS.templateCss} characters`);
    }

    const htmlRules: Array<[RegExp, string]> = [
      [/<\s*script\b/i, 'script tags are not allowed'],
      [/<\s*(iframe|object|embed|base|link|form|meta|style)\b/i, 'active, embedded-style, or external HTML elements are not allowed'],
      [/\son[a-z]+\s*=/i, 'inline event handlers are not allowed'],
      [/javascript\s*:/i, 'javascript URLs are not allowed'],
      [/\ssrcdoc\s*=/i, 'srcdoc is not allowed'],
      [/(src|href|srcset)\s*=\s*["']\s*(?:https?:\/\/|\/\/|file:|ftp:)/i, 'hard-coded external or local-file URLs are not allowed in template HTML'],
      [/\sstyle\s*=\s*["'][^"']*{{/i, 'user placeholders are not allowed inside style attributes'],
      [/\ssrc\s*=\s*["']\s*{{(?!\s*personal\.photoUrl\s*}})/i, 'image src placeholders may only use personal.photoUrl'],
    ];
    for (const [rule, message] of htmlRules) {
      if (rule.test(html)) throw new BadRequestException(`Unsafe template HTML: ${message}`);
    }

    if (css.includes('{{')) {
      throw new BadRequestException('Unsafe template CSS: user placeholders are not allowed in CSS');
    }

    const cssRules: Array<[RegExp, string]> = [
      [/@import\b/i, '@import is not allowed'],
      [/expression\s*\(/i, 'CSS expressions are not allowed'],
      [/javascript\s*:/i, 'javascript URLs are not allowed'],
      [/-moz-binding\s*:/i, '-moz-binding is not allowed'],
      [/behavior\s*:/i, 'CSS behavior is not allowed'],
      [/url\(\s*["']?\s*(?:https?:\/\/|\/\/|file:|ftp:)/i, 'external or local-file CSS URLs are not allowed'],
    ];
    for (const [rule, message] of cssRules) {
      if (rule.test(css)) throw new BadRequestException(`Unsafe template CSS: ${message}`);
    }
  }
}
