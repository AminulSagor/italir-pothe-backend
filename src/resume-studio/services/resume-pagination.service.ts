import { Injectable } from '@nestjs/common';

interface ResumePaginationPageLike {
  evaluate<T>(fn: () => T | Promise<T>): Promise<T>;
}

export interface ResumePaginationResult {
  movedSections: number;
  movedEntries: number;
  splitEntries: number;
  orphanHeadingsFixed: number;
  passes: number;
}

@Injectable()
export class ResumePaginationService {
  async apply(page: ResumePaginationPageLike): Promise<ResumePaginationResult> {
    return page.evaluate(() => {
      /*
       * Chromium's CSS pixel size can vary with environment/device scale,
       * so measure 297mm in the actual rendering context instead of relying
       * only on a hard-coded A4 pixel height.
       */
      const probe = document.createElement('div');
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      probe.style.pointerEvents = 'none';
      probe.style.width = '1px';
      probe.style.height = '297mm';
      document.body.appendChild(probe);

      const measuredPageHeight = probe.getBoundingClientRect().height;
      probe.remove();

      const pageHeight = measuredPageHeight > 0 ? measuredPageHeight : 1122.52;

      const EPSILON = 2;
      const PAGE_START_TOLERANCE = 5;
      const OVERSIZED_ENTRY_TOLERANCE = 8;
      const SMALL_SECTION_MAX_RATIO = 0.48;
      const HEADING_WITH_FIRST_ENTRY_MAX_RATIO = 0.5;
      const MAX_PASSES = 4;

      let movedSections = 0;
      let movedEntries = 0;
      let splitEntries = 0;
      let orphanHeadingsFixed = 0;
      let passes = 0;

      type Rect = {
        top: number;
        bottom: number;
        height: number;
      };

      const getRect = (element: Element): Rect => {
        const rect = element.getBoundingClientRect();
        const top = rect.top + window.scrollY;
        const bottom = rect.bottom + window.scrollY;

        return {
          top,
          bottom,
          height: rect.height,
        };
      };

      const isVisible = (element: Element): boolean => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0
        );
      };

      const pageIndex = (position: number): number =>
        Math.floor(Math.max(0, position - EPSILON) / pageHeight);

      const crossesPage = (rect: Rect): boolean => {
        if (rect.height <= 0) {
          return false;
        }

        return (
          pageIndex(rect.top) !==
          pageIndex(Math.max(rect.top, rect.bottom - EPSILON))
        );
      };

      const isAtPageStart = (top: number): boolean => {
        const offset = ((top % pageHeight) + pageHeight) % pageHeight;
        return offset <= PAGE_START_TOLERANCE;
      };

      const forceLayout = (): void => {
        void document.documentElement.offsetHeight;
      };

      const forceBreakBefore = (
        element: Element,
        type: 'section' | 'entry',
        options?: { lockChildren?: boolean },
      ): boolean => {
        if (element.classList.contains('resume-page-break-before')) {
          return false;
        }

        const htmlElement = element as HTMLElement;

        element.classList.add('resume-page-break-before');
        element.setAttribute('data-resume-pagination-moved', type);

        htmlElement.style.setProperty('break-before', 'page', 'important');
        htmlElement.style.setProperty(
          'page-break-before',
          'always',
          'important',
        );

        /*
         * When a whole small section is moved, it becomes the pagination
         * unit. Its child entries must not receive additional page breaks.
         * This prevents grid/list children (for example Languages) from
         * creating extra blank pages.
         */
        if (options?.lockChildren) {
          element.setAttribute('data-resume-pagination-lock-children', 'true');
        }

        return true;
      };

      const allowSplit = (element: Element): boolean => {
        if (element.classList.contains('resume-allow-split')) {
          return false;
        }

        const htmlElement = element as HTMLElement;

        element.classList.add('resume-allow-split');
        element.setAttribute('data-resume-pagination-split', 'true');

        htmlElement.style.setProperty('break-inside', 'auto', 'important');
        htmlElement.style.setProperty('page-break-inside', 'auto', 'important');

        return true;
      };

      const isInsideLockedSection = (element: Element): boolean => {
        const section = element.closest(
          '[data-resume-section][data-resume-pagination-lock-children="true"]',
        );

        return section !== null && section !== element;
      };

      /*
       * Page-break-before on children of CSS grid/multi-column layouts is not
       * reliable across Chromium versions. In those layouts the parent should
       * be treated as the pagination unit when possible.
       */
      const isInsideComplexFragmentationLayout = (
        element: Element,
      ): boolean => {
        const section = element.closest('[data-resume-section]');
        let current = element.parentElement;

        while (current && current !== section) {
          const style = window.getComputedStyle(current);

          if (style.display === 'grid' || style.display === 'inline-grid') {
            return true;
          }

          const columnCount = Number.parseInt(style.columnCount, 10);
          if (Number.isFinite(columnCount) && columnCount > 1) {
            return true;
          }

          current = current.parentElement;
        }

        return false;
      };

      /*
       * Reset changes first so apply() is idempotent if it is ever called more
       * than once against the same Chromium page.
       */
      document
        .querySelectorAll('[data-resume-pagination-moved]')
        .forEach((element) => {
          const htmlElement = element as HTMLElement;

          element.classList.remove('resume-page-break-before');
          element.removeAttribute('data-resume-pagination-moved');
          element.removeAttribute('data-resume-pagination-lock-children');

          htmlElement.style.removeProperty('break-before');
          htmlElement.style.removeProperty('page-break-before');
        });

      document
        .querySelectorAll('[data-resume-pagination-split]')
        .forEach((element) => {
          const htmlElement = element as HTMLElement;

          element.classList.remove('resume-allow-split');
          element.removeAttribute('data-resume-pagination-split');

          htmlElement.style.removeProperty('break-inside');
          htmlElement.style.removeProperty('page-break-inside');
        });

      forceLayout();

      for (let pass = 0; pass < MAX_PASSES; pass += 1) {
        passes = pass + 1;
        let changed = false;

        /*
         * 1. Oversized entries
         *
         * A block taller than a full A4 page cannot be kept together. Allow
         * Chromium to fragment only that block instead of forcing impossible
         * page-break rules.
         */
        const entries = Array.from(
          document.querySelectorAll('[data-resume-entry]'),
        );

        for (const entry of entries) {
          if (!isVisible(entry) || isInsideLockedSection(entry)) {
            continue;
          }

          const rect = getRect(entry);

          if (rect.height >= pageHeight - OVERSIZED_ENTRY_TOLERANCE) {
            if (allowSplit(entry)) {
              splitEntries += 1;
              changed = true;
            }
          }
        }

        if (changed) {
          forceLayout();
        }

        /*
         * 2. Small-section protection
         *
         * If an entire small section fits on one page but currently crosses a
         * page boundary, move the whole section. Once moved, lock its children
         * from receiving their own page breaks.
         */
        const sections = Array.from(
          document.querySelectorAll('[data-resume-section]'),
        );

        for (const section of sections) {
          if (!isVisible(section)) {
            continue;
          }

          if (section.classList.contains('resume-page-break-before')) {
            continue;
          }

          const rect = getRect(section);
          const smallEnough =
            rect.height > 0 &&
            rect.height <= pageHeight * SMALL_SECTION_MAX_RATIO;

          if (smallEnough && crossesPage(rect) && !isAtPageStart(rect.top)) {
            if (
              forceBreakBefore(section, 'section', {
                lockChildren: true,
              })
            ) {
              movedSections += 1;
              changed = true;
              forceLayout();
            }

            continue;
          }

          /*
           * 3. Orphan-heading protection
           *
           * Keep a section title with at least its first entry when that pair
           * is reasonably small enough to fit together on one page.
           *
           * We intentionally do NOT lock all children here because a long
           * section may still need entry-level pagination later.
           */
          const heading = section.querySelector('[data-resume-section-title]');
          const firstEntry = section.querySelector('[data-resume-entry]');

          if (
            !heading ||
            !firstEntry ||
            !isVisible(heading) ||
            !isVisible(firstEntry)
          ) {
            continue;
          }

          const headingRect = getRect(heading);
          const firstEntryRect = getRect(firstEntry);

          const headingAndFirstEntry: Rect = {
            top: headingRect.top,
            bottom: firstEntryRect.bottom,
            height: firstEntryRect.bottom - headingRect.top,
          };

          if (
            headingAndFirstEntry.height > 0 &&
            headingAndFirstEntry.height <
              pageHeight * HEADING_WITH_FIRST_ENTRY_MAX_RATIO &&
            crossesPage(headingAndFirstEntry) &&
            !isAtPageStart(headingAndFirstEntry.top)
          ) {
            if (forceBreakBefore(section, 'section')) {
              movedSections += 1;
              orphanHeadingsFixed += 1;
              changed = true;
              forceLayout();
            }
          }
        }

        /*
         * 4. Entry protection
         *
         * Move normal entries that would split across a boundary, except when:
         * - the entry is allowed to split because it is taller than a page;
         * - an ancestor section was already moved as one protected unit;
         * - the entry lives in a CSS grid/multi-column layout where individual
         *   break-before rules are unreliable and can create blank pages.
         */
        const currentEntries = Array.from(
          document.querySelectorAll('[data-resume-entry]'),
        );

        for (const entry of currentEntries) {
          if (!isVisible(entry)) {
            continue;
          }

          if (entry.classList.contains('resume-allow-split')) {
            continue;
          }

          if (entry.classList.contains('resume-page-break-before')) {
            continue;
          }

          if (isInsideLockedSection(entry)) {
            continue;
          }

          if (isInsideComplexFragmentationLayout(entry)) {
            continue;
          }

          const rect = getRect(entry);

          if (crossesPage(rect) && !isAtPageStart(rect.top)) {
            if (forceBreakBefore(entry, 'entry')) {
              movedEntries += 1;
              changed = true;
              forceLayout();
            }
          }
        }

        if (!changed) {
          break;
        }
      }

      return {
        movedSections,
        movedEntries,
        splitEntries,
        orphanHeadingsFixed,
        passes,
      };
    });
  }
}
