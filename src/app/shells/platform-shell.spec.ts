import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { PlatformSessionService } from '../core/auth/platform-session.service';
import { PlatformShell } from './platform-shell';

function operator() {
  const session = TestBed.inject(PlatformSessionService);
  (session as unknown as { current: { set: (value: unknown) => void } }).current.set({
    id: 'op-1',
    email: 'operator@example.com',
  });
}

describe('Platform Console shell', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PlatformShell],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('presents its own identity and navigation, and never loads or links a company session', () => {
    operator();
    const fixture = TestBed.createComponent(PlatformShell);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Platform Console');
    expect(element.querySelector('a[href="/platform/companies"]')).not.toBeNull();
    expect(element.querySelector('a[href="/platform/packages"]')).not.toBeNull();
    expect(element.querySelector('.account bdi')?.textContent).toBe('operator@example.com');
    expect(element.querySelector('a[href="/login"], a[href="/projects"]')).toBeNull();
    // The console shell does not ask the tenant plane who the user is.
    TestBed.inject(HttpTestingController).verify();
  });

  it('offers no console navigation before an operator has signed in', () => {
    const fixture = TestBed.createComponent(PlatformShell);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.primary-nav')).toBeNull();
    expect(element.querySelector('.shell-signout')).toBeNull();
  });

  it('removes the routed registry view in the same turn sign-out starts', () => {
    operator();
    const fixture = TestBed.createComponent(PlatformShell);
    fixture.detectChanges();
    const registry = document.createElement('p');
    registry.textContent = 'COMPANY REGISTRY';
    fixture.nativeElement.querySelector('router-outlet').append(registry);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    fixture.nativeElement.querySelector('button.shell-signout').click();
    fixture.detectChanges();
    expect(TestBed.inject(PlatformSessionService).identity()).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('COMPANY REGISTRY');

    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/platform/auth/csrf').flush(null);
    http.expectOne('/api/v1/platform/auth/logout').flush(null);
    http.expectOne('/api/v1/platform/auth/csrf').flush(null);
    http.verify();
  });
});
