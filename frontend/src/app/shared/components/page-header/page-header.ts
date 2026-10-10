import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { MATERIAL_MODULES } from '../../ui';

/**
 * Consistent page heading used by every feature page.
 *
 * Content projection (`ng-content`) lets a page inject its own action buttons
 * without the header knowing anything about them.
 */
@Component({
  selector: 'app-page-header',
  imports: [MATERIAL_MODULES],
  templateUrl: './page-header.html',
  styleUrl: './page-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeader {
  readonly eyebrow = input<string>('');
  readonly heading = input.required<string>();
  readonly subtitle = input<string>('');
  readonly icon = input<string>('insights');
}
