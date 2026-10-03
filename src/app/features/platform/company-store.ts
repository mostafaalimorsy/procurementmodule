import { Injectable, inject, signal } from '@angular/core';
import { Observable, forkJoin } from 'rxjs';
import {
  Company,
  CompanyInFlight,
  CompanyUsage,
  PlatformApi,
  PlatformPackage,
  problemMessage,
} from './platform-api.service';

/**
 * One company's registry record, shared by its detail sections. Provided by the detail page, so each
 * company view has its own instance and nothing outlives the page. Every mutation replaces the
 * record with the server's response, which also carries the new concurrency version.
 */
@Injectable()
export class CompanyStore {
  private readonly api = inject(PlatformApi);
  readonly company = signal<Company | null>(null);
  readonly packages = signal<PlatformPackage[]>([]);
  /** Measured usage; null while unknown. A failed read never blocks the rest of the page. */
  readonly usage = signal<CompanyUsage | null>(null);
  /** CF-061 (ADR-133): in-flight work, read when a dialog that could freeze it opens; null while unknown. */
  readonly inFlight = signal<CompanyInFlight | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');

  load(id: string): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin({ company: this.api.company(id), packages: this.api.packages() }).subscribe({
      next: (value) => {
        this.company.set(value.company);
        this.packages.set(value.packages);
        this.loading.set(false);
        this.loadUsage(id);
      },
      error: (error: unknown) => {
        this.error.set(problemMessage(error));
        this.loading.set(false);
      },
    });
  }

  loadUsage(id: string): void {
    this.api.companyUsage(id).subscribe({
      next: (usage) => this.usage.set(usage),
      error: () => this.usage.set(null),
    });
  }

  loadInFlight(id: string): void {
    this.inFlight.set(null);
    this.api.companyInFlight(id).subscribe({
      next: (counts) => this.inFlight.set(counts),
      error: () => this.inFlight.set(null),
    });
  }

  reload(): void {
    const company = this.company();
    if (company) this.load(company.id);
  }

  /**
   * Runs one mutation at a time and reports its outcome on the shared notice line. `done` runs on
   * success only; `settled` runs either way (for example to close a confirmation so an error shows).
   */
  apply(
    request: Observable<Company>,
    message: string,
    done?: () => void,
    settled?: () => void,
  ): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    request.subscribe({
      next: (company) => {
        this.company.set(company);
        this.busy.set(false);
        this.notice.set(message);
        done?.();
        settled?.();
        // Terms may have changed, so the same usage now sits against different limits.
        this.loadUsage(company.id);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(problemMessage(error));
        settled?.();
      },
    });
  }

  /** For operations that change nothing on the record itself (for example a resend). */
  run(request: Observable<unknown>, message: string): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.notice.set(message);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(problemMessage(error));
      },
    });
  }
}
