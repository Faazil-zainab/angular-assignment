import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AppLink } from '../../../core/constants/app-routes';
import { MATERIAL_MODULES } from '../../ui';

/** Fallback page for any URL that does not match a feature route. */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink, MATERIAL_MODULES],
  templateUrl: './not-found.html',
  styleUrl: './not-found.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFound {
  protected readonly links = AppLink;
}
