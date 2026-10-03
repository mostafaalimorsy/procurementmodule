import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { CompanyStore } from './company-store';
import { AccessPolicy, AccessPolicyCapabilities, PlatformApi } from './platform-api.service';
import { PolicyFields } from './policy-fields';

interface PolicyImpact {
  readonly removedDomains: readonly string[];
  readonly firstAdminBlocked: boolean;
  readonly addsNetworkRules: boolean;
  readonly addsLocationRules: boolean;
}

/** Operator-owned access restrictions for one company. Every configured rule must pass. */
@Component({
  selector: 'app-platform-company-access',
  imports: [FormsModule, PolicyFields, ConfirmDialog],
  styleUrl: './platform.scss',
  template: `
    @if (store.company(); as item) {
      <section class="panel" aria-labelledby="policy-title">
        <h2 id="policy-title" i18n="@@company.accessPolicy">Access policy</h2>
        <p class="muted" i18n="@@company.policyHelp">
          Platform Operators control these rules. Every configured restriction must pass.
        </p>
        <p class="muted" i18n="@@company.policyOperators">
          Company rules never apply to Platform Operators, so an operator can always change or
          remove them here. Every change is recorded in the platform audit log with the rules before
          and after.
        </p>
        <form (ngSubmit)="review()">
          <app-policy-fields
            [initial]="item.accessPolicy"
            [capabilities]="capabilities()"
            (policyChange)="draft.set($event)"
            (enforceableChange)="enforceable.set($event)"
          />
          <button
            [disabled]="
              store.busy() || !enforceable() || !(draft() ?? item.accessPolicy).emailDomains.length
            "
          >
            <ng-container i18n="@@company.savePolicy">Save access policy</ng-container>
          </button>
        </form>
      </section>

      @if (confirming(); as impact) {
        <app-confirm-dialog
          [heading]="confirmTitle"
          [confirmLabel]="confirmLabel"
          [danger]="true"
          [busy]="store.busy()"
          (confirmed)="save()"
          (cancelled)="confirming.set(null)"
        >
          <p i18n="@@policy.impactIntro">
            This change can block people who can sign in today. It takes effect at each user’s next
            request; no account or data is deleted.
          </p>
          <ul>
            @if (impact.removedDomains.length) {
              <li>
                <ng-container i18n="@@policy.impactDomains"
                  >Users whose email uses a removed domain lose access:</ng-container
                >
                @for (domain of impact.removedDomains; track domain) {
                  <bdi dir="ltr" class="token">{{ domain }}</bdi>
                }
              </li>
            }
            @if (impact.firstAdminBlocked) {
              <li class="error" i18n="@@policy.impactFirstAdmin">
                The first Company Admin’s own domain is no longer allowed, so that administrator is
                blocked too.
              </li>
            }
            @if (impact.addsNetworkRules) {
              <li i18n="@@policy.impactNetwork">
                The IP rules become narrower: anyone connecting from outside them, or whose original
                address cannot be established, is denied.
              </li>
            }
            @if (impact.addsLocationRules) {
              <li i18n="@@policy.impactLocation">
                The location rules become narrower: anyone outside them, or whose location cannot be
                resolved, is denied.
              </li>
            }
          </ul>
        </app-confirm-dialog>
      }
    }
  `,
})
export class CompanyAccess {
  protected readonly store = inject(CompanyStore);
  private readonly api = inject(PlatformApi);
  protected readonly draft = signal<AccessPolicy | null>(null);
  /** ADR-176: what this deployment can enforce; null while unknown (the server decides). */
  protected readonly capabilities = signal<AccessPolicyCapabilities | null>(null);
  protected readonly enforceable = signal(true);
  protected readonly confirming = signal<PolicyImpact | null>(null);
  protected readonly confirmTitle = $localize`:@@policy.confirmTitle:Restrict access for this company?`;
  protected readonly confirmLabel = $localize`:@@company.savePolicy:Save access policy`;

  constructor() {
    this.api.accessCapabilities().subscribe({
      next: (value) => this.capabilities.set(value),
      error: () => this.capabilities.set(null),
    });
  }

  /** What would stop working, derived from the saved policy and the draft. Presentation only. */
  protected readonly impact = computed<PolicyImpact | null>(() => {
    const company = this.store.company();
    const next = this.draft();
    if (!company || !next) return null;
    const current = company.accessPolicy;
    const allowed = new Set(next.emailDomains.map((domain) => domain.toLowerCase()));
    const removedDomains = current.emailDomains.filter(
      (domain) => !allowed.has(domain.toLowerCase()),
    );
    const adminDomain = company.firstAdminEmail.split('@').pop()?.toLowerCase() ?? '';
    const nextIps = new Set(next.ipRules);
    const nextLocations = new Set(next.locationRules.map(locationKey));
    // Conservative on purpose: introducing rules where none existed, or dropping any rule from a
    // list that stays configured, may block someone. Only clearing a list entirely never does.
    const restricts = <T>(before: readonly T[], after: readonly T[], kept: (item: T) => boolean) =>
      after.length > 0 && (before.length === 0 || before.some((item) => !kept(item)));
    return {
      removedDomains,
      // CF-115 (ADR-164): the first admin is allowed by their domain or by their own address.
      firstAdminBlocked:
        !!adminDomain &&
        !allowed.has(adminDomain) &&
        !allowed.has(company.firstAdminEmail.toLowerCase()),
      addsNetworkRules: restricts(current.ipRules, next.ipRules, (ip) => nextIps.has(ip)),
      addsLocationRules: restricts(current.locationRules, next.locationRules, (rule) =>
        nextLocations.has(locationKey(rule)),
      ),
    };
  });

  /** Saves at once when nothing can be blocked; otherwise states the consequence first. */
  review(): void {
    const impact = this.impact();
    if (
      impact &&
      (impact.removedDomains.length ||
        impact.firstAdminBlocked ||
        impact.addsNetworkRules ||
        impact.addsLocationRules)
    ) {
      this.confirming.set(impact);
      return;
    }
    this.save();
  }

  save(): void {
    const company = this.store.company();
    const policy = this.draft() ?? company?.accessPolicy;
    if (!company || !policy) return;
    this.store.apply(
      this.api.policy(company.id, policy, company.version),
      $localize`:@@company.policyUpdated:Access policy updated. All configured restrictions apply together.`,
      () => this.draft.set(null),
      () => this.confirming.set(null),
    );
  }
}

function locationKey(rule: { country: string; region?: string | null }): string {
  return `${rule.country.toUpperCase()}/${(rule.region ?? '').toUpperCase()}`;
}
