import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, Routes, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { SessionService } from '../../core/auth/session.service';
import { HealthService } from './health.service';
import { Overview } from './overview';
import arabicMessages from '../../../locale/messages.ar.json';
import englishMessages from '../../../locale/messages.en.json';
import { routes as appRoutes } from '../../app.routes';

const health = {
  live: signal<'healthy'>('healthy'),
  ready: signal<'healthy'>('healthy'),
  checking: signal(false),
  check: vi.fn(),
};

function configure(
  query: Record<string, string> = {},
  signedIn = true,
  roles: string[] = ['CompanyAdmin'],
  routes: Routes = [],
) {
  const signedInIdentity = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    email: 'nadia@example.com',
    displayName: 'Nadia Khalil',
    companyName: 'Delta Construction',
    roles,
    // Users.View is the Company Admin's (role matrix); a Project Manager does not manage users.
    permissions: roles.includes('CompanyAdmin')
      ? ['Projects.View', 'Users.View']
      : ['Projects.View'],
  };
  const identity = signal<typeof signedInIdentity | null>(signedIn ? signedInIdentity : null);
  TestBed.configureTestingModule({
    imports: [Overview],
    providers: [
      { provide: HealthService, useValue: health },
      {
        provide: SessionService,
        useValue: {
          identity,
          hasPermission: (permission: string) => identity()?.permissions.includes(permission),
        },
      },
      {
        provide: EntitlementsService,
        useValue: { has: (feature: string) => feature === 'projects' },
      },
      { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(query)) } },
    ],
  });
  TestBed.inject(Router).resetConfig(routes);
  return TestBed.createComponent(Overview);
}

describe('Overview', () => {
  it('keeps the English representative copy and isolates the numbered step', () => {
    const fixture = configure({}, false);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('YOUR WORKSPACE');
    expect(text).toContain('A foundation forbetter subcontractor decisions.');
    expect(text).toContain('Start with your company account');
    // CF-100: the public page carries no service diagnostics.
    expect(text).not.toContain('Service connection');
    // Latin digits stay an isolated LTR run; the separator follows the document direction so in
    // Arabic it sits between the number and the step heading instead of outside the number.
    const marker = fixture.nativeElement.querySelector('.section-number') as HTMLElement;
    expect(marker.getAttribute('aria-hidden')).toBe('true');
    expect(marker.hasAttribute('dir')).toBe(false);
    const [digits, separator] = Array.from(marker.children) as HTMLElement[];
    expect(digits.tagName).toBe('BDI');
    expect(digits.dir).toBe('ltr');
    expect(digits.textContent).toBe('01');
    expect(separator.classList).toContain('section-separator');
    expect(separator.textContent).toBe('/');
    expect(marker.hasAttribute('i18n')).toBe(false);
  });

  it('has Arabic translations for every message on the representative surface', () => {
    const source = englishMessages.translations as Record<string, string>;
    const arabic = arabicMessages.translations as Record<string, string>;
    // The representative surface is the page plus the shell around it (header, navigation,
    // language control, footer and the document title).
    const representativeIds = Object.keys(source).filter(
      (id) =>
        /^(overview|statusIndicator|shell|nav|locale)\./.test(id) ||
        ['title.workspace', 'login.companySignIn'].includes(id),
    );
    expect(representativeIds).toEqual(
      expect.arrayContaining([
        'overview.hero',
        'overview.serviceConnection',
        'overview.connectionHelp',
        'statusIndicator.unavailable',
        'shell.brand',
        'shell.footer',
        'shell.homeLabel',
        'locale.language',
        'title.workspace',
      ]),
    );
    for (const id of representativeIds) {
      expect(arabic[id], id).toBeTruthy();
      expect(arabic[id].trim(), id).not.toBe(source[id].trim());
      expect(arabic[id], id).toMatch(/[\u0600-\u06ff]/);
    }
    // The step number is structure, not copy, so no translator can reorder or localize its digits.
    expect(source['overview.stepNumber']).toBeUndefined();
    expect(arabic['overview.hero']).toContain('المقاولين\u00a0من\u00a0الباطن');
    expect(arabic['overview.hero']).toContain('{$LINE_BREAK}');
    expect(arabic['overview.welcome']).toContain(
      '{$START_TAG_BDI}{$INTERPOLATION}{$CLOSE_TAG_BDI}',
    );
  });

  it('orients a signed-in user with company, identity and an available next action', () => {
    const fixture = configure();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Delta Construction');
    expect(text).toContain('Welcome, Nadia Khalil');
    // CF-016: the Company Admin's link is company setup, and the service diagnostics are theirs.
    expect(fixture.nativeElement.querySelector('a[href="/admin/company"]')?.textContent).toContain(
      'Company setup',
    );
    expect(text).toContain('Service connection');
    expect(text).not.toContain('coming next');
  });

  it.each([
    ['ApproverDirector', 'Awaiting my approval', '/#my-work-title'],
    ['ProcurementManager', 'Tenders in progress', '/tenders'],
    ['ProcurementOfficer', 'Sourcing and tenders', '/sourcing'],
    ['TechnicalEvaluator', 'My evaluations', '/tenders?stage=Opened'],
    ['CommercialQs', 'Leveling to complete', '/tenders?stage=Opened'],
    ['ProjectManager', 'Closeouts due', '/closeouts?status=Pending'],
  ])(
    'gives the %s one link that fits the role and no diagnostics panel (CF-016)',
    (role, label, href) => {
      const fixture = configure({}, true, [role]);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const link = element.querySelector('.role-link a') as HTMLAnchorElement;
      expect(link.textContent).toContain(label);
      expect(link.getAttribute('href')).toBe(href);
      expect(element.textContent).not.toContain('Service connection');
    },
  );

  it('warns every signed-in role with a banner only when the service cannot be reached (CF-016)', () => {
    const fixture = configure({}, true, ['ProjectManager']);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('cannot be reached');
    (health.ready as unknown as { set: (value: string) => void }).set('unavailable');
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent,
    ).toContain('cannot be reached');
    (health.ready as unknown as { set: (value: string) => void }).set('healthy');
  });

  it('names the page a signed-in person may not open, and who can grant access (CF-011)', () => {
    const fixture = configure(
      { access: 'denied', page: 'tenders/:id/decision' },
      true,
      ['ProjectManager'],
      [
        {
          path: 'tenders/:id/decision',
          title: 'Recommendation and decision | Product',
          children: [],
        },
      ],
    );
    fixture.detectChanges();
    const notice = fixture.nativeElement.querySelector('[role="alert"]').textContent as string;
    expect(notice).toContain('You do not have access to Recommendation and decision');
    expect(notice).toContain('Ask your Company Admin');
  });

  it('does not send the Company Admin to ask themselves: it names what the admin role is for (runtime validation D3)', () => {
    const fixture = configure(
      { access: 'denied', page: 'tenders/:id/decision' },
      true,
      ['CompanyAdmin'],
      [
        {
          path: 'tenders/:id/decision',
          title: 'Recommendation and decision | Product',
          children: [],
        },
      ],
    );
    fixture.detectChanges();
    const notice = fixture.nativeElement.querySelector('[role="alert"]').textContent as string;
    expect(notice).toContain('You do not have access to Recommendation and decision');
    expect(notice).toContain('The Company Admin role administers the company');
    expect(notice).not.toContain('Ask your Company Admin');
  });

  it.each([
    ['admin/users', 'Company users'],
    ['admin/audit', 'Audit log'],
    ['search', 'Search'],
  ])(
    'names a page refused by the permission guard from the real routes: %s (CF-011 AC3)',
    (page, title) => {
      const fixture = configure({ access: 'denied', page }, true, ['ProjectManager'], appRoutes);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
        `You do not have access to ${title}.`,
      );
    },
  );

  it.each([
    ['access', 'denied', 'You do not have access to that page'],
    ['plan', 'unavailable', 'not included in your company’s current plan'],
  ])('explains a safe %s redirect', (key, value, expected) => {
    const fixture = configure({ [key]: value });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(expected);
  });
});
