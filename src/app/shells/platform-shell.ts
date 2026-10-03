import { DOCUMENT } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { PlatformSessionService } from '../core/auth/platform-session.service';
import { LanguageSelector } from '../core/localization/language-selector';

type ConsoleSection =
  'companies' | 'packages' | 'email' | 'residency' | 'operators' | 'audit' | 'keys' | null;

/**
 * The Platform Console: the SaaS operator's back office. A separate trust context from any company
 * workspace, with its own identity, navigation and sign-out; nothing here links into a tenant.
 */
@Component({
  selector: 'app-platform-shell',
  imports: [RouterLink, RouterOutlet, LanguageSelector],
  templateUrl: './platform-shell.html',
  host: { '(document:keydown.escape)': 'closeMenu()' },
})
export class PlatformShell {
  protected readonly session = inject(PlatformSessionService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  protected readonly menuOpen = signal(false);
  protected readonly signingOut = signal(false);
  protected readonly logoutFailed = signal(false);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly section = computed<ConsoleSection>(() => {
    const path = (this.url() ?? '').split(/[?#]/)[0];
    if (path.startsWith('/platform/companies')) return 'companies';
    if (path.startsWith('/platform/packages')) return 'packages';
    if (path.startsWith('/platform/email')) return 'email';
    if (path.startsWith('/platform/residency')) return 'residency';
    if (path.startsWith('/platform/operators')) return 'operators';
    if (path.startsWith('/platform/audit')) return 'audit';
    if (path.startsWith('/platform/keys')) return 'keys';
    return null;
  });

  constructor() {
    effect(() => {
      this.url();
      this.menuOpen.set(false);
    });
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected closeMenu(): void {
    if (!this.menuOpen()) return;
    this.menuOpen.set(false);
    this.document.getElementById('platform-menu-toggle')?.focus();
  }

  protected skipToContent(event: Event): void {
    event.preventDefault();
    this.document.getElementById('main-content')?.focus();
  }

  protected get skipHref(): string {
    return `${this.document.location.pathname}${this.document.location.search}#main-content`;
  }

  logout(): void {
    if (this.signingOut()) return;
    // Company registry data leaves the screen in the same turn the operator identity is cleared.
    this.signingOut.set(true);
    this.logoutFailed.set(false);
    this.menuOpen.set(false);
    this.session.logout().subscribe({
      complete: () => {
        this.signingOut.set(false);
        void this.router.navigate(['/platform/login'], { replaceUrl: true });
      },
      error: () => {
        this.signingOut.set(false);
        this.logoutFailed.set(true);
        void this.router.navigate(['/platform/login'], { replaceUrl: true });
      },
    });
  }
}
