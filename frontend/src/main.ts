import { bootstrapApplication } from '@angular/platform-browser';

import { App } from './app/app';
import { appConfig } from './app/app.config';
import { appLogger } from './app/core/utils/app-logger';

const log = appLogger.child('bootstrap');

bootstrapApplication(App, appConfig).catch((error: unknown) => {
  log.error('the application failed to start', error);
});
