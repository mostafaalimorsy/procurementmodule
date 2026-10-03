import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { TenantLogin } from './tenant-login';

describe('Tenant sign-in returns to the page that sent here (CF-011)', () => {
  function render(returnUrl: string | null) {
    TestBed.configureTestingModule({
      imports: [TenantLogin],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: { login: () => of(undefined) } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap(returnUrl ? { returnUrl } : {}) },
          },
        },
      ],
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(TenantLogin);
    fixture.detectChanges();
    fixture.componentInstance.email = 'pam@delta.example';
    fixture.componentInstance.password = 'a passphrase';
    fixture.componentInstance.submit();
    return navigate;
  }

  it('goes back to a workspace page after signing in', () => {
    expect(render('/tenders/t1/evaluation?tab=technical')).toHaveBeenCalledWith(
      '/tenders/t1/evaluation?tab=technical',
    );
  });

  it('ignores a return address outside the workspace and lands on Home', () => {
    expect(render('//evil.example/phish')).toHaveBeenCalledWith('/');
    TestBed.resetTestingModule();
    expect(render('https://evil.example')).toHaveBeenCalledWith('/');
  });
});

describe('Tenant sign-in with an authenticator (CF-065)', () => {
  it('asks for the code after the password, shows the recovery codes once, then continues', () => {
    const login = vi.fn(() =>
      of({
        status: 'enrollment_required' as const,
        challenge: 'challenge-1',
        secret: 'JBSWY3DPEHPK3PXP',
        provisioningUri: 'otpauth://totp/x',
      }),
    );
    const verify = vi.fn(() => of(['AAAA-BBBB', 'CCCC-DDDD']));
    TestBed.configureTestingModule({
      imports: [TenantLogin],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: { login, verify } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(TenantLogin);
    fixture.detectChanges();
    fixture.componentInstance.email = 'pam@delta.example';
    fixture.componentInstance.password = 'a passphrase';
    fixture.componentInstance.submit();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-testid="mfa-secret"]')!.textContent).toContain(
      'JBSW Y3DP EHPK 3PXP',
    );
    expect(navigate).not.toHaveBeenCalled();
    fixture.componentInstance.code = '123456';
    fixture.componentInstance.verify(fixture.componentInstance.step()!);
    fixture.detectChanges();
    expect(verify).toHaveBeenCalledWith('challenge-1', '123456');
    expect(element.querySelector('[data-testid="recovery-codes"]')!.textContent).toContain(
      'CCCC-DDDD',
    );
    expect(navigate).not.toHaveBeenCalled();
    fixture.componentInstance.continueAfterCodes();
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('returns to the password step and names the wait once the code budget is spent (re-audit R-05)', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TenantLogin],
      providers: [
        provideRouter([]),
        {
          provide: SessionService,
          useValue: {
            verify: () =>
              throwError(() => ({ status: 429, error: { code: 'mfa.attempts_exhausted' } })),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
    });
    const fixture = TestBed.createComponent(TenantLogin);
    const page = fixture.componentInstance;
    const challenge = {
      status: 'totp_required',
      challenge: 'c1',
      secret: null,
      provisioningUri: null,
    } as const;
    page.step.set(challenge);
    page.code = '123456';
    page.verify(challenge);
    fixture.detectChanges();
    expect(page.step()).toBeNull();
    expect(page.error()).toBe(
      'Too many codes were not accepted. Wait 15 minutes, then sign in again.',
    );
  });
});
