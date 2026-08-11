import { Injectable } from '@nestjs/common';

interface ScopeFrame {
  value: unknown;
  index?: number;
}

@Injectable()
export class ResumeTemplateEngineService {
  render(template: string, data: Record<string, unknown>): string {
    return this.renderSegment(template, [{ value: data }], data);
  }

  private renderSegment(
    template: string,
    scopes: ScopeFrame[],
    root: Record<string, unknown>,
  ): string {
    let output = '';
    let cursor = 0;

    while (cursor < template.length) {
      const open = template.indexOf('{{', cursor);
      if (open < 0) {
        output += template.slice(cursor);
        break;
      }
      output += template.slice(cursor, open);

      const close = template.indexOf('}}', open + 2);
      if (close < 0) {
        output += template.slice(open);
        break;
      }

      const token = template.slice(open + 2, close).trim();
      if (token.startsWith('#each ')) {
        const path = token.slice(6).trim();
        const match = this.findMatchingClose(template, close + 2, 'each');
        const block = template.slice(close + 2, match.openIndex);
        const value = this.resolve(path, scopes, root);
        if (Array.isArray(value)) {
          value.forEach((item, index) => {
            output += this.renderSegment(block, [...scopes, { value: item, index }], root);
          });
        }
        cursor = match.closeIndex;
        continue;
      }

      if (token.startsWith('#if ')) {
        const path = token.slice(4).trim();
        const match = this.findMatchingClose(template, close + 2, 'if');
        const block = template.slice(close + 2, match.openIndex);
        const value = this.resolve(path, scopes, root);
        if (this.isTruthy(value)) {
          output += this.renderSegment(block, scopes, root);
        }
        cursor = match.closeIndex;
        continue;
      }

      if (token.startsWith('/')) {
        cursor = close + 2;
        continue;
      }

      output += this.escapeHtml(this.stringify(this.resolve(token, scopes, root)));
      cursor = close + 2;
    }

    return output;
  }

  private findMatchingClose(
    template: string,
    start: number,
    kind: 'each' | 'if',
  ): { openIndex: number; closeIndex: number } {
    let cursor = start;
    let depth = 1;
    while (cursor < template.length) {
      const open = template.indexOf('{{', cursor);
      if (open < 0) break;
      const close = template.indexOf('}}', open + 2);
      if (close < 0) break;
      const token = template.slice(open + 2, close).trim();
      if (token.startsWith(`#${kind} `)) depth += 1;
      if (token === `/${kind}`) {
        depth -= 1;
        if (depth === 0) {
          return { openIndex: open, closeIndex: close + 2 };
        }
      }
      cursor = close + 2;
    }
    throw new Error(`Unclosed template block: ${kind}`);
  }

  private resolve(path: string, scopes: ScopeFrame[], root: Record<string, unknown>): unknown {
    if (path === '@index') return scopes[scopes.length - 1]?.index ?? 0;
    if (path === 'this' || path === '.') return scopes[scopes.length - 1]?.value;
    if (path.startsWith('@root.')) return this.readPath(root, path.slice(6));

    let scopeIndex = scopes.length - 1;
    let normalizedPath = path;
    while (normalizedPath.startsWith('../')) {
      scopeIndex = Math.max(0, scopeIndex - 1);
      normalizedPath = normalizedPath.slice(3);
    }

    const current = scopes[scopeIndex]?.value;
    const local = this.readPath(current, normalizedPath);
    if (local !== undefined) return local;
    return this.readPath(root, normalizedPath);
  }

  private readPath(value: unknown, path: string): unknown {
    if (!path) return value;
    return path.split('.').reduce<unknown>((current, key) => {
      if (!current || typeof current !== 'object') return undefined;
      return (current as Record<string, unknown>)[key];
    }, value);
  }

  private stringify(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return '';
  }

  private isTruthy(value: unknown): boolean {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object') return Object.keys(value as object).length > 0;
    return Boolean(value);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
