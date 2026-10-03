import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CompanyStore } from './company-store';

/**
 * Company detail frame: identity, status and routed sections. Each section is its own address, so
 * a section can be linked, bookmarked and reloaded; they share one store for this company only.
 */
@Component({
  selector: 'app-platform-company-detail',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  providers: [CompanyStore],
  templateUrl: './company-detail.html',
  styleUrl: './platform.scss',
})
export class CompanyDetail implements OnInit {
  protected readonly store = inject(CompanyStore);
  private readonly route = inject(ActivatedRoute);

  ngOnInit(): void {
    this.store.load(this.route.snapshot.paramMap.get('id')!);
  }
}
