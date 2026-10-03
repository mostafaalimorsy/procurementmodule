import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { knownProductProblem } from '../../core/localization/product-problem';
import { ComplianceChips } from './compliance-chips';
import { ComplianceTypesPage } from './compliance-types';
import { ComplianceType, SubcontractorCompliance } from './compliance.api';
import { SubcontractorComplianceView } from './subcontractor-compliance';

const text = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ');

function configure(permissions: readonly string[]) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  (
    TestBed.inject(SessionService) as unknown as {
      currentIdentity: { set: (value: unknown) => void };
    }
  ).currentIdentity.set({
    userId: 'u1',
    tenantId: 't',
    roles: ['ProcurementManager'],
    permissions,
  });
  return TestBed.inject(HttpTestingController);
}

const type = (overrides: Partial<ComplianceType> = {}): ComplianceType => ({
  id: 'ct1',
  name: 'Commercial registration',
  description: null,
  requiresNumber: true,
  requiresIssuer: false,
  requiresExpiry: true,
  awardBlocking: true,
  appliesToAllTrades: true,
  trades: [],
  presetKey: null,
  isActive: true,
  version: 'v1',
  ...overrides,
});

const file = (): SubcontractorCompliance => ({
  subcontractorId: 's1',
  asOf: '2026-10-01',
  requirements: [
    {
      type: type(),
      required: true,
      state: 'Expired',
      current: {
        id: 'd1',
        typeId: 'ct1',
        typeName: 'Commercial registration',
        number: 'CR-1',
        issuer: null,
        issuedOn: null,
        expiresOn: '2026-09-28',
        note: null,
        isWithdrawal: false,
        state: 'Expired',
        fileName: 'cr.pdf',
        sizeBytes: 100,
        fileScanState: 'Pending',
        recordedAtUtc: '2026-09-01T08:00:00Z',
        recordedByName: 'Omar Officer',
        supersedesId: null,
      },
    },
    {
      type: type({ id: 'ct2', name: 'Insurance', awardBlocking: false }),
      required: true,
      state: 'Missing',
      current: null,
    },
  ],
  history: [],
  vendor: [
    {
      tradeId: 't1',
      tradeCode: 'HVAC',
      tradeName: 'HVAC',
      status: 'Watchlist',
      reason: 'Late twice',
      setAtUtc: '2026-09-02T08:00:00Z',
      setByName: 'Maha Manager',
    },
  ],
  vendorHistory: [],
  blocked: true,
});

describe('Compliance (CF-056)', () => {
  it('shows each required document with its state, holds a file until scanned, and records a renewal as a form with its file', () => {
    const http = configure([
      'Subcontractors.View',
      'Compliance.Record',
      'Compliance.SetVendorStatus',
    ]);
    const fixture = TestBed.createComponent(SubcontractorComplianceView);
    fixture.componentRef.setInput('subcontractorId', 's1');
    fixture.detectChanges();
    http.expectOne('/api/v1/subcontractors/s1/compliance').flush(file());
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const content = text(element);
    expect(content).toContain(
      'Blocked in the directory: no approved-vendor status overrides a block.',
    );
    expect(content).toContain('Expired');
    expect(content).toContain('Blocks award');
    expect(content).toContain('Being scanned for malware');
    expect(element.querySelector('a[download]')).toBeNull();
    expect(content).toContain('Watchlist');

    const page = fixture.componentInstance;
    page.form = {
      typeId: 'ct1',
      number: 'CR-2',
      issuer: '',
      issuedOn: '',
      expiresOn: '2027-09-30',
      note: '',
    };
    page.attachment = new File(['%PDF-1.7'], 'cr-2026.pdf');
    page.record();
    const request = http.expectOne('/api/v1/subcontractors/s1/compliance/documents');
    const body = request.request.body as FormData;
    expect(body.get('number')).toBe('CR-2');
    expect(body.get('expiresOn')).toBe('2027-09-30');
    expect(body.get('typeId')).toBe('ct1');
    expect(body.get('issuer')).toBeNull();
    expect((body.get('file') as File).name).toBe('cr-2026.pdf');
    request.flush(file());

    page.vendorStatus['t1'] = 'Approved';
    page.vendorReason['t1'] = 'Clean record';
    page.setVendor('t1');
    expect(
      http.expectOne('/api/v1/subcontractors/s1/compliance/vendor-status').request.body,
    ).toEqual({
      tradeId: 't1',
      status: 'Approved',
      reason: 'Clean record',
    });
  });

  it('lets an administrator add a preset and a scoped, award-blocking type of their own', () => {
    const http = configure(['Subcontractors.View', 'Compliance.ManageTypes']);
    const fixture = TestBed.createComponent(ComplianceTypesPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/compliance-types').flush([type()]);
    http.expectOne('/api/v1/compliance-types/presets').flush([
      {
        key: 'ksa.gosi_certificate',
        name: 'GOSI certificate',
        description: 'GOSI',
        requiresNumber: true,
        requiresIssuer: false,
        requiresExpiry: true,
        added: false,
      },
    ]);
    http.expectOne('/api/v1/trades').flush([
      {
        id: 't1',
        code: 'HVAC',
        name: 'HVAC',
        isActive: true,
        subcontractorCount: 1,
        updatedAtUtc: '',
        version: 'v',
      },
    ]);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(text(element)).toContain('Blocks the award');
    const page = fixture.componentInstance;
    page.addPreset(page.presets()[0]);
    const preset = http.expectOne(
      (request) => request.method === 'POST' && request.url === '/api/v1/compliance-types/presets',
    );
    expect(preset.request.body).toEqual({ key: 'ksa.gosi_certificate' });
    preset.flush(type({ id: 'ct9', name: 'GOSI certificate', presetKey: 'ksa.gosi_certificate' }));
    http.expectOne('/api/v1/compliance-types').flush([type()]);
    http.expectOne('/api/v1/compliance-types/presets').flush([]);
    page.form.name = 'Insurance (CAR)';
    page.form.awardBlocking = true;
    page.form.appliesToAllTrades = false;
    page.toggleTrade('t1', true);
    page.save();
    const create = http.expectOne(
      (request) => request.method === 'POST' && request.url === '/api/v1/compliance-types',
    );
    expect(create.request.body).toMatchObject({
      name: 'Insurance (CAR)',
      awardBlocking: true,
      appliesToAllTrades: false,
      tradeIds: ['t1'],
    });
  });

  it('puts award-blocking gaps first and names the refusal at award', () => {
    configure([]);
    const fixture = TestBed.createComponent(ComplianceChips);
    fixture.componentRef.setInput('items', [
      {
        typeId: 'a',
        typeName: 'Insurance',
        state: 'ExpiringSoon',
        expiresOn: '2026-10-20',
        awardBlocking: false,
      },
      {
        typeId: 'b',
        typeName: 'Licence',
        state: 'Expired',
        expiresOn: '2026-09-01',
        awardBlocking: true,
      },
      { typeId: 'c', typeName: 'VAT', state: 'Valid', expiresOn: null, awardBlocking: false },
    ]);
    fixture.detectChanges();
    const chips = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.prj-chip')].map(
      (chip) => text(chip as HTMLElement).trim(),
    );
    expect(chips).toEqual(['Licence: Expired (blocks award)', 'Insurance: Expiring soon']);
    expect(
      knownProductProblem({
        code: 'award.compliance_blocked',
        parameters: { subcontractorCode: 'ACME-01', documents: 'Licence' },
      }),
    ).toContain('lacks a valid Licence');
  });
});
