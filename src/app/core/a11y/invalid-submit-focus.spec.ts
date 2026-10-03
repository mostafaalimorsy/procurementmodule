import { TestBed } from '@angular/core/testing';
import { InvalidSubmitFocus, focusFirstInvalid } from './invalid-submit-focus';

// CF-020: an invalid submit moves focus to the first field the page marked invalid; a valid submit leaves focus alone.

describe('Invalid submit focus (CF-020)', () => {
  it('focuses the first field marked invalid, and nothing when none is', async () => {
    TestBed.inject(InvalidSubmitFocus).start();
    const form = document.createElement('form');
    form.innerHTML =
      '<input id="a"><input id="b"><input id="c"><button id="go" type="submit">Save</button>';
    document.body.appendChild(form);
    form.addEventListener('submit', (event) => event.preventDefault());
    const go = form.querySelector<HTMLButtonElement>('#go')!;

    go.focus();
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await (async () => {
      for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve));
    })();
    expect(document.activeElement).toBe(go);

    // The page marks fields invalid in its own submit handler, after which focus moves to the first.
    form.querySelector('#b')!.setAttribute('aria-invalid', 'true');
    form.querySelector('#c')!.setAttribute('aria-invalid', 'true');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await (async () => {
      for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve));
    })();
    expect(document.activeElement?.id).toBe('b');
    expect(focusFirstInvalid(document.createElement('div'))).toBe(false);
    form.remove();
  });
});
