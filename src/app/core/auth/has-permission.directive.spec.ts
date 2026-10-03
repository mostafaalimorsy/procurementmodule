import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HasPermissionDirective } from './has-permission.directive';
import { SessionService } from './session.service';

@Component({
  imports: [HasPermissionDirective],
  template: '<button *appHasPermission="permission()">Edit project</button>',
})
class Host {
  permission = signal('Projects.Edit');
}

describe('HasPermissionDirective', () => {
  it('adds authorized actions and removes them after logout or permission changes', () => {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(Host);
    const session = TestBed.inject(SessionService);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();

    session.load().subscribe();
    http.expectOne('/api/v1/session').flush({
      userId: 'user-1',
      tenantId: 'tenant-a',
      roles: [],
      permissions: ['Projects.Edit'],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button')).not.toBeNull();

    fixture.componentInstance.permission.set('directory.write');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();

    fixture.componentInstance.permission.set('Projects.Edit');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button')).not.toBeNull();

    session.clear();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    http.verify();
  });
});
