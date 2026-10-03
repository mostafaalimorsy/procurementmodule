import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';
import { SessionService } from './session.service';

/** Template usage: *appHasPermission="'Projects.View'". Never replaces API authorization. */
@Directive({ selector: '[appHasPermission]' })
export class HasPermissionDirective {
  readonly appHasPermission = input.required<string>();
  private readonly session = inject(SessionService);
  private readonly template = inject(TemplateRef<unknown>);
  private readonly container = inject(ViewContainerRef);
  private visible = false;

  constructor() {
    effect(() => {
      const allowed = this.session.hasPermission(this.appHasPermission());
      if (allowed && !this.visible) this.container.createEmbeddedView(this.template);
      if (!allowed && this.visible) this.container.clear();
      this.visible = allowed;
    });
  }
}
