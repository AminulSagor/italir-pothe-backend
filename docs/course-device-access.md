# Course device access rollout

The production implementation authorizes one attested device per user and
course on first access. A verified second device can create one pending request.
Admin decisions are serializable database transactions:

- `replace` revokes every current active authorization for the user/course and
  activates the requested device.
- `add` preserves active authorizations and activates the requested device.
- `reject` records the decision without activating the candidate.

Course access proofs are random 256-bit opaque values. Only their SHA-256 hashes
are stored, they expire after 12 hours, and a replacement immediately invalidates
the revoked device because the guard also requires an active authorization.

## Manual Google Play / Google Cloud work

1. In the existing Italir Pothe Google Cloud project, enable the Play Integrity
   API. Do not create a new project.
2. In Play Console > Italir Pothe > Test and release > App integrity > Play
   Integrity API, link that same project. Configure test accounts/verdicts as
   needed and request more than the default daily quota before traffic requires
   it.
3. Create/use the backend runtime service account in that linked project and
   expose it through Application Default Credentials. The backend requests the
   least-privilege `https://www.googleapis.com/auth/playintegrity` OAuth scope.
   Do not put a service-account JSON key in Flutter.
4. Put the existing project's numeric project number in Flutter `.env` as
   `PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER`.
5. Set backend `PLAY_INTEGRITY_PACKAGE_NAME=com.shafacode.italir_pothe` and keep
   `PLAY_INTEGRITY_REQUIRE_LICENSED=true` for production.

## Manual Apple work

1. In Apple Developer Certificates, Identifiers & Profiles, open the existing
   App ID for bundle ID `com.shafacode.italirpothe` and enable App Attest.
2. Regenerate/download development and distribution provisioning profiles so
   the App Attest entitlement is signed. Do not create a new App ID.
3. Set backend `APPLE_APP_ID_PREFIX` to the App ID prefix (normally the Team ID),
   `APPLE_BUNDLE_ID=com.shafacode.italirpothe`, and
   `APPLE_APP_ATTEST_ENVIRONMENT=production`. Use `development` only with a
   development-signed build.
4. The repository pins Apple's official App Attestation root CA at
   `assets/security/Apple_App_Attestation_Root_CA.pem`. Review Apple's PKI page
   during future certificate rotations; use `APPLE_APP_ATTEST_ROOT_CA_PATH` only
   for a controlled replacement.

## Safe live-app rollout

1. Deploy the migration, backend, and admin page first with
   `COURSE_DEVICE_ENFORCEMENT_ENABLED=false`. This explicit compatibility state
   logs a backend warning and keeps the currently published app working.
2. Complete both console configurations and deploy backend credentials/config.
3. Publish the new mobile build and confirm production attestation telemetry.
4. Use the existing App Update Management minimum-version control to move users
   to the attested build.
5. Set `COURSE_DEVICE_ENFORCEMENT_ENABLED=true`. At that point course, syllabus,
   lesson, vocabulary, quiz, progress, and final-exam APIs fail closed without a
   current device proof.

Do not enable enforcement before the console links and mobile release are live.
Do not set licensing checks false in production and do not add a debug bypass.
