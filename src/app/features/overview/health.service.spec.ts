import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(HealthService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('reports live and ready independently, and can retry a database outage', () => {
    service.check();
    service.check(); // Concurrent clicks must not duplicate probes.
    http.expectOne('/health/live').flush('Healthy');
    http.expectOne('/health/ready').flush('Unhealthy', { status: 503, statusText: 'Unavailable' });
    expect(service.live()).toBe('healthy');
    expect(service.ready()).toBe('unavailable');
    expect(service.checking()).toBe(false);
    service.check();
    http.expectOne('/health/live').flush('Healthy');
    http.expectOne('/health/ready').flush('Healthy');
    expect(service.ready()).toBe('healthy');
  });

  it('ends the checking state when the network is unavailable', () => {
    service.check();
    http.expectOne('/health/live').error(new ProgressEvent('error'));
    http.expectOne('/health/ready').error(new ProgressEvent('error'));
    expect(service.live()).toBe('unavailable');
    expect(service.ready()).toBe('unavailable');
    expect(service.checking()).toBe(false);
  });
});
