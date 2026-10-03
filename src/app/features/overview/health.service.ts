import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { catchError, forkJoin, map, of, timeout } from 'rxjs';

export type HealthState = 'checking' | 'healthy' | 'unavailable';

@Injectable({ providedIn: 'root' })
export class HealthService {
  private readonly http = inject(HttpClient);
  readonly live = signal<HealthState>('checking');
  readonly ready = signal<HealthState>('checking');
  readonly checking = signal(false);

  check(): void {
    if (this.checking()) return;
    this.checking.set(true);
    this.live.set('checking');
    this.ready.set('checking');
    forkJoin({ live: this.probe('/health/live'), ready: this.probe('/health/ready') }).subscribe(
      (result) => {
        this.live.set(result.live);
        this.ready.set(result.ready);
        this.checking.set(false);
      },
    );
  }

  private probe(path: string) {
    return this.http.get(path, { responseType: 'text' }).pipe(
      timeout(5000),
      map((): HealthState => 'healthy'),
      catchError(() => of<HealthState>('unavailable')),
    );
  }
}
