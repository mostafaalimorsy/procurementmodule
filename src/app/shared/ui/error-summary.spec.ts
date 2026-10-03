import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { InvalidSubmitFocus } from '../../core/a11y/invalid-submit-focus';
import { ErrorSummary } from './error-summary';

// CF-020 (B-020-2): an invalid submit is summarised first in the form, in a polite live region, each error linking to its field.

@Component({
  imports: [FormsModule, ErrorSummary],
  template: `
    <form novalidate (ngSubmit)="submit()">
      <app-error-summary />
      <label for="code">Subcontractor code <span aria-hidden="true">*</span></label>
      <input
        id="code"
        name="code"
        [(ngModel)]="code"
        [attr.aria-invalid]="submitted() && !code ? 'true' : null"
        [attr.aria-describedby]="submitted() && !code ? 'code-error' : null"
      />
      @if (submitted() && !code) {
        <span id="code-error">Enter a code.</span>
      }
      <label for="legalName">Legal name</label>
      <input
        id="legalName"
        name="legalName"
        [(ngModel)]="legalName"
        [attr.aria-invalid]="submitted() && !legalName ? 'true' : null"
        [attr.aria-describedby]="submitted() && !legalName ? 'legal-error' : null"
      />
      @if (submitted() && !legalName) {
        <span id="legal-error">A legal name is required.</span>
      }
      <button type="submit">Save</button>
    </form>
  `,
})
class Host {
  readonly submitted = signal(false);
  code = '';
  legalName = '';
  submit(): void {
    this.submitted.set(true);
  }
}

/** Several zero-delay tasks in a row: the summary and the focus each wait for the page's change detection first. */
const tick = async () => {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve));
};

describe('Error summary (CF-020)', () => {
  it('announces the invalid fields politely, links to each, follows corrections and empties on a valid submit', async () => {
    TestBed.inject(InvalidSubmitFocus).start();
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    document.body.appendChild(element);
    const region = element.querySelector('.prj-error-summary')!;
    // Present before anything is submitted, so the announcement is heard when it fills.
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('aria-atomic')).toBe('true');
    expect(region.getAttribute('role')).toBeNull();
    expect(region.textContent!.trim()).toBe('');

    element.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    fixture.detectChanges();
    await tick();
    fixture.detectChanges();
    expect(region.textContent).toContain('2 fields need attention');
    const links = [...region.querySelectorAll('a')];
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['#code', '#legalName']);
    expect(links[0].textContent).toContain('Subcontractor code');
    expect(links[0].textContent).not.toContain('*');
    expect(links[0].textContent).toContain('Enter a code.');
    expect(links[1].textContent).toContain('Legal name');
    // Focus still lands on the first invalid field.
    expect(document.activeElement?.id).toBe('code');

    links[1].click();
    expect(document.activeElement?.id).toBe('legalName');

    // A correction updates the list as it is typed.
    const code = element.querySelector<HTMLInputElement>('#code')!;
    code.value = 'ACME-01';
    code.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await tick();
    fixture.detectChanges();
    expect(region.textContent).toContain('1 field needs attention');
    expect([...region.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toEqual([
      '#legalName',
    ]);

    const legal = element.querySelector<HTMLInputElement>('#legalName')!;
    legal.value = 'ACME Contracting';
    legal.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    fixture.detectChanges();
    await tick();
    fixture.detectChanges();
    expect(region.textContent!.trim()).toBe('');
    element.remove();
  });
});
