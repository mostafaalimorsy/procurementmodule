import { Signal, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { ForgotPassword } from './forgot-password';
import { InvitationAcceptance } from './invitation-acceptance';
import { ResetPassword } from './reset-password';
import { TenantIdentityApi } from './tenant-identity.api';

/** CF-094 (Final stage): the three signed-out account pages — link tokens leave the address bar, passwords leave memory, errors are worded. */
/** What both link pages share. */
interface LinkPage {
  readonly token: string;
  password: string;
  confirmPassword: string;
  readonly busy: Signal<boolean>;
  submit(): void;
}

const text = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ');

function configure(
  api: Partial<
    Record<
      'acceptInvitation' | 'resetPassword' | 'forgotPassword',
      (...args: string[]) => Observable<void>
    >
  >,
) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: TenantIdentityApi, useValue: api }],
  });
  return vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
}

function arrive(fragment: string) {
  window.history.replaceState(null, '', `/en/accept-invitation${fragment}`);
}

describe.each([
  {
    name: 'Invitation acceptance',
    component: InvitationAcceptance as Type<LinkPage>,
    method: 'acceptInvitation' as const,
    landing: { invitationAccepted: '1' },
    failure: 'This invitation link is invalid or expired. Ask your Company Admin to resend it.',
  },
  {
    name: 'Password reset',
    component: ResetPassword as Type<LinkPage>,
    method: 'resetPassword' as const,
    landing: { passwordReset: '1' },
    failure: 'This reset link is invalid or expired. Request a new password reset.',
  },
])('$name (CF-094)', ({ component, method, landing, failure }) => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('takes the token from the fragment, clears it from the address bar and sends it once with the password', () => {
    arrive('#token=abc123');
    const call = vi.fn(() => of(undefined));
    const navigate = configure({ [method]: call });
    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    expect(window.location.hash).toBe('');
    expect(fixture.componentInstance.token).toBe('abc123');

    const page = fixture.componentInstance;
    page.password = 'a long passphrase';
    page.confirmPassword = 'a long passphrase';
    page.submit();
    expect(call).toHaveBeenCalledWith('abc123', 'a long passphrase');
    // The passwords do not stay in the form once sent.
    expect([page.password, page.confirmPassword]).toEqual(['', '']);
    expect(navigate).toHaveBeenCalledWith(['/login'], { replaceUrl: true, queryParams: landing });
  });

  it('refuses a mismatch or a short password without calling the server', () => {
    arrive('#token=abc123');
    const call = vi.fn(() => of(undefined));
    configure({ [method]: call });
    const fixture = TestBed.createComponent(component);
    const page = fixture.componentInstance;
    page.password = 'a long passphrase';
    page.confirmPassword = 'another passphrase';
    fixture.detectChanges();
    expect(text(fixture.nativeElement)).toContain('The passwords do not match.');
    page.submit();
    page.password = page.confirmPassword = 'short';
    page.submit();
    expect(call).not.toHaveBeenCalled();
  });

  it('names an incomplete link and disables the form when there is no token', () => {
    arrive('');
    const call = vi.fn(() => of(undefined));
    configure({ [method]: call });
    const fixture = TestBed.createComponent(component);
    fixture.componentInstance.password = fixture.componentInstance.confirmPassword =
      'a long passphrase';
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).not.toBeNull();
    expect(
      ((fixture.nativeElement as HTMLElement).querySelector('button.primary') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fixture.componentInstance.submit();
    expect(call).not.toHaveBeenCalled();
  });

  it('shows a worded error, never the server response, when the link is refused', () => {
    arrive('#token=expired');
    configure({
      [method]: () =>
        throwError(() => ({
          status: 400,
          error: { code: 'token.invitation_invalid', detail: 'raw detail' },
        })),
    });
    const fixture = TestBed.createComponent(component);
    const page = fixture.componentInstance;
    page.password = page.confirmPassword = 'a long passphrase';
    page.submit();
    fixture.detectChanges();
    expect(text(fixture.nativeElement)).toContain(failure);
    expect(text(fixture.nativeElement)).not.toContain('raw detail');
    expect(page.busy()).toBe(false);
  });
});

describe('Forgot password (CF-094)', () => {
  it('sends the trimmed address, confirms without saying whether it exists, and forgets the address', () => {
    const call = vi.fn(() => of(undefined));
    configure({ forgotPassword: call });
    const fixture = TestBed.createComponent(ForgotPassword);
    const page = fixture.componentInstance;
    page.email = '  pam@delta.example ';
    page.submit();
    fixture.detectChanges();
    expect(call).toHaveBeenCalledWith('pam@delta.example');
    expect(page.complete()).toBe(true);
    expect(page.email).toBe('');
  });

  it('shows a worded error when the request fails', () => {
    configure({ forgotPassword: () => throwError(() => ({ status: 503 })) });
    const fixture = TestBed.createComponent(ForgotPassword);
    fixture.componentInstance.email = 'pam@delta.example';
    fixture.componentInstance.submit();
    fixture.detectChanges();
    expect(text(fixture.nativeElement)).toContain(
      'The request could not be submitted. Please try again.',
    );
    expect(fixture.componentInstance.complete()).toBe(false);
  });
});
