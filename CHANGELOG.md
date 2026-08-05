# Changelog

## [1.5.0](https://github.com/nikunjmavani/core-fe/compare/v1.4.0...v1.5.0) (2026-08-05)


### Added

* **i18n:** locale prefs, RTL, and 11-locale UI translations ([#217](https://github.com/nikunjmavani/core-fe/issues/217)) ([4a056e3](https://github.com/nikunjmavani/core-fe/commit/4a056e33f9d7649d7b428e8513e103c93f7190cc))

## [1.4.0](https://github.com/nikunjmavani/core-fe/compare/v1.3.0...v1.4.0) (2026-08-01)


### Added

* **github-sync:** diff/skip-default/prune deploy variables + env-var catalog ([#197](https://github.com/nikunjmavani/core-fe/issues/197)) ([b7884c6](https://github.com/nikunjmavani/core-fe/commit/b7884c6b0dc218f473b4b8376c5dd2f6924fce88))
* make settings destinations searchable in ⌘K (F2) ([#191](https://github.com/nikunjmavani/core-fe/issues/191)) ([b5ab5a6](https://github.com/nikunjmavani/core-fe/commit/b5ab5a6b17146563cc72a311c31c1294ff08ad77))
* **settings:** working member invitations + custom role creation ([#180](https://github.com/nikunjmavani/core-fe/issues/180)) ([8184ff7](https://github.com/nikunjmavani/core-fe/commit/8184ff79d4dee1e4dc84d5952263ff496de95fe3))
* **setup:** port setup:mac-tools — hands-off macOS external-tool install ([#174](https://github.com/nikunjmavani/core-fe/issues/174)) ([fece209](https://github.com/nikunjmavani/core-fe/commit/fece209fead4768c8c004aad0633bd95ff2f5a3a))
* SW-handoff update reloads, dev OTP autofill, "Core" rebrand ([#176](https://github.com/nikunjmavani/core-fe/issues/176)) ([1655b29](https://github.com/nikunjmavani/core-fe/commit/1655b29c7cb395e93f3961b032936b3f9e0fbfed))


### Fixed

* **agent-os:** restore shadcn project rules, sweep dev-branch wording, correct skill/command claims ([#170](https://github.com/nikunjmavani/core-fe/issues/170)) ([c06fc16](https://github.com/nikunjmavani/core-fe/commit/c06fc16ed84f23e193cdaf62bcaaa1518bafe37f))
* **auth:** never dead-end an authenticated user on /unauthorized after login ([#181](https://github.com/nikunjmavani/core-fe/issues/181)) ([0cc16fd](https://github.com/nikunjmavani/core-fe/commit/0cc16fd4b7f74f766e590deee55d32a085dee829))
* **ci:** migrate deps:audit to npm's bulk advisory endpoint ([#167](https://github.com/nikunjmavani/core-fe/issues/167)) ([64bdf1d](https://github.com/nikunjmavani/core-fe/commit/64bdf1df61647843a10254f887fba975b2b149dc))
* **env:** close the deploy-workflow env seam (VITE_APP_ENV, list sync, Sentry pass-through) ([#166](https://github.com/nikunjmavani/core-fe/issues/166)) ([656809c](https://github.com/nikunjmavani/core-fe/commit/656809ccc8ae9f4f849f32662ac930577e480ee6))
* **hooks:** gate org-scoped list queries on an active organization ([#186](https://github.com/nikunjmavani/core-fe/issues/186)) ([59de1ca](https://github.com/nikunjmavani/core-fe/commit/59de1ca8ccd5ec9662f79a36eb03ef8be77055d1))
* hybrid-mode walkthrough — member/role mgmt, onboarding invites, org/notifications/billing fixes ([#182](https://github.com/nikunjmavani/core-fe/issues/182)) ([633ca8c](https://github.com/nikunjmavani/core-fe/commit/633ca8cca360218b507be6d9f673173a601f1a38))
* **i18n:** complete locale parity and guard against drift ([#175](https://github.com/nikunjmavani/core-fe/issues/175)) ([602c432](https://github.com/nikunjmavani/core-fe/commit/602c432578039b5aa391282ec658d7914cba1eab))
* **notifications:** channel PUSH → WEB_PUSH (core-be [#971](https://github.com/nikunjmavani/core-fe/issues/971) breaking rename) ([#184](https://github.com/nikunjmavani/core-fe/issues/184)) ([33aa883](https://github.com/nikunjmavani/core-fe/commit/33aa88395b15273edf65c25d642a2a9a1b08c4e3))
* **onboarding:** cross-user state leak, workspace landing, deep links, review rows ([#177](https://github.com/nikunjmavani/core-fe/issues/177)) ([0f1efd2](https://github.com/nikunjmavani/core-fe/commit/0f1efd2f4c6dd37ab3da5bb8bd84ac21ddd95187))
* org switching, logout revocation, and dashboard placeholder data (walkthrough [#2](https://github.com/nikunjmavani/core-fe/issues/2)) ([#179](https://github.com/nikunjmavani/core-fe/issues/179)) ([a98f5a6](https://github.com/nikunjmavani/core-fe/commit/a98f5a6613c0113ea15890dc879f76ce38886ab2))
* post-backend re-alignment — canonical notifications, step-up auth, join-org flow, UX polish ([#183](https://github.com/nikunjmavani/core-fe/issues/183)) ([7c50259](https://github.com/nikunjmavani/core-fe/commit/7c5025968e63dbb4fbb1c40c25e94c4d68558768))
* profile job title round-trip + personal-workspace billing 403 ([#189](https://github.com/nikunjmavani/core-fe/issues/189)) ([720c0c7](https://github.com/nikunjmavani/core-fe/commit/720c0c7a0e293bea450b0e45c5e184f098aebc54))
* **quality:** resolve Biome lint-lane panic + sweep config/doc drift ([#173](https://github.com/nikunjmavani/core-fe/issues/173)) ([e3e3bbb](https://github.com/nikunjmavani/core-fe/commit/e3e3bbb3a90c140082b1cb3ea5a13a7c27e6b8c3))
* reach Integrations settings + hide org-settings command on personal ([#190](https://github.com/nikunjmavani/core-fe/issues/190)) ([ab00fbc](https://github.com/nikunjmavani/core-fe/commit/ab00fbccb60428896f4c7355b11af8de3cc2b0d0))
* **routes:** suspended-leaf gateway, preload order, login.search.ts, DataTable folder-per-unit ([#169](https://github.com/nikunjmavani/core-fe/issues/169)) ([dee805d](https://github.com/nikunjmavani/core-fe/commit/dee805de52e2c80335713e913f4eae74746dc8bc))
* **settings:** Profile save + Delete account actually persist (were fake-success no-ops) ([#178](https://github.com/nikunjmavani/core-fe/issues/178)) ([15e6bac](https://github.com/nikunjmavani/core-fe/commit/15e6bac1e00c19fb6fda4c2b17c34622c827ceed))
* **tenancy:** drop write-only last-organization localStorage persistence ([#185](https://github.com/nikunjmavani/core-fe/issues/185)) ([fa7efe7](https://github.com/nikunjmavani/core-fe/commit/fa7efe77e75e9639d99ad50fc0d7925199024c73))
* validate profile form before opening the save-confirm dialog (F7) ([#192](https://github.com/nikunjmavani/core-fe/issues/192)) ([776a818](https://github.com/nikunjmavani/core-fe/commit/776a8185c2613d6d7cecd0d25c1f171f465e9eb8))


### Documentation

* **deps:** record the npm-major bump and correct the netlify-cli line claim ([#213](https://github.com/nikunjmavani/core-fe/issues/213)) ([6776c37](https://github.com/nikunjmavani/core-fe/commit/6776c3777e91d24594427b2cdbf44d0690227b1f))
* **env:** catalog RELEASE_PLEASE_TOKEN in the env reference ([#204](https://github.com/nikunjmavani/core-fe/issues/204)) ([d8f8371](https://github.com/nikunjmavani/core-fe/commit/d8f8371b581c1a34a233c1a8ccd8d6dfa3fde17a))
* fix data-mutations inventory drift; guard it with a test ([#198](https://github.com/nikunjmavani/core-fe/issues/198)) ([#202](https://github.com/nikunjmavani/core-fe/issues/202)) ([672df67](https://github.com/nikunjmavani/core-fe/commit/672df67a260f23f6f23a72ad3ea9441cdf10e597))
* sweep audit drift — README rewrite, broken links, testid inventory, OVERVIEW refreshes ([#171](https://github.com/nikunjmavani/core-fe/issues/171)) ([cec085b](https://github.com/nikunjmavani/core-fe/commit/cec085b0ee809befbb259720e6eba24f0a09b65a))
* **tenancy:** sync localStorage / last-used-org claims after [#185](https://github.com/nikunjmavani/core-fe/issues/185) ([#187](https://github.com/nikunjmavani/core-fe/issues/187)) ([4d5856c](https://github.com/nikunjmavani/core-fe/commit/4d5856c9e81739fcfeda62882b6183c5ad65e540))

## [1.3.0](https://github.com/nikunjmavani/core-fe/compare/v1.2.5...v1.3.0) (2026-07-14)


### Added

* **agent-os:** claude plugin, shared review agents, platform-mapping sync ([#122](https://github.com/nikunjmavani/core-fe/issues/122)) ([694286f](https://github.com/nikunjmavani/core-fe/commit/694286fc743e66b4996b82a913e8c6f27cb0a556))
* **agents:** add a11y-auditor and i18n-auditor read-only agents ([#115](https://github.com/nikunjmavani/core-fe/issues/115)) ([79059e6](https://github.com/nikunjmavani/core-fe/commit/79059e6bd0a3908aa5bad9a4d10ebba93d9aabb4))
* **agents:** add perf-auditor read-only agent to the prod-readiness pipeline ([#113](https://github.com/nikunjmavani/core-fe/issues/113)) ([c2d33a5](https://github.com/nikunjmavani/core-fe/commit/c2d33a57bd85298367b357d6c174ef8e45b0be66))
* **config:** allow `local` as a valid Vite MODE value ([#127](https://github.com/nikunjmavani/core-fe/issues/127)) ([ce5fe25](https://github.com/nikunjmavani/core-fe/commit/ce5fe2536f5ad3c79f038fb4fab7014a4916e0d2))
* **env:** add VITE_TEST_MODE (on/off) umbrella test-mode switch ([#157](https://github.com/nikunjmavani/core-fe/issues/157)) ([fc1af7e](https://github.com/nikunjmavani/core-fe/commit/fc1af7ea54edc6d5bc4a89922e28e05feb3b9e4d))
* **env:** default to `local` mode with .env.local + per-environment defaults ([#164](https://github.com/nikunjmavani/core-fe/issues/164)) ([7525e0b](https://github.com/nikunjmavani/core-fe/commit/7525e0b0dfdfc00ad16c185798f4469db1d9e24e))
* **mcp:** add chrome-devtools MCP server via Playwright-Chromium launcher ([#112](https://github.com/nikunjmavani/core-fe/issues/112)) ([155c220](https://github.com/nikunjmavani/core-fe/commit/155c220e4a2da348dbf9bb451bdc58c6bde0c07c))
* **onboarding:** route every deployment mode through onboarding (backend flag) ([#120](https://github.com/nikunjmavani/core-fe/issues/120)) ([b9b0350](https://github.com/nikunjmavani/core-fe/commit/b9b03507a1d8b7789f65b5f0a69073eb73ba40dd))
* **skills:** add visual-regression skill for the Playwright screenshot lane ([#114](https://github.com/nikunjmavani/core-fe/issues/114)) ([ba26633](https://github.com/nikunjmavani/core-fe/commit/ba26633e96e0e243293faa8dbf8697008c19f4d6))
* **skills:** vendor systematic-debugging from obra/superpowers ([#116](https://github.com/nikunjmavani/core-fe/issues/116)) ([68c5787](https://github.com/nikunjmavani/core-fe/commit/68c5787aef6ed929fe1f721a04d7edd9fc9c43f0))


### Fixed

* **auth:** eliminate flash of login screen between OTP verify and dashboard ([#119](https://github.com/nikunjmavani/core-fe/issues/119)) ([9d95393](https://github.com/nikunjmavani/core-fe/commit/9d95393dbed06ee8140532a45fb35e69f91200b7))
* **auth:** surface login errors inline — toasts alone were silently dropped ([#124](https://github.com/nikunjmavani/core-fe/issues/124)) ([3b7e98f](https://github.com/nikunjmavani/core-fe/commit/3b7e98f746eec0760ba0492e4cc28ead531c2c28))
* **ci:** grant reusable-deploy permissions in callers; refresh stale skills-lock ([#117](https://github.com/nikunjmavani/core-fe/issues/117)) ([67f3030](https://github.com/nikunjmavani/core-fe/commit/67f30308aede678be00afeca15aace2160af10d0))
* **ci:** resolve doc-staleness paths against git-tracked files ([#148](https://github.com/nikunjmavani/core-fe/issues/148)) ([514515c](https://github.com/nikunjmavani/core-fe/commit/514515c4c93f06dc70053b79927c151c1fdd8469))
* **env:** correct Sentry org/project keys and stale single-trunk branch map ([#163](https://github.com/nikunjmavani/core-fe/issues/163)) ([4ce80f8](https://github.com/nikunjmavani/core-fe/commit/4ce80f80d92114bdde90915e1cf3ec87cca43305))
* **platform:** parity sweep — guard enforcement, vendored-skill protection, CI/vscode/docs sync ([#123](https://github.com/nikunjmavani/core-fe/issues/123)) ([baa19ed](https://github.com/nikunjmavani/core-fe/commit/baa19ed29792a9bb7170ebab6f1121a9713b26c5))


### Performance

* **main:** drop three ineffective dynamic imports in the bootstrap ([#131](https://github.com/nikunjmavani/core-fe/issues/131)) ([020745b](https://github.com/nikunjmavani/core-fe/commit/020745ba9c124e83c980125d29505dc6f6fe446d))
* **settings:** split a dependency-free hash-grammar leaf out of the entry chunk ([#134](https://github.com/nikunjmavani/core-fe/issues/134)) ([c0d8597](https://github.com/nikunjmavani/core-fe/commit/c0d8597e4015ec34dfa0238d57965b3ddc14c9c2))


### Changed

* **env:** one behavior = one env variable — remove VITE_TEST_MODE umbrella ([#159](https://github.com/nikunjmavani/core-fe/issues/159)) ([6cf44a9](https://github.com/nikunjmavani/core-fe/commit/6cf44a901a1b77029489ea7c4a1e506ef69e54ef))


### Documentation

* add typedoc API-reference generation ([#108](https://github.com/nikunjmavani/core-fe/issues/108)) ([51d8546](https://github.com/nikunjmavani/core-fe/commit/51d8546715ae2e534c1a1316783d97298a323521))
* adopt optional 4-tier in-source doc convention + tenancy exemplar ([#110](https://github.com/nikunjmavani/core-fe/issues/110)) ([21b1df1](https://github.com/nikunjmavani/core-fe/commit/21b1df16feb34fe78bad9b3e39e99eb8ed311757))
* **agent-os:** add consolidated change-completeness rule ([#102](https://github.com/nikunjmavani/core-fe/issues/102)) ([a6a008e](https://github.com/nikunjmavani/core-fe/commit/a6a008efebf08192aa0310d5aed50d7040aac5c2))
* **agent-os:** codify inline-error-surface + branch-on-reason rules ([#125](https://github.com/nikunjmavani/core-fe/issues/125)) ([14337e0](https://github.com/nikunjmavani/core-fe/commit/14337e0da3a9dd81c5836f385067733df4299d23))
* **agent-os:** make production-strict env enforcement mandatory (parity with core-be) ([#126](https://github.com/nikunjmavani/core-fe/issues/126)) ([aff8b3b](https://github.com/nikunjmavani/core-fe/commit/aff8b3be2f9b954855bd195226296c476d488ab5))
* align docs and comments with implemented behavior (drift sweep) ([#111](https://github.com/nikunjmavani/core-fe/issues/111)) ([4fbd311](https://github.com/nikunjmavani/core-fe/commit/4fbd3117ecc62128308ada2ae35b3d605ff43d09))
* **ci:** add enforced scheduled-jobs registry ([#149](https://github.com/nikunjmavani/core-fe/issues/149)) ([951b959](https://github.com/nikunjmavani/core-fe/commit/951b95924ac174bc5523f54751102f9207a7cb89))
* **env:** per-var descriptions single-sourced schema↔.env.example + VITE_APP_VERSION ([#155](https://github.com/nikunjmavani/core-fe/issues/155)) ([fab74a7](https://github.com/nikunjmavani/core-fe/commit/fab74a7df1a26344c038156dd3a742ce17f959fb))
* **perf:** record lazy-sonner toaster as a deferred optimization (FE-W3) ([#139](https://github.com/nikunjmavani/core-fe/issues/139)) ([d44bfe2](https://github.com/nikunjmavani/core-fe/commit/d44bfe292a0fbfcd349399cd73df9ca785a5ac9c))
* **sync:** reconcile docs/skills/rules with code + enforce project-tree ([#144](https://github.com/nikunjmavani/core-fe/issues/144)) ([3b4df14](https://github.com/nikunjmavani/core-fe/commit/3b4df143eac220d96e31d096eb831f42310a57e9))

## [1.2.5](https://github.com/nikunjmavani/core-fe/compare/v1.2.4...v1.2.5) (2026-07-08)


### Documentation

* sync docs, skills, and rules with current code ([#96](https://github.com/nikunjmavani/core-fe/issues/96)) ([1313f56](https://github.com/nikunjmavani/core-fe/commit/1313f56919fdde245095eb5e359ad111aa14a0b0))

## [1.2.4](https://github.com/nikunjmavani/core-fe/compare/v1.2.3...v1.2.4) (2026-07-07)


### Documentation

* complete single-trunk cleanup — delete migration plan, rename workflow doc ([#93](https://github.com/nikunjmavani/core-fe/issues/93)) ([c2f2c3f](https://github.com/nikunjmavani/core-fe/commit/c2f2c3f477056f8b4addcc165b2a4d03a68d9281))

## [1.2.3](https://github.com/nikunjmavani/core-fe/compare/v1.2.2...v1.2.3) (2026-07-07)


### Changed

* **setup:** drop per-environment branch; source trunk from git.defaultBranch ([#91](https://github.com/nikunjmavani/core-fe/issues/91)) ([41da2f1](https://github.com/nikunjmavani/core-fe/commit/41da2f1e8e4791607a6f7e39da4ea57b2995799e))

## [1.2.2](https://github.com/nikunjmavani/core-fe/compare/v1.2.1...v1.2.2) (2026-07-07)


### Documentation

* document repository vs environment secret placement ([#87](https://github.com/nikunjmavani/core-fe/issues/87)) ([75dbe43](https://github.com/nikunjmavani/core-fe/commit/75dbe43d24c5138279044f05bd9a4b8f39c94993))

## [1.2.1](https://github.com/nikunjmavani/core-fe/compare/v1.2.0...v1.2.1) (2026-07-07)


### Documentation

* branch-protection table matches the strict-up-to-date ruleset ([#85](https://github.com/nikunjmavani/core-fe/issues/85)) ([7e556d6](https://github.com/nikunjmavani/core-fe/commit/7e556d6cf29547465429c68cd5e7b8449aab597c))

## [1.2.0](https://github.com/nikunjmavani/core-fe/compare/v1.1.2...v1.2.0) (2026-07-07)


### Added

* **ci:** single-trunk CI/CD hardening — github:sync, tag-pinned release deploy, instant rollback ([#83](https://github.com/nikunjmavani/core-fe/issues/83)) ([fa6ab76](https://github.com/nikunjmavani/core-fe/commit/fa6ab7668cb1cf21b607d76572edaf771cd06086))

## [1.1.2](https://github.com/nikunjmavani/core-fe/compare/v1.1.1...v1.1.2) (2026-07-07)


### Documentation

* sweep all docs + agent-os commands to the single-trunk model ([#78](https://github.com/nikunjmavani/core-fe/issues/78)) ([53e3268](https://github.com/nikunjmavani/core-fe/commit/53e3268f4d4d12e55330b2a3716e14ca88c916de))

## [1.1.1](https://github.com/nikunjmavani/core-fe/compare/v1.1.0...v1.1.1) (2026-07-07)


### Fixed

* **knip:** allow the rg (ripgrep) binary ([a685f85](https://github.com/nikunjmavani/core-fe/commit/a685f85e9e195b164e2a2973d485e889c6b1aff2))
* **knip:** allow the rg (ripgrep) binary ([932c38f](https://github.com/nikunjmavani/core-fe/commit/932c38ff67cb1eed1f705b8ff116b450bd89afa0))

## [1.1.0](https://github.com/nikunjmavani/core-fe/compare/v1.0.0...v1.1.0) (2026-07-07)


### Added

* **account:** active sessions list + revoke (FE-31) ([48fca0b](https://github.com/nikunjmavani/core-fe/commit/48fca0b963ea592ec46646dd33b8ccab4beb5bf7))
* **account:** add mfa enrollment API + mock store (FE-32 data layer) ([b03d968](https://github.com/nikunjmavani/core-fe/commit/b03d968c156f21bc3c6f44c2c0b12f66bcd56134))
* **account:** wire mfa setup/disable flow in Security panel (FE-32 UI) ([24606cc](https://github.com/nikunjmavani/core-fe/commit/24606cc80e70fcfbff44c32816a43a9d0fd8a7ef))
* **api:** live billing + api-keys parity with wire mappers (FE-27, FE-28) ([85c98c6](https://github.com/nikunjmavani/core-fe/commit/85c98c646b4b8c89b6efc578198ee73c9c81b903))
* **api:** live memberships parity + wire/domain mapper (FE-25) ([2d9e5bc](https://github.com/nikunjmavani/core-fe/commit/2d9e5bc8deb296b0c2fc26f0163a9cc4cac07734))
* **api:** live roles parity + wire/domain mapper (FE-26) ([628fbad](https://github.com/nikunjmavani/core-fe/commit/628fbad895454a11c576f236da35a9493cafbba7))
* **appearance:** colour picker — pick any hue + preset swatch suggestions ([8d3cd51](https://github.com/nikunjmavani/core-fe/commit/8d3cd51798a10c3319615193e70e39359ec2e830))
* **appearance:** expose every theme axis (+ shareable theme code) as pickers ([25f2de6](https://github.com/nikunjmavani/core-fe/commit/25f2de6af0a21b3075ab886dfb09755e4a631412))
* **appearance:** non-modal side popup, visible on every layout, above all layers ([4689e38](https://github.com/nikunjmavani/core-fe/commit/4689e3823efff84e641318053043cc9aa3967a76))
* **appearance:** per-section shuffle + global shuffle in the header ([40df41e](https://github.com/nikunjmavani/core-fe/commit/40df41ecb7a275791e2bcef30a5c9c8739f83495))
* **appearance:** widen the popup + click-outside / Esc to dismiss ([25ac670](https://github.com/nikunjmavani/core-fe/commit/25ac670c4a03eb1c4593e8022b6a9fb631b60422))
* **app:** temporary AppLayout shell preview (shuffle-cycled) ([7de4445](https://github.com/nikunjmavani/core-fe/commit/7de44454305848a2c4ee407a1d394bd70aaeb440))
* **auth:** carry returnTo through the MFA flow + share redirect-safety (FE-59) ([5059ffc](https://github.com/nikunjmavani/core-fe/commit/5059ffcfec9148792815a31c4b0c18d1252e7100))
* **auth:** carry returnTo through the OAuth round-trip (FE-59) ([d0bd389](https://github.com/nikunjmavani/core-fe/commit/d0bd389baa4ae3d81c4db80800182b9a89442ac1))
* **auth:** dynamic OAuth provider buttons + magic-link send in login UI ([5066e0b](https://github.com/nikunjmavani/core-fe/commit/5066e0b9285fa6878eb3869d357b3dce7fc4cc55))
* **auth:** email-verification banner with one-tap resend ([b2cf639](https://github.com/nikunjmavani/core-fe/commit/b2cf639a42b02611a512a7529ed9ecd9fd9f5447))
* **auth:** exchange the refresh cookie on oauth return (FE-03) ([f27e0ab](https://github.com/nikunjmavani/core-fe/commit/f27e0ab91d6054b1e154881cd2c3f0343ab1db80))
* **auth:** fetch the oauth authorize url, then redirect (FE-02) ([286f7fc](https://github.com/nikunjmavani/core-fe/commit/286f7fca7f643efa910ac1f940fff2b5a81779ef))
* **auth:** honor returnTo in the register flow (FE-59 complete) ([cfd5faf](https://github.com/nikunjmavani/core-fe/commit/cfd5faf12f0b29985a9bf5708ed14c6b67f2db1e))
* **auth:** magic-link code-entry — send 6-digit code, verify (FE-01) ([61510da](https://github.com/nikunjmavani/core-fe/commit/61510dae17fe73ba7303e0529b42722fc1aae968))
* **auth:** magic-link verify via /callback (?token exchange) ([327a87c](https://github.com/nikunjmavani/core-fe/commit/327a87c8de491d889cdc09838a6919d864864f78))
* **auth:** magic-link, OAuth providers, resend-verification + fix MFA login ([06e8349](https://github.com/nikunjmavani/core-fe/commit/06e834934da6647198dc5dd6d3dedf0de7fa9b08))
* **auth:** me/context as the canonical post-auth read (FE-05) ([1e01e6e](https://github.com/nikunjmavani/core-fe/commit/1e01e6ecb2dc87da201394ddae5c295fa94a2d5e))
* **auth:** mfa second factor via totp_code/recovery_code (FE-04) ([80b7888](https://github.com/nikunjmavani/core-fe/commit/80b7888fb054757f58f276c91748f0e92dc215c6))
* **auth:** temporary AuthLayout design preview (shuffle-cycled) ([19e7876](https://github.com/nikunjmavani/core-fe/commit/19e78766eb2e13affcd88ddc2861579ac225c9d8))
* **auth:** wire login/signup to live core-be (envelope-tolerant) + real-stack UI e2e ([91c65bf](https://github.com/nikunjmavani/core-fe/commit/91c65bf26e6b1b08835c5dc93ec1160f1bde05ea))
* be-parity governance wave — codeql, markdownlint, pr governance, security tests, ratchet gates ([29235e9](https://github.com/nikunjmavani/core-fe/commit/29235e936627106d231e462ac113fd9b611bd304))
* biome lint lane, local sonarqube gate, and ci quality lanes ([3bc957d](https://github.com/nikunjmavani/core-fe/commit/3bc957de28fe052192392910392a58476c194c7f))
* cookie-consent gating for analytics + production-readiness assessment ([5ca78e4](https://github.com/nikunjmavani/core-fe/commit/5ca78e4c54affe15b846d8e5f1a60c6324f1131d))
* cross-tab logout, header-delivered CSP, and telemetry containment ([77ddacb](https://github.com/nikunjmavani/core-fe/commit/77ddacb4b64c10b54f1d154e518b426e35e0d40d))
* **dashboard:** add a theme bar that reflects the active theme live ([8834ea0](https://github.com/nikunjmavani/core-fe/commit/8834ea00aadd5cb78f5dc28e89d8a4965f669206))
* **dashboard:** real me/context-driven overview, responsive, by org type ([4081150](https://github.com/nikunjmavani/core-fe/commit/4081150555168cddec270caa580ebb65da5fe05c))
* **dashboard:** subtle stat-card hover affordance (FE-40 polish) ([9c6d46e](https://github.com/nikunjmavani/core-fe/commit/9c6d46eadbe4f565abdf31af5cc14381b87aad2e))
* **errors:** mapApiError + apiErrorReason from the core-be envelope (FE-44) ([29c00f1](https://github.com/nikunjmavani/core-fe/commit/29c00f1e5895d3d9c0e878dde607296228d08032))
* **errors:** opt-in global query/mutation error toasts (FE-46) ([7241b46](https://github.com/nikunjmavani/core-fe/commit/7241b464a3c6b172c326f303feea65d74fc34016))
* halve first-paint js, mechanize the token contract, reactive-auth hardening ([be0de1e](https://github.com/nikunjmavani/core-fe/commit/be0de1e2e9b45740e60cbf64a1045c7025871a27))
* **hooks:** opt-in optimistic updates for invitation/role/api-key mutations ([83dfa42](https://github.com/nikunjmavani/core-fe/commit/83dfa424e8ddb5594b203e790b0f84947cee5c2f))
* **hooks:** optimistic removals for member/session/passkey/webhook ([1941734](https://github.com/nikunjmavani/core-fe/commit/1941734fb06be869d277c3ffe75394e252633125))
* **hooks:** optimistic status flip for useUpdateMemberStatus ([8877791](https://github.com/nikunjmavani/core-fe/commit/88777910a8d1a4046435fdf91f676332b7063e42))
* **http:** unwrap core-be {data,meta} envelope + Paginated&lt;T&gt; + X-Idempotency-Key ([f7820d1](https://github.com/nikunjmavani/core-fe/commit/f7820d1e1975c6859beaad2025dcaef419c5399a))
* **integrations:** add outbound webhooks — list/create/delete (FE-29) ([5b343b4](https://github.com/nikunjmavani/core-fe/commit/5b343b4ba069d38b0c7abedb75e64879c213fddd))
* intent preloading, route error boundaries, contract-drift gate, deploy smoke ([f3bbf83](https://github.com/nikunjmavani/core-fe/commit/f3bbf834c53422f1b0e9a6d4cdd3312069f0446e))
* knip dead-code gate, header-delivered frame-ancestors, and gate consistency ([2c446fe](https://github.com/nikunjmavani/core-fe/commit/2c446fe8a343d6e66b1fed5a983bc1f049fef3ac))
* **layouts:** add PublicLayout for non-app public routes (FE-17) ([300881f](https://github.com/nikunjmavani/core-fe/commit/300881f3cc23b3a16c412b6b904b0f2c2fced4c8))
* **notifications:** desktop (OS) notification wrapper (FE-64) ([27b43fd](https://github.com/nikunjmavani/core-fe/commit/27b43fdc228a3adf5be5cca80b0204e4cdb3ad5c))
* **notifications:** inbox + unread-count hooks with poll (FE-63) ([e18be70](https://github.com/nikunjmavani/core-fe/commit/e18be70de01405e7dba26f3f93d74e64e677d75a))
* **notifications:** inbox API + contracts + mock store (FE-61) ([2fbb95a](https://github.com/nikunjmavani/core-fe/commit/2fbb95ae44cbd59b7145659b4a1307f819036a3e))
* **notifications:** notification center bell + drawer panel (FE-62) ([f387651](https://github.com/nikunjmavani/core-fe/commit/f3876518734d1cc5a7b8032ab4561ed37c9245e5))
* **notifications:** preferences API (category x channel, full-replace) (FE-30) ([b33e738](https://github.com/nikunjmavani/core-fe/commit/b33e738adc40ea425f726270ead7cc69dd2264c3))
* **notifications:** preferences tab — channel matrix + desktop opt-in (FE-65) ([992f67e](https://github.com/nikunjmavani/core-fe/commit/992f67ea913a5eb5c0bf3e55a3281d457b72acc0))
* **notify:** custom toast module with TEMP design variants ([0e37c82](https://github.com/nikunjmavani/core-fe/commit/0e37c824dbadc2ab8a782da2e3fcc65a672a5127))
* **notify:** selectable/shuffled toast position + don't let toasts close the modal ([5f335e5](https://github.com/nikunjmavani/core-fe/commit/5f335e53ae71fd98a2205d438f2dc151d64b90c5))
* onboarding — idempotent org creation, qualifying questions, easier setup ([f64ee37](https://github.com/nikunjmavani/core-fe/commit/f64ee3757460173187938ca6036f69b4a1c72059))
* password breach (HIBP k-anonymity) + strength meter on register/reset ([a57c981](https://github.com/nikunjmavani/core-fe/commit/a57c98104d99909fde0a667a7cb5097898534724))
* **rbac:** add can()/Gate/useVisibleNav UI-gating primitives (FE-51) ([0354519](https://github.com/nikunjmavani/core-fe/commit/03545197366d106cd8a8aaad32fa690880d005f3))
* **rbac:** add upload:manage permission to match the live core-be catalog ([c9b147c](https://github.com/nikunjmavani/core-fe/commit/c9b147c09cebf730e9d8c35144c5fa136045a0c4))
* **rbac:** derive live permissions from me/context ([85ce454](https://github.com/nikunjmavani/core-fe/commit/85ce454837c3fc81c6d2c1158ea7924b1195e17e))
* react 19 with react compiler, audit pins, and coverage ratchet raise ([4f73825](https://github.com/nikunjmavani/core-fe/commit/4f7382530b891c88e8b7e04c1bdfa6eb6a41c9a4))
* **routing:** add personal /dashboard route space (FE-21) ([155b965](https://github.com/nikunjmavani/core-fe/commit/155b965ad108334eb2d236120ba1f61caec7e252))
* **routing:** dual-mode AppShell nav for the personal /dashboard (FE-21) ([e5de014](https://github.com/nikunjmavani/core-fe/commit/e5de01449de2c87f63a07878c318a79efacdc025))
* **routing:** dual-URL org switcher (personal &lt;-&gt; team) (FE-24) ([aa5b632](https://github.com/nikunjmavani/core-fe/commit/aa5b6323494ae8d572e4bb368ffd6c45c9c8e8c9))
* **routing:** dual-URL root resolver decision (FE-19) ([08de3d4](https://github.com/nikunjmavani/core-fe/commit/08de3d43cea593f985f9ce7f1dc439969141b007))
* **routing:** me/context-based dual-URL root resolution (FE-19, FE-08, FE-23) ([21c2122](https://github.com/nikunjmavani/core-fe/commit/21c2122731b45be00c0c84aa3b0341384c651b86))
* **routing:** team URLs use $organizationSlug, not $organizationId (FE-22) ([71c1fb4](https://github.com/nikunjmavani/core-fe/commit/71c1fb4b716df09d6d778724442c5ca0319c1367))
* **security:** add L1/L5/L6 access gates on the gateway (FE-10/14/15) ([8871384](https://github.com/nikunjmavani/core-fe/commit/88713840164ae95f3de07ce3fdd42bd27a47a07c))
* **security:** gateway composer for sequential access gates (FE-09) ([08370f7](https://github.com/nikunjmavani/core-fe/commit/08370f7911d38207a4deaf543bd9a565719d057e))
* **security:** module entitlement gate L6b (FE-50) ([d8addb9](https://github.com/nikunjmavani/core-fe/commit/d8addb98f765dd9be9237e77a233926c9175957a))
* **security:** policy-driven gateway composer + manifest policy (FE-49) ([f4f4434](https://github.com/nikunjmavani/core-fe/commit/f4f44343065906c7735fb7a7f11da20444768936))
* **security:** wire per-route onDeny (403 vs hide-as-404) into the gateway (FE-52) ([f35e9ef](https://github.com/nikunjmavani/core-fe/commit/f35e9ef9022ce9f6381bf1dd9279dd143788decf))
* **settings:** build the Billing panel — plan + usage + cap-gated switch (FE-36) ([e729ae9](https://github.com/nikunjmavani/core-fe/commit/e729ae9c19b2320e072a3905eaeffd7e581e284c))
* **settings:** build the Members panel — list + cap-gated remove (FE-34) ([367cf3c](https://github.com/nikunjmavani/core-fe/commit/367cf3c09ff01ef7a8588e4d500da5ba1b6423fd))
* **settings:** build the Roles panel — list + cap-gated delete (FE-35) ([8670fe8](https://github.com/nikunjmavani/core-fe/commit/8670fe878ab78c5bcebce55e6429b8731777c450))
* **settings:** organization logo upload + remove (FE-33) ([586abfe](https://github.com/nikunjmavani/core-fe/commit/586abfe36402d47510a6d9a5d59e5d7b1d699b99))
* **settings:** organization sections by org type (personal vs team) ([280bc84](https://github.com/nikunjmavani/core-fe/commit/280bc8434db110e0d373073beecb6aeae0789c3c))
* **settings:** passkey management — list, register, revoke (FE-32) ([5fd91bc](https://github.com/nikunjmavani/core-fe/commit/5fd91bc66ebafee36e0d0d595ebd970d6ee68754))
* **settings:** rename org in the General panel (name-only) (FE-33) ([0eea3b6](https://github.com/nikunjmavani/core-fe/commit/0eea3b664b05b061d1370571c0ddd4a03166d718))
* **settings:** window org lists with server-side search, sort, and cursor paging ([128fad2](https://github.com/nikunjmavani/core-fe/commit/128fad2c298aeec3f3683517c8c3a014d4470ac3))
* **settings:** wire Integrations API-keys list + cap-gated revoke (FE-37) ([92b54e9](https://github.com/nikunjmavani/core-fe/commit/92b54e9abfb2ef7e9630feeec97922077bd01f29))
* **tenancy:** /auth/me/context contract + fetcher (+ shared wire helpers) ([c6285b5](https://github.com/nikunjmavani/core-fe/commit/c6285b5ea4a805cc6d78a7803afdd1fd27d3979d))
* **tenancy:** active-org switch service with inline-delta cache update (FE-06) ([74b3154](https://github.com/nikunjmavani/core-fe/commit/74b315473b028d7f88e134ef353051219c3524ff))
* **tenancy:** derive org store from me/context (FE-07) ([17ebe0a](https://github.com/nikunjmavani/core-fe/commit/17ebe0a128f9007e782decd6a6e765d8b52ae19b))
* **tenancy:** positive signup-&gt;dashboard flow against live core-be + e2e ([c40254d](https://github.com/nikunjmavani/core-fe/commit/c40254d355fdf111349c7b9dca3d6b8a9def5253))
* **theme:** accent presets + shuffle in the Appearance panel (FE-56, FE-66) ([d469c97](https://github.com/nikunjmavani/core-fe/commit/d469c97289cfc1d323cd2ade717945e8167e71f0))
* **theme:** add a temporary Shuffle shortcut to the theme menu (testing) ([244085b](https://github.com/nikunjmavani/core-fe/commit/244085bd752461dd1fa6f553e5b6ebeeef4a473b))
* **theme:** add an Icon weight axis (Thin / Regular / Bold) ([03e5e2f](https://github.com/nikunjmavani/core-fe/commit/03e5e2f7c71ebf879f4259cd72529f42ea300985))
* **theme:** color intelligence — harmony palettes, intensity, a11y-safe accents ([61f9b52](https://github.com/nikunjmavani/core-fe/commit/61f9b52d38b500630faad6b7471d333bda44ba2d))
* **theme:** env theme-lock flag to freeze the theme in code (FE-67) ([e704bc6](https://github.com/nikunjmavani/core-fe/commit/e704bc68740f1a6207ec456cd3486c1e4b846356))
* **theme:** env-driven layout width — 12-grid vs full-window (FE-60) ([258aaf4](https://github.com/nikunjmavani/core-fe/commit/258aaf40d5cb23930aee2cdb2164afe07240331f))
* **theme:** expand Appearance into a per-axis theme studio (shadcn-create style) ([ff2d01b](https://github.com/nikunjmavani/core-fe/commit/ff2d01b021c3ef40ac6875b6946c9ee5e0550501))
* **theme:** feel axes — separation, shape language, type scale, focus ring ([b46aaf1](https://github.com/nikunjmavani/core-fe/commit/b46aaf1cc7d071df8a43f3c7934291f20e4f2f20))
* **theme:** make Shuffle generate a fresh random theme (shadcn-create style) ([124759c](https://github.com/nikunjmavani/core-fe/commit/124759ccb33e9ccbd6b8099593edbd8638af1cc7))
* **theme:** named theme presets via data-theme (FE-55) ([91a0256](https://github.com/nikunjmavani/core-fe/commit/91a0256d442661e834ba65fe1f56a622c15511c5))
* **theme:** per-org brand accent engine (FE-57) ([71a635f](https://github.com/nikunjmavani/core-fe/commit/71a635f587fdd808ef3f26f6d2d3ec0067af2a8c))
* **theme:** retone the whole app on shuffle — density, motion, elevation, contrast ([c25da4e](https://github.com/nikunjmavani/core-fe/commit/c25da4e6b416fe0acd6d5828fd835a8c1448a410))
* **theme:** runtime icon-library switch (Lucide/Tabler/Phosphor), lazy-loaded ([9cc48aa](https://github.com/nikunjmavani/core-fe/commit/9cc48aab18ef34e2f8fe22d00630549b6c5f1dbb))
* **theme:** seeded + shareable looks — one integer drives the whole theme ([6807b61](https://github.com/nikunjmavani/core-fe/commit/6807b617c2578684ac2b1f45df9dc4719fdffc8c))
* **theme:** shadcn-create token parity + adoption doc (FE-54) ([692ee99](https://github.com/nikunjmavani/core-fe/commit/692ee99bd1ef372956b6bdee2106bbf2b7697723))
* **theme:** shuffle also themes the chart palette + sidebar ring ([23eaae0](https://github.com/nikunjmavani/core-fe/commit/23eaae07ea18ef82cbcc5fe4bd4b9e2d11c56b63))
* **theme:** shuffle now generates a full look (colour + font + radius) ([f2ddf9c](https://github.com/nikunjmavani/core-fe/commit/f2ddf9cb89a950d1e7d487d09f170cc59e353c0a))
* **theme:** shuffle now rolls the icon axes too (weight + library) ([263b01d](https://github.com/nikunjmavani/core-fe/commit/263b01dcd91a00a314ef8a594f0aef603b310868))
* **theme:** temp switches to gate layout + toast shuffle (off by default) ([3ce9d22](https://github.com/nikunjmavani/core-fe/commit/3ce9d22cf7ae695438f6719637b138439dfbd5f6))
* **theme:** theme-store preset + shuffle engine (FE-56/FE-66 engine) ([4e1ebaf](https://github.com/nikunjmavani/core-fe/commit/4e1ebafc5e04f9fe80eba1b0408c1c8a11419de9))
* token-url containment, reload-loop guard, and analytics identity reset ([67656c0](https://github.com/nikunjmavani/core-fe/commit/67656c0b75e88960d557cf268c0239daa7b87bce))
* trusted types (report-only), absolute session cap, SRI guidance ([c3d2428](https://github.com/nikunjmavani/core-fe/commit/c3d2428991a6f9d38fb0bebdbb82d605be8bca38))
* **ui:** clearer animated profile avatar + pointer cursor on menu items ([1881293](https://github.com/nikunjmavani/core-fe/commit/188129347c7f26e58bd5b1f76f58aaa8368351a4))
* **ui:** group the org switcher into Personal + Organizations sections ([106405a](https://github.com/nikunjmavani/core-fe/commit/106405a4a7d49c4ca55a7c8271e2bbee892094cb))
* **ui:** in-progress feedback for resend-invitation and remove-member ([a950089](https://github.com/nikunjmavani/core-fe/commit/a950089d94d76f0e1f0abb36e77f0bc5394b3cae))
* **ui:** make the auth brand panel theme-driven (accent atmosphere + icons) ([a70f6a0](https://github.com/nikunjmavani/core-fe/commit/a70f6a0f68ee3a18b9ab641b66dc99de22422640))
* **ui:** notification popover + settings-modal scroll polish ([fed27d8](https://github.com/nikunjmavani/core-fe/commit/fed27d8f2bebb082aab2cedaf2738d4c0f37fbb0))
* **ui:** richer notification popover ([1cf7806](https://github.com/nikunjmavani/core-fe/commit/1cf78068e19c9558d2030990c016d1b8246cb21f))
* **ui:** surface the theme toggle everywhere via a shared ThemeModeToggle ([0f5d8b5](https://github.com/nikunjmavani/core-fe/commit/0f5d8b55283158ee391049aca2fd59fe864355f8))
* unified single-flight refresh, per-route titles, and route announcer ([2372365](https://github.com/nikunjmavani/core-fe/commit/2372365914682cf746652e371b42d93faf58b8c4))
* url-mirror pages architecture with organization tenancy and hash settings ([96110ee](https://github.com/nikunjmavani/core-fe/commit/96110ee1ef1a9963c3399017b51445071798b881))
* **ux:** add adaptive Surface (modal or right drawer) (FE-53) ([8d6bb9e](https://github.com/nikunjmavani/core-fe/commit/8d6bb9ebd4e5efab02cebb2112286c9ebc6a5089))
* **ux:** add EmptyState primitive for empty data surfaces (FE-48) ([4d37965](https://github.com/nikunjmavani/core-fe/commit/4d37965af69e1d9ad79b113abf2d38774076f56b))
* **ux:** add useAppMutation write wrapper (FE-45) ([f66524e](https://github.com/nikunjmavani/core-fe/commit/f66524edc3be630370dc45c8afe7b5cb2e4bb98c))
* **ux:** branded boot loader + flash-free in-app navigation ([b0dbb17](https://github.com/nikunjmavani/core-fe/commit/b0dbb17a01884cf67f23e5fced056036f8a632f4))
* **ux:** floating settings handle — open Appearance from anywhere ([7293e1d](https://github.com/nikunjmavani/core-fe/commit/7293e1d618bb17daa210a9acd9b489272eaab0e4))
* **ux:** shared ConfirmDialog for destructive actions (FE-47) ([6a9a79d](https://github.com/nikunjmavani/core-fe/commit/6a9a79de24aa7392d7880c29f2cd3b31caf03010))
* **ux:** single notify toast surface + sonner import guard (FE-43) ([72492ab](https://github.com/nikunjmavani/core-fe/commit/72492ab1efad32cfd174a0b8eb5e916556312f80))
* **version:** defer the new-deployment reload until the user is idle ([d9eb780](https://github.com/nikunjmavani/core-fe/commit/d9eb780d6f2c30f1404505e16a7656b6cb64e346))


### Fixed

* a11y form-error association, org-picker error/empty states, write-method tests ([f090ac8](https://github.com/nikunjmavani/core-fe/commit/f090ac83cbb20d093374c24ad4fc47a65627dd45))
* **api:** align frontend contracts with core-be [#795](https://github.com/nikunjmavani/core-fe/issues/795) ([b0a3883](https://github.com/nikunjmavani/core-fe/commit/b0a388310190cedf984a8b5ce729098f75c61bb5))
* **api:** follow cursor pagination to fetch full lists (audit 5.1) ([16fd4a6](https://github.com/nikunjmavani/core-fe/commit/16fd4a623466a16d7a9a2a9a9d2cd027d5d3d8e8))
* **api:** tolerant per-row parse for list endpoints (audit 5.2) ([c51028c](https://github.com/nikunjmavani/core-fe/commit/c51028c77d38905e58cd916d80dd7f5dceee7424))
* **app:** top-nav org switcher layout (chevron wrapped below) ([91ab755](https://github.com/nikunjmavani/core-fe/commit/91ab755a26a44481408d30850de4a3322b34ed2d))
* **auth:** clear active-org context + RBAC permissions on logout ([53cc3a7](https://github.com/nikunjmavani/core-fe/commit/53cc3a7f55c35e257d37ffe8ca94931875739801))
* **auth:** gate switch-to-personal on real personal org + land direct after email login ([#59](https://github.com/nikunjmavani/core-fe/issues/59)) ([d54f060](https://github.com/nikunjmavani/core-fe/commit/d54f0600cfda1c515d12b256ec67f9ceea20fae0))
* **auth:** label the passwordless code flow "Email OTP" (was "Magic link") ([4b259e2](https://github.com/nikunjmavani/core-fe/commit/4b259e217c1de786f1c6a266bd7deece0cfc6b4c))
* **auth:** stable method-button labels + shared AuthMethodButton (consistent loading/disable) ([#50](https://github.com/nikunjmavani/core-fe/issues/50)) ([659f493](https://github.com/nikunjmavani/core-fe/commit/659f49379f9ea39ae335e0a94e15d2745a5b8500))
* **billing,table:** route Stripe param-clear through router; drop dead filter recompute ([fbaa324](https://github.com/nikunjmavani/core-fe/commit/fbaa324f0eca154e84cb6541fda2523eb77306ff))
* **billing:** page through all invoices instead of the latest page only ([f816441](https://github.com/nikunjmavani/core-fe/commit/f816441d4956f89a0b64c8ff15eb358b88882d8b))
* **billing:** tolerant-parse billing lists so one bad row can't blank them ([585763b](https://github.com/nikunjmavani/core-fe/commit/585763bb6f959580c5165f99507b68f40c19ae77))
* **ci:** skip fully-dynamic apiClient path in contract-drift gate ([7ca15ad](https://github.com/nikunjmavani/core-fe/commit/7ca15ad3406f8804a5c76a8f41295812fc4a4905))
* **ci:** use YAML comment syntax in CodeQL config ([e5a5e52](https://github.com/nikunjmavani/core-fe/commit/e5a5e52b5e32187f9dc32182eac21ce6ff42bb0f))
* clear sonarqube gate — zod v4 email idiom, native-friendly choice chips ([909bbe8](https://github.com/nikunjmavani/core-fe/commit/909bbe8c56e96840f92312379e3d9241418669dc))
* consent banner uses a native section over role=region (sonar S6819) ([c84a641](https://github.com/nikunjmavani/core-fe/commit/c84a6416493c322cd1188fc580b2c0ce02f0ef17))
* correct env-tooling PROJECT_ROOT depth and align dev preview port ([#33](https://github.com/nikunjmavani/core-fe/issues/33)) ([3ac3013](https://github.com/nikunjmavani/core-fe/commit/3ac3013a5dedfea1cf09d22c8ee4b61360b46f06))
* **csp,http:** allow PostHog script host and normalize API base URL ([#44](https://github.com/nikunjmavani/core-fe/issues/44)) ([0cc3898](https://github.com/nikunjmavani/core-fe/commit/0cc3898fbefb6fc32815447935089bc606118856))
* **deploy:** bundle client VITE_* env into the production build + dev-preview/env-tooling fixes ([#37](https://github.com/nikunjmavani/core-fe/issues/37)) ([977e415](https://github.com/nikunjmavani/core-fe/commit/977e415faa437fdd57b1dd366c63019467156218))
* **deploy:** materialize client env into .env.production.local before build ([#38](https://github.com/nikunjmavani/core-fe/issues/38)) ([2bef55a](https://github.com/nikunjmavani/core-fe/commit/2bef55a5d02b3fd8c83e6e08675c0189f5ed41ec))
* **deps:** patch vite (&gt;=7.3.6) and force dompurify &gt;=3.4.7 for known CVEs ([f2056d9](https://github.com/nikunjmavani/core-fe/commit/f2056d96ded37b901535c2ea9b401452d992746e))
* **http:** pin the bearer token to the API origin (token-exfiltration guard) ([68ac3aa](https://github.com/nikunjmavani/core-fe/commit/68ac3aa87105fa468cb39a999452609b022577bf))
* **http:** unify retry budget, honor Retry-After, stop retrying timeouts ([648a380](https://github.com/nikunjmavani/core-fe/commit/648a380759582df5a19df67be4ff374fe378c0c7))
* **i18n:** never crash the billing UI on a malformed server currency code ([cdc91ea](https://github.com/nikunjmavani/core-fe/commit/cdc91ea2a45408a7d909272b35de74cc7c6704a2))
* **notifications:** org-scope inbox + unread-count keys (cross-tenant bleed) ([1a7c6ea](https://github.com/nikunjmavani/core-fe/commit/1a7c6ea69c96786ab079fe7066cd14d9e66d1b5b))
* **notify:** opaque toast variants (visible over modals) + shuffle preview ([9d4fb25](https://github.com/nikunjmavani/core-fe/commit/9d4fb2574bf44a8907d68c6c00ff1a3f5206c8f7))
* **onboarding:** land directly on dashboard + collect first/last name ([#61](https://github.com/nikunjmavani/core-fe/issues/61)) ([82829cc](https://github.com/nikunjmavani/core-fe/commit/82829cc0dfb131962c3d4f1b21e0a6ade00621fd))
* **profile:** send snake_case first_name/last_name/job_title to PATCH /users/me ([#57](https://github.com/nikunjmavani/core-fe/issues/57)) ([db2c972](https://github.com/nikunjmavani/core-fe/commit/db2c972732497e3102463ef6ac634939de7c14cd))
* **quality:** clear the full Sonar backlog (170→0) and all Biome warnings ([#21](https://github.com/nikunjmavani/core-fe/issues/21)) ([0b077d4](https://github.com/nikunjmavani/core-fe/commit/0b077d4214570fb5d43867744a6c0f3d3e1aa1b0))
* **rbac:** tenant-match permission gate, fail-closed perm refetch, empty-list guard ([f77326e](https://github.com/nikunjmavani/core-fe/commit/f77326eea46316ff7bfa95a25b1f711f3b330d5d))
* **react:** stop calling new Date() during render (audit 4.2) ([aee1c3b](https://github.com/nikunjmavani/core-fe/commit/aee1c3bd79580927f02f911c4df20d0bc01908ed))
* **responsive:** app shell + auth touch targets (pass 2) ([cb55dc7](https://github.com/nikunjmavani/core-fe/commit/cb55dc7c103fa66289553ddd613daacfad0d5b12))
* **routing:** org status gating, guest guards, and invite-id validation ([f48a56f](https://github.com/nikunjmavani/core-fe/commit/f48a56f687566817e2ec4f158065c00ab7648009))
* **security,perf:** COOP header, Turnstile preconnect, button transition + remove SKIP_SONAR bypass ([#46](https://github.com/nikunjmavani/core-fe/issues/46)) ([c6239e5](https://github.com/nikunjmavani/core-fe/commit/c6239e52bb62c88763f4ea361988ce9e0bd5b0a3))
* **security:** harden OAuth redirect, chart CSS, analytics consent, and external links ([b41a1b5](https://github.com/nikunjmavani/core-fe/commit/b41a1b5df97a0ce502e6c00cc0f5f26dc55fc73a))
* **security:** MFA token in memory (CodeQL high) + esbuild override (Dependabot) ([#48](https://github.com/nikunjmavani/core-fe/issues/48)) ([ab49965](https://github.com/nikunjmavani/core-fe/commit/ab49965a8a35a8409168e500f0a33f6fa288880a))
* **security:** neutralize CSV/formula injection in exports ([76ea77d](https://github.com/nikunjmavani/core-fe/commit/76ea77de4934c807167e1198757d628c24dcd549))
* **security:** reject control-char/whitespace in redirect paths (FE-58) ([fec0e58](https://github.com/nikunjmavani/core-fe/commit/fec0e583a248db5f860449a234f10ebb1dee8d42))
* **settings:** extract panelForSection + lint/format cleanup ([71c414f](https://github.com/nikunjmavani/core-fe/commit/71c414fe346216626a5f4058872397decb17146b))
* **telemetry:** scrub Stripe client secrets from PostHog/Sentry URLs ([be46945](https://github.com/nikunjmavani/core-fe/commit/be469459669042273a1ec27ec52ff9a7dfd746fe))
* **tenancy:** actually switch active org on navigation to a team org ([e621768](https://github.com/nikunjmavani/core-fe/commit/e6217688816dd32a15c3f223920acb843fbfd535))
* **tenancy:** clear org-scoped query cache on org switch (audit 6.1) ([8649cf4](https://github.com/nikunjmavani/core-fe/commit/8649cf4e2cb54718c079425bb8386f3f9d14e309))
* **tenancy:** guard org-switch token race so the latest org wins ([7c880f8](https://github.com/nikunjmavani/core-fe/commit/7c880f8c93d977c29c1829a686671611610974c4))
* **tenancy:** keep the mock active org in sync with the URL ([eddf9e3](https://github.com/nikunjmavani/core-fe/commit/eddf9e38f288d657dfdb62596cdcfe92e030a050))
* **tenancy:** paginate listMyOrganizations so &gt;25 orgs aren't truncated ([ef34777](https://github.com/nikunjmavani/core-fe/commit/ef347773f771b1123f77fe62a98da2ce9ff2f50b))
* **tenancy:** tolerate me/context capabilities without can_manage_billing ([d657251](https://github.com/nikunjmavani/core-fe/commit/d65725188c01737e37b4a132a03ec9ed13340888))
* **test:** mock meContextQueryKey in useMeContext test (FE-05 follow-up) ([64953cd](https://github.com/nikunjmavani/core-fe/commit/64953cd3ebd2f2341102ba0d0eee891878f60dd8))
* **tooling:** resolve .github IaC dirs from repo root, not tooling/ ([aaf6e5d](https://github.com/nikunjmavani/core-fe/commit/aaf6e5d78a23090d4e3abd6f75390f03239216fb))
* **ui:** FormattedDate must not crash on an Invalid Date object ([77c083e](https://github.com/nikunjmavani/core-fe/commit/77c083ed477c8ba2ffa451c2e399fe895f9b9cc1))
* **ui:** make the settings scroll-shadow mode-aware ([1473d6c](https://github.com/nikunjmavani/core-fe/commit/1473d6c0fce24bc30d60d19431329576b0f0e403))
* **ui:** pointer cursor on interactive elements + make org picker a real link ([cb4746b](https://github.com/nikunjmavani/core-fe/commit/cb4746b33dadae8c29c80f715cdd16d4138abda0))
* **ux:** seamless boot splash — match the HTML spinner to FullPageSpinner ([d6e78f1](https://github.com/nikunjmavani/core-fe/commit/d6e78f10627d95183db1476cddfd5878cf3ec4d0))


### Performance

* **ci:** minimize per-merge post-merge cost + batch dev deploys ([#64](https://github.com/nikunjmavani/core-fe/issues/64)) ([8f97ebd](https://github.com/nikunjmavani/core-fe/commit/8f97ebd6ac6a5f4e45e6b7dba90193aacf411ce5))


### Changed

* **appearance:** extract pure look helpers into a tested module ([2f253bc](https://github.com/nikunjmavani/core-fe/commit/2f253bc76a76926ea512eabb41dae36b422b32ba))
* **appearance:** move theme config to its own dialog, out of Settings ([10254bc](https://github.com/nikunjmavani/core-fe/commit/10254bc5188200cfbe00ede4c8025c80b583fdbd))
* **app:** mirror url tree across src, relocate mis-layered utils, and green lint/biome ([976e60d](https://github.com/nikunjmavani/core-fe/commit/976e60dd417ee269d6b3e361035576fca4fe8192))
* **billing:** align plan fixtures to the real core-be catalog (Free/Starter/Pro) ([af45e85](https://github.com/nikunjmavani/core-fe/commit/af45e8594bcf1e5d1f2e18f0f06b8ce9d741392c))
* **config:** env-driven, strict two-environment config model ([#52](https://github.com/nikunjmavani/core-fe/issues/52)) ([f032163](https://github.com/nikunjmavani/core-fe/commit/f032163fcd963ff3729a7cf7ad227ab87cae04d2))
* **dashboard:** promote dashboard UI to shared/components/Dashboard (FE-20) ([f09bc7a](https://github.com/nikunjmavani/core-fe/commit/f09bc7aed3f6ed53078d4b017dc35f12d46ae182))
* finalize route-island anatomy with manifest role file and family-shared tier ([bd74c7c](https://github.com/nikunjmavani/core-fe/commit/bd74c7cf23a46fbf422a2b3cbd8644740e011027))
* **guards:** express org-context guards as composable gates (FE-11/12/13) ([c60df49](https://github.com/nikunjmavani/core-fe/commit/c60df49fad5e12e50f7524cc2960d0561e5b03d0))
* **layouts:** rename AppShell → AppLayout (testid app-shell → app-layout) ([ef268cd](https://github.com/nikunjmavani/core-fe/commit/ef268cdbbed84c4170e64fbb2ed4c10e2d40caef))
* **mcp:** keep core-fe's MCP set frontend-only — decouple from core-be ([2fcc79a](https://github.com/nikunjmavani/core-fe/commit/2fcc79addaedf44a1579081993de1f3596a96ebb))
* **mcp:** make CLI MCP servers project devDependencies (container-safe) ([85d5d0d](https://github.com/nikunjmavani/core-fe/commit/85d5d0daa3b1ea4d9945eecdc787024aed04f23a))
* **mcp:** run headroom via uvx — no global install ([1729cad](https://github.com/nikunjmavani/core-fe/commit/1729cadef9418cbed666f691db6d18f118066ce9))
* **rbac:** remove the org capabilities abstraction (permission + team-org) ([14b8236](https://github.com/nikunjmavani/core-fe/commit/14b823611817162ac5693860092594432519166b))
* **routing:** consolidate redirectIfAuthenticated onto auth-shell (FE-18) ([15d89a7](https://github.com/nikunjmavani/core-fe/commit/15d89a76a0f293807ef6b24df05b1731bf314d9e))
* **tenancy:** org-scope every query key; drop switch cache purge ([0a4e30e](https://github.com/nikunjmavani/core-fe/commit/0a4e30e8989eba642b2f80e0ab34d2f3f02e46d8))
* **test:** name e2e/integration specs per backend convention ([edb9a7b](https://github.com/nikunjmavani/core-fe/commit/edb9a7be97b7017a89c2c00c7e2141746e2e7cdd))
* **theme:** stop persisting TEMP auth/app layout variants ([07d76fc](https://github.com/nikunjmavani/core-fe/commit/07d76fca051523e6b5797f9b0f37b49e9e877d44))
* **ui:** avatar/settings/dashboard polish + more mock notifications ([9795f28](https://github.com/nikunjmavani/core-fe/commit/9795f28d56489ee42675fec89ecb42cc608c50f9))


### Documentation

* add the design-language guide (design.md) ([2f6df7b](https://github.com/nikunjmavani/core-fe/commit/2f6df7b0b8bd53469a6e29bde7c5f624f11d027d))
* **agent-os:** add Tier 1 domain skills for routing, CRUD, errors, and platform hygiene ([e56ff9d](https://github.com/nikunjmavani/core-fe/commit/e56ff9d519813016e6b0f9ee6401ce3f04b689b8))
* **agent-os:** reword hooks README independence note (no sibling repo named) ([f73008c](https://github.com/nikunjmavani/core-fe/commit/f73008c83712c8759947ccf089104c41e029ea94))
* **api:** capture real core-be positive-path responses as wire-contract reference ([4eb60df](https://github.com/nikunjmavani/core-fe/commit/4eb60df5ce233cee0763d51ce48f71e2593e8dd0))
* **audit:** iteration 2 — RBAC & tenancy authorization findings ([9fa63a7](https://github.com/nikunjmavani/core-fe/commit/9fa63a711cb1fc4fc8d88b71cc9b5295bdc835d4))
* **audit:** iteration 3 — HTTP client & auth-token resilience findings ([bab247f](https://github.com/nikunjmavani/core-fe/commit/bab247f2495cea62a9e57af6fb0f60ed0866704d))
* **audit:** iteration 4 — React purity & state correctness findings ([ffca575](https://github.com/nikunjmavani/core-fe/commit/ffca57546d3166c4032db7ccf5baf95bfaa43f56))
* **audit:** iteration 5 — scalability & data-layer (high-signal) ([0c1dc74](https://github.com/nikunjmavani/core-fe/commit/0c1dc7455abc792245052c85dd1cd960096a15e7))
* **audit:** iteration 6 — tenancy cache isolation (cross-tenant collision) ([11da33f](https://github.com/nikunjmavani/core-fe/commit/11da33f3507d737abc142032bd2f82370873d78b))
* **audit:** iteration 7 — converged, recurring loop stopped ([c7083b3](https://github.com/nikunjmavani/core-fe/commit/c7083b3ce9c455b0d5aa04ae1ccb3e5102b0aa7a))
* **deployment:** cicd-and-netlify to single-trunk model ([#70](https://github.com/nikunjmavani/core-fe/issues/70)) ([5646b25](https://github.com/nikunjmavani/core-fe/commit/5646b25d049d0515b05692d4e83233c3004459d2))
* **deployment:** env/runbook to single-trunk model ([#68](https://github.com/nikunjmavani/core-fe/issues/68)) ([6f1cfb6](https://github.com/nikunjmavani/core-fe/commit/6f1cfb62064e3ee369bdb7cc1bf439286e37df81))
* describe the idle-gated version reload ([028e578](https://github.com/nikunjmavani/core-fe/commit/028e578ad4c7f89244b35bd464366d9d31ac8858))
* document optimistic-update policy and inventory; sync data rule + http-forms skill ([deddebc](https://github.com/nikunjmavani/core-fe/commit/deddebc2659605614ef563edc817d52642204d87))
* embed the canonical island anatomy block across rules, skills, and references ([23b7dd9](https://github.com/nikunjmavani/core-fe/commit/23b7dd9d8c6a9c11453862059d4422bb25178b4f))
* **placeholders:** correct stale REPLACE_WITH markers; pin deferred ones to BE gaps ([0003513](https://github.com/nikunjmavani/core-fe/commit/00035137958ffc464adb4db03dbab89c0edc442b))
* **plan:** close out FE-08/11/16/29/30/32/33/38/41/42/52/57 — all 67 items complete ([067b90d](https://github.com/nikunjmavani/core-fe/commit/067b90db842efb22e0f83821103b98fa970f4929))
* **plan:** mark FE-19/23 dual-URL routing wired; FE-08/22 partial ([d4ed30a](https://github.com/nikunjmavani/core-fe/commit/d4ed30a63df44032e7b3b483f591c311f6ff1edd))
* **plan:** mark FE-22 slug URLs complete — all 67 items built ([450c333](https://github.com/nikunjmavani/core-fe/commit/450c333943b3dd9e56754e5ac266d5cef9433195))
* **plan:** mark FE-29 webhooks + FE-37 integrations complete ([8254f8f](https://github.com/nikunjmavani/core-fe/commit/8254f8f951ac2f8d72c48de2d6fdc350563ef083))
* **plan:** mark FE-32 MFA done (passkeys follow-up) ([b751204](https://github.com/nikunjmavani/core-fe/commit/b75120475b9fc8efb13c16cf073d21cecc6c0b3a))
* **plan:** mark FE-33 org rename done — Phase 6 complete ([cb15c78](https://github.com/nikunjmavani/core-fe/commit/cb15c78657885dd7f76899c58ae15ef91b7ca434))
* **plan:** mark FE-39/40 polish foundations shipped; FE-57 blocked on backend brand_color ([189d399](https://github.com/nikunjmavani/core-fe/commit/189d399549b6afe78459236275f57835c8d08a90))
* **plan:** mark FE-49/50 done — authz model complete (session/permission/capability/module) ([d5c90c0](https://github.com/nikunjmavani/core-fe/commit/d5c90c0a2628602687ba98209fe30b446fa9f939))
* **plan:** mark FE-51 UI-gating primitives done ([7b6db84](https://github.com/nikunjmavani/core-fe/commit/7b6db84804630f41325c200e6db7b4d707fd3881))
* **plan:** mark FE-59 login returnTo-consume done (other flows pending) ([647e5ad](https://github.com/nikunjmavani/core-fe/commit/647e5ad523a4884b4a626c89ac9398fa24115fdc))
* **plan:** mark FE-59 returnTo complete across all auth flows ([de76429](https://github.com/nikunjmavani/core-fe/commit/de76429191407dbecdfa3b26b459f700bb833dcf))
* **plan:** mark FE-59 returnTo through login + MFA done ([fe6ca52](https://github.com/nikunjmavani/core-fe/commit/fe6ca5220955622cce221fee3ef8ab8b6279f51d))
* **process:** rewrite git-workflow for the single-trunk model ([#66](https://github.com/nikunjmavani/core-fe/issues/66)) ([9888236](https://github.com/nikunjmavani/core-fe/commit/9888236b22fe138c7b7c80f18bef7205cbc1be15))
* **rbac:** reword remaining "capability" prose to "permission" ([4e98315](https://github.com/nikunjmavani/core-fe/commit/4e9831547fccb5b740177c0f6062435c866421fc))
* **rbac:** scrub stale capability references after the removal ([bde6d4e](https://github.com/nikunjmavani/core-fe/commit/bde6d4e20a116c2981b8567ed2a30abb13ef4440))
* **research:** add core-be integration plan (07) — supersedes naive 06 ([4e2b9fa](https://github.com/nikunjmavani/core-fe/commit/4e2b9faca67f7350ad45ff5d432f430335df0aca))
* **research:** add global theming (§9 / D-28 / Phase T FE-54…FE-57) ([fb71550](https://github.com/nikunjmavani/core-fe/commit/fb715508c5d88be39385ab5fd372e39e95f4fb08))
* **research:** add login-redirect returnTo (§3.9/D-29/FE-58-59) + env layout width (D-30/FE-60) ([0e4637e](https://github.com/nikunjmavani/core-fe/commit/0e4637ea2ec9b02e25188754ddd37b81fb26e17f))
* **research:** add notifications module (§10 / D-31 / Phase N FE-61…FE-65) ([d1d5ea1](https://github.com/nikunjmavani/core-fe/commit/d1d5ea136e084fc2922eb62e0ede906be97e82c2))
* **research:** add Phase F cross-cutting UX layer (FE-43…FE-48, D-25) ([e1e793f](https://github.com/nikunjmavani/core-fe/commit/e1e793f442d914b51207501fa86a7f3da99f03ad))
* **research:** add route authorization model (§3.8/D-26/Phase 3A) + adaptive surface (D-27/FE-53) ([e3f6415](https://github.com/nikunjmavani/core-fe/commit/e3f6415e3ba26a559001545a08f9cbd9940cb638))
* **research:** backend-integration plan set (07–09) + dev-shipped reconciliation ([e6d80ab](https://github.com/nikunjmavani/core-fe/commit/e6d80abd00c69935b996628fde4bb92701ae2111))
* **research:** consolidate design + plan into 11 (remove 10) ([c04b467](https://github.com/nikunjmavani/core-fe/commit/c04b4670811ff567c074e288578e0414e0a3c77e))
* **research:** dual-URL tenancy + routing + auth-alignment design (10) ([ec5e6dd](https://github.com/nikunjmavani/core-fe/commit/ec5e6dd82916bd9d43a7139594249a6f613d158d))
* **research:** fix stale counts in decisions-index header (25 → 48) ([25d0b65](https://github.com/nikunjmavani/core-fe/commit/25d0b654a2f6a06676db996f6f1f8d7141978ecb))
* **research:** give every plan item a stable ID (FE-01…FE-42) ([1044a73](https://github.com/nikunjmavani/core-fe/commit/1044a732e9efc77664e9bb819c93525e77d50687))
* **research:** item-wise implementation plan (11) for review ([f9b7971](https://github.com/nikunjmavani/core-fe/commit/f9b797135f20ca16f01ac4425789df9d2399263f))
* **research:** itemize Part I — 24 design decisions (D-01…D-24) ([1c98b91](https://github.com/nikunjmavani/core-fe/commit/1c98b91b6a199f4dadcfcd600ec30f204c8af66a))
* **research:** remove merged research/10; fix lint in consolidated 11 ([598befa](https://github.com/nikunjmavani/core-fe/commit/598befa21c4104ce61d3c75794dd4ec17bf1f067))
* **research:** theme shuffle + env freeze (D-32 / FE-66-67); fix wrapped-bullet lint ([2697bbe](https://github.com/nikunjmavani/core-fe/commit/2697bbeff30df85cf32a628cbc43ebf46277b969))
* **research:** three shared layouts + dashboard = 1 tab / 1 page ([0b03c74](https://github.com/nikunjmavani/core-fe/commit/0b03c74cbcb35925a6fe44524b8e5cfa3941fa47))
* **research:** tidy switch-response snippet in design 10 ([df9526c](https://github.com/nikunjmavani/core-fe/commit/df9526c880011c9725918ae40d41c11cd14b4b38))
* rewrite reference/deployment/process docs and research for url-mirror + tenancy ([51594a1](https://github.com/nikunjmavani/core-fe/commit/51594a190148caf989a1736cda62c07531c12cca))
* **routing:** reflect dual-URL routing in routes-and-ui + routing-and-tenancy (FE-42) ([f4f762e](https://github.com/nikunjmavani/core-fe/commit/f4f762e696c6d22e7665eb22dcb4fc154f30b547))
* **security:** record this session's controls in the security model ([1619a80](https://github.com/nikunjmavani/core-fe/commit/1619a808784e176068793733fd2c657ec654fb98))
* **spec:** backend list-pagination change spec for core-be ([ada478b](https://github.com/nikunjmavani/core-fe/commit/ada478b2f9ce142a83b22a038d7d8ca23b4734b3))
* **test:** codify e2e/integration naming + fix stale __tests__/unit guidance ([d3a4b4d](https://github.com/nikunjmavani/core-fe/commit/d3a4b4d76b4994a0a40cfc0fe0c17cd2e0bcd8be))


### Chores

* **ci:** collapse release to single-channel trunk on main ([4506de3](https://github.com/nikunjmavani/core-fe/commit/4506de305fd37b325047ef7ae5f3908482cb70e4))

## Changelog

<!--
release-please manages the version sections below this line on the single trunk.

Pre-trunk history is preserved out-of-band, not inlined here:
  - the dev prerelease channel lives in the `v1.0.0-dev.1` … `v1.0.0-dev.9`
    GitHub Releases (and the deleted `CHANGELOG-dev.md`, in git history);
  - the untagged pre-trunk `1.1.0` file bump (PR #42, 2026-07-04) lives at that
    commit in git history.
The first single-trunk release (`v1.1.0`, via `Release-As`) is generated below.
-->
