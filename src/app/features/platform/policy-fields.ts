import { Component, input, output, effect, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AccessPolicy, AccessPolicyCapabilities, lines } from './platform-api.service';

@Component({
  selector: 'app-policy-fields',
  imports: [FormsModule],
  styleUrl: './platform.scss',
  template: `
    @if (lockedOut(); as kind) {
      <p class="error" role="alert" data-testid="policy-locked-out">
        @if (kind === 'location') {
          <ng-container i18n="@@policy.lockedOutLocation"
            >The saved country rules cannot be enforced in this deployment, so every user of this
            company is denied at sign-in and on every request. Remove them and save to restore
            access.</ng-container
          >
        } @else {
          <ng-container i18n="@@policy.lockedOutIp"
            >The saved IP rules cannot be enforced in this deployment, so every user of this company
            is denied at sign-in and on every request. Remove them and save to restore
            access.</ng-container
          >
        }
      </p>
    }
    <div class="fields">
      <label
        ><span i18n="@@policy.domains">Allowed email domains or addresses (required)</span
        ><textarea
          dir="ltr"
          class="ltr-token"
          name="domains"
          [ngModelOptions]="{ standalone: true }"
          [(ngModel)]="domains"
          (ngModelChange)="changed()"
          placeholder="company.com"
        ></textarea>
      </label>
      <small i18n="@@policy.domainsHelp"
        >One domain (example.com) or one address (consultant@pmc.example) per line — an address
        admits that person only. The first admin must be allowed.</small
      >
      <label
        ><span i18n="@@policy.ips">IP addresses or CIDR ranges (optional)</span
        ><textarea
          dir="ltr"
          class="ltr-token"
          name="ips"
          aria-describedby="policy-ips-help policy-ips-status"
          [attr.aria-invalid]="ipsBlocked() ? 'true' : null"
          [ngModelOptions]="{ standalone: true }"
          [(ngModel)]="ips"
          (ngModelChange)="changed()"
          placeholder="203.0.113.0/24"
        ></textarea>
      </label>
      <small id="policy-ips-help" i18n="@@policy.ipsHelp"
        >One IPv4/IPv6 address or CIDR per line. Empty means no IP restriction. Configured IP rules
        deny access when the original client address cannot be established.</small
      >
      @if (capabilities(); as can) {
        @if (!can.clientAddress) {
          <small
            id="policy-ips-status"
            [class.error]="ipsBlocked()"
            data-testid="policy-ips-unavailable"
            i18n="@@policy.ipsUnavailable"
            >Not available in this deployment: the API runs behind the web proxy and cannot see the
            client’s original address, so an IP rule would deny every user. IP rules cannot be saved
            here.</small
          >
        }
      }
      <label
        ><span i18n="@@policy.countries"
          >Allowed countries, by the request’s IP location (optional)</span
        ><textarea
          dir="ltr"
          class="ltr-token"
          name="locations"
          aria-describedby="policy-locations-help policy-locations-status"
          [attr.aria-invalid]="locationsBlocked() ? 'true' : null"
          [ngModelOptions]="{ standalone: true }"
          [(ngModel)]="locations"
          (ngModelChange)="changed()"
          placeholder="EG&#10;AE/DU"
        ></textarea>
      </label>
      <small id="policy-locations-help" i18n="@@policy.countriesHelp"
        >One ISO 3166-1 two-letter country code per line (EG for Egypt, AE for the United Arab
        Emirates), optionally followed by /region. Each sign-in and request is checked against the
        country where the user’s internet (IP) address is located — not the company’s country, the
        user’s profile or the browser language. A request whose location cannot be determined is
        denied. Empty means no country restriction.</small
      >
      @if (capabilities(); as can) {
        @if (can.location) {
          <small id="policy-locations-status" class="muted" i18n="@@policy.countriesAvailable"
            >This deployment can determine each request’s country.</small
          >
        } @else {
          <small
            id="policy-locations-status"
            [class.error]="locationsBlocked()"
            data-testid="policy-locations-unavailable"
            i18n="@@policy.countriesUnavailable"
            >Not available in this deployment: it cannot determine where a request comes from (no
            IP-location service is configured, or the API cannot see the client’s address behind the
            web proxy), so a country rule would deny every user. Country rules cannot be saved
            here.</small
          >
        }
      }
    </div>
  `,
  styles: `
    .fields {
      display: grid;
      gap: 0.8rem;
    }
  `,
})
export class PolicyFields {
  readonly initial = input<AccessPolicy>({ emailDomains: [], ipRules: [], locationRules: [] });
  /** ADR-176: null while unknown — the server still refuses a rule it cannot enforce. */
  readonly capabilities = input<AccessPolicyCapabilities | null>(null);
  readonly policyChange = output<AccessPolicy>();
  /** ADR-176: false while the fields hold a rule this deployment cannot enforce, so the form cannot be saved. */
  readonly enforceableChange = output<boolean>();
  domains = '';
  ips = '';
  locations = '';
  constructor() {
    effect(() => {
      const value = this.initial();
      this.domains = value.emailDomains.join('\n');
      this.ips = value.ipRules.join('\n');
      this.locations = value.locationRules
        .map((rule) => (rule.region ? `${rule.country}/${rule.region}` : rule.country))
        .join('\n');
      untracked(() => this.report());
    });
    effect(() => {
      this.capabilities();
      untracked(() => this.report());
    });
  }
  changed(): void {
    this.policyChange.emit({
      emailDomains: lines(this.domains),
      ipRules: lines(this.ips),
      locationRules: lines(this.locations).map((line) => {
        const separator = line.indexOf('/');
        return separator < 0
          ? { country: line }
          : { country: line.slice(0, separator), region: line.slice(separator + 1) };
      }),
    });
    this.report();
  }
  ipsBlocked(): boolean {
    return this.capabilities()?.clientAddress === false && lines(this.ips).length > 0;
  }
  locationsBlocked(): boolean {
    return this.capabilities()?.location === false && lines(this.locations).length > 0;
  }
  /** The saved policy already holds a rule this deployment cannot enforce: the whole company is shut out until it is removed. */
  lockedOut(): 'ip' | 'location' | null {
    const can = this.capabilities();
    const saved = this.initial();
    if (!can) return null;
    if (!can.location && saved.locationRules.length) return 'location';
    if (!can.clientAddress && saved.ipRules.length) return 'ip';
    return null;
  }
  private report(): void {
    this.enforceableChange.emit(!this.ipsBlocked() && !this.locationsBlocked());
  }
}
