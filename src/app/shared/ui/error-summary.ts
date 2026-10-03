import { DOCUMENT } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';

export interface ErrorSummaryEntry {
  /** The field's id (the link target); empty when the field has none, and the entry is then plain text. */
  readonly id: string;
  readonly label: string;
  readonly error: string;
}

/**
 * CF-020 (B-020-2): the errors of an invalid submit, listed where the user starts reading the form. Placed first in a form; the form
 * needs nothing else — like the first-invalid-field focus (`InvalidSubmitFocus`), it reads the product's convention for a field whose
 * error is shown next to it: `aria-invalid="true"` plus the error in `aria-describedby`.
 *
 * The region is always present and polite (not `role="alert"`), so announcing "2 fields need attention" never cuts off the screen
 * reader reading the focused field. Each entry links to its field; the list follows the corrections as they are typed and empties on a
 * valid submit.
 */
@Component({
  selector: 'app-error-summary',
  template: `
    <div class="prj-error-summary" aria-live="polite" aria-atomic="true">
      @let count = entries().length;
      @if (count > 0) {
        <div class="prj-error-summary-box">
          <p class="prj-error-summary-title">
            <span i18n="@@form.errorSummary">{count, plural,
              =1 {1 field needs attention}
              other {{{count}} fields need attention}
            }</span>
          </p>
          <ul>
            @for (entry of entries(); track $index) {
              <li>
                @if (entry.id) {
                  <a [attr.href]="'#' + entry.id" (click)="go($event, entry.id)"
                    >{{ entry.label }}
                    @if (entry.error) {
                      <span class="prj-error-summary-error">{{ entry.error }}</span>
                    }
                  </a>
                } @else {
                  {{ entry.label }}
                  @if (entry.error) {
                    <span class="prj-error-summary-error">{{ entry.error }}</span>
                  }
                }
              </li>
            }
          </ul>
        </div>
      }
    </div>
  `,
  styles: `
    .prj-error-summary-box {
      margin-block: 0 1.25rem;
      padding: 0.85rem 1rem;
      border-inline-start: 3px solid var(--color-warning);
      border-radius: 2px;
      background: var(--color-surface);
    }

    .prj-error-summary-title {
      margin: 0 0 0.4rem;
      color: var(--color-warning);
      font-weight: 600;
    }

    ul {
      margin: 0;
      padding-inline-start: 1.1rem;
    }

    a {
      color: var(--color-ink);
    }

    .prj-error-summary-error {
      display: block;
      color: var(--color-muted);
      font-size: 0.85rem;
    }
  `,
})
export class ErrorSummary implements OnInit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  readonly entries = signal<readonly ErrorSummaryEntry[]>([]);
  private submitted = false;

  ngOnInit(): void {
    const form = this.host.nativeElement.closest('form');
    if (!form) return;
    // After one task, as the first-invalid-field focus does: the page's own submit handler has marked the fields by then.
    const onSubmit = () => {
      this.submitted = true;
      setTimeout(() => this.collect(form));
    };
    const onEdit = () => {
      if (this.submitted) setTimeout(() => this.collect(form));
    };
    form.addEventListener('submit', onSubmit);
    form.addEventListener('input', onEdit);
    form.addEventListener('change', onEdit);
    this.destroyRef.onDestroy(() => {
      form.removeEventListener('submit', onSubmit);
      form.removeEventListener('input', onEdit);
      form.removeEventListener('change', onEdit);
    });
  }

  /**
   * Red-team B-092-6 (CF-092): the server refused the submit and the page has marked the fields it listed — list them too, once the
   * marks are rendered, and keep following the corrections as for an invalid submit.
   */
  refresh(): void {
    const form = this.host.nativeElement.closest('form');
    if (!form) return;
    this.submitted = true;
    afterNextRender(() => this.collect(form), { injector: this.injector });
  }

  protected go(event: Event, id: string): void {
    event.preventDefault();
    this.document.getElementById(id)?.focus();
  }

  private collect(form: HTMLFormElement): void {
    const seen = new Set<string>();
    const entries: ErrorSummaryEntry[] = [];
    for (const field of form.querySelectorAll<HTMLElement>('[aria-invalid="true"]')) {
      // A radio group is one field.
      const key = field.id || field.getAttribute('name') || `#${entries.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ id: field.id, label: this.labelOf(form, field), error: this.errorOf(field) });
    }
    this.entries.set(entries);
  }

  private labelOf(form: HTMLFormElement, field: HTMLElement): string {
    const label = field.id
      ? [...form.querySelectorAll<HTMLLabelElement>('label[for]')].find(
          (candidate) => candidate.htmlFor === field.id,
        )
      : undefined;
    const legend = field.closest('fieldset')?.querySelector<HTMLElement>(':scope > legend');
    return (
      (label && readable(label)) ||
      field.getAttribute('aria-label')?.trim() ||
      (legend && readable(legend)) ||
      ''
    );
  }

  private errorOf(field: HTMLElement): string {
    return (field.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => this.document.getElementById(id))
      .filter((element): element is HTMLElement => !!element)
      .map(readable)
      .filter(Boolean)
      .join(' ');
  }
}

/** The text a reader sees, without decorations hidden from assistive technology (the required-field asterisk). */
function readable(element: HTMLElement): string {
  const copy = element.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove());
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
}
