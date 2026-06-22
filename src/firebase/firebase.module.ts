import { Module } from '@nestjs/common';

import { FirebaseAdminService } from './services/firebase-admin.service';

@Module({
  providers: [FirebaseAdminService],
  exports: [FirebaseAdminService],
})
export class FirebaseModule {}
