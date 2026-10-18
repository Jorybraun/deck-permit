# Using deck-permit as a PIPEY challenge

Status: **complete challenge content; local validation passed; not an approved challenge.**
This does not change the Deck Permit application or authorize real candidate work.

## Reuse the existing format

PIPEY already defines `pipey.challenge/1`. Do not introduce another manifest or a
candidate-visible upload/packaging workflow. The recruiter supplies this public
repository's URL; PIPEY pins one immutable commit and stores the imported source
privately. Validation and explicit recruiter approval are separate steps.

The authoritative definitions are in PIPEY:

- [Repository format and safety boundaries](https://github.com/Jorybraun/PIPEY-RECRUITER/blob/devin/1792347380-candidate-repository-files/product/design/technical-interview-repository-format.md)
- [Manifest contract](https://github.com/Jorybraun/PIPEY-RECRUITER/blob/devin/1792347380-candidate-repository-files/packages/contracts/src/technical-interview-manifest.ts)
- [Role-bound authoring guide](https://github.com/Jorybraun/PIPEY-RECRUITER/blob/devin/1792347380-candidate-repository-files/packages/interview-definitions/src/authoring/guide.ts)

The integration reference above was inspected at
`80efb6355925cb75d22d6c92502a4dc1d6167f60`; it is not a claim that the integration
has been merged or deployed.

The adaptation uses the existing format's files:

| File | Purpose |
| --- | --- |
| `pipey-interview.json` | Strict manifest: image digest, platform, commands, time/resource limits, workspace paths and policy pins. |
| `TASK.md` | One bounded candidate task, starting state, visible checks and expected submission. |
| `rubric.json` | Candidate-visible evidence prompts mapped to confirmed requirement IDs; not private grading or an automatic hiring score. |
| `role-brief.json` | Exact public snapshot of the selected published role, with its existing revision and digest. |
| `POLICY.md` | The actual disclosed policy bytes referenced by the manifest; not invented permissions. |
| `environment/` | Setup, health and verify commands producing the reports required by PIPEY. |

Use the existing authoring guide to bind the selected role. Do not copy the
integer-total starter's task, requirement IDs, policy claims or all-zero template
image digest into this application just to make it look complete. Do not put the
containing repository's own commit/tree hash into its manifest.

Everything in the imported archive is visible to the candidate. Answer keys,
hidden tests, private grading instructions, credentials and real candidate data
must stay outside this public repository **and outside the workspace image**.
The public rubric does not replace PIPEY's separately protected assessment data.

## Source archive boundary

The current PIPEY importer rejects hidden paths other than `.gitignore`.
`.gitattributes` therefore excludes only `.devin/`, `.env.example` and
`.gitattributes` itself from Git source archives. These files remain in the Git
repository and ordinary clones; no application source is deleted or rewritten.
Do not extend this exclusion to hide grading material: public Git history is public.

The committed-archive checks compare the complete retained file set, bytes and
executable flags with the selected Git tree:

```sh
python3 tests/pipey_archive_test.py
```

The default revision is `HEAD`, not uncommitted files. To check a different
committed revision, set `PIPEY_ARCHIVE_REF` to its full SHA. These are packaging
tests, **not** PIPEY validation, a GitHub-provider test or candidate-launch proof.
The real GitHub download must also be checked before acceptance.

## Selected exercise and published role

`TASK.md` asks for a typed, pure comparison of two existing `ProjectEstimate`
values and visible regression tests. It does not change the app's pricing formula,
add UI/provider calls or supply a solution. `rubric.json` is public evidence
guidance, not hidden grading.

`role-brief.json` is byte-for-byte the public snapshot from PIPEY's server-generated
authoring kit for `role_public_d3d52cca-9df7-46c2-9859-a1f8bec9f562`, publication 1.
Its digest is `sha256:29ecb63a7f6cb6f37b3f618aabac662f3ab3dead35ab7e620d88fb3a669f1d85`.
The existing confirmed requirement `req_9d30418435e14a8e` is implementing a typed
TypeScript function and covering its behavior with an automated test. Both rubric
criteria map to it. This is an explicitly fictional, non-selection test role.

## Offline runtime

This is a React/TypeScript/Vite application, not the Python-only fictional starter.
Its existing commands are `npm ci`, `npm run lint`, `npm test`, `npm run build`
and `npm run dev`. Its dependency lockfile must remain authoritative.

PIPEY's current local validator runs with no network, a read-only image,
restricted writable paths and bounded command timeouts. Running `npm ci` inside
that validator is not an offline setup solution. The retained desktop Dockerfile
does not provision this application's locked dependencies.

`environment/Dockerfile` extends the retained digest-pinned desktop with a
checksum-pinned Node 24.16.0 distribution and dependencies from the unchanged npm
lockfile. Installation happens at image build time, with lifecycle scripts disabled.
Only the Dockerfile and two package manifests belong in its build context; never
send a developer checkout, credentials, `.env` or private material to an image build.
No candidate source, solution or private evaluator is baked into the runtime.

`environment/commands.mjs` checks the image's package/lockfile bytes, performs
TypeScript compilation and runs the visible Vitest suite. Vite cache, reports and
optional build output go under `reports/`. Zero, failed or skipped tests cannot
produce a passing verification report. Setup does not run `npm ci` or download
anything. The extra `build` command is a developer check, not a fourth PIPEY stage.

`pipey-interview.json` pins the locally built OCI index
`sha256:76e8ad15685900cf27e64bd094246e686318aa547a6c7e92672ff5da00452044`.
Its Linux/amd64 manifest is
`sha256:3f10ee5ccf77e6fe8abe48f430a2d32822795a6d188c4c73cfd918c71ef1f3db`;
BuildKit reported config digest
`sha256:10844088bfd31cfec7e5c33da879c831eb50adc1804bfdd94f665ab85776606e`.
These are different identities, not interchangeable image pins. The image is
currently local only; registry publication and real Sandbox qualification remain
required before candidate launch.

Local isolated-container evidence: setup, TypeScript health, 179/179 visible tests
and the optional production build passed. A changed lockfile and a failing test
with a stale success report both correctly failed. This used no runtime network,
a read-only image, dropped capabilities, non-root commands and bounded resources.
That initial run reproduced the isolation settings. Subsequently, the actual
PIPEY validator at `3afe81a72e3ad69e3fc06bd0849e960539313d75` passed all seven
stages against the complete staged challenge archive. This is local source/runtime
evidence, not browser/provider proof, candidate assessment or release approval.

That PIPEY branch adds the exact `node_fixture_*` policy family alongside the
original Python fixture, with all eight version/digest pins required. Unknown,
modified or mixed policies fail before Docker starts. The PIPEY change still needs
separate review and integration; a repository policy file does not grant itself
permission. Runtime network remains denied.

The app's AI, municipal lookup and delivery integrations are outside an offline
exercise. A task must use explicit fictional/local data and avoid those external
effects; do not inject production credentials or call real providers to make an
interview check pass. Existing development behavior remains unchanged.

## Remaining acceptance order

1. Review and integrate the PIPEY compatibility changes; publish and qualify the
   pinned runtime for real Sandbox use. Local role/policy/runtime binding is done.
2. Use the recruiter UI to import the real GitHub URL. Prove failure, retry and
   reload; validation must genuinely pass before approval becomes available.
3. Approve explicitly, invite a consenting test participant and prove the actual
   computer opens the exact imported files and executable flags, including
   reload/recovery. Keep private assessment material absent.

The PIPEY compatibility branch adds explicit branch URLs without changing the
default branch. Use `https://github.com/Jorybraun/deck-permit/tree/devin/1792360593-pipey-challenge-archive`
after that support is integrated, rather than the repository root URL. Imports
must resolve this branch to one immutable commit/tree and download by that commit.
The live branch import remains unproven. Do not change the default branch, merge
or substitute a local archive and call that the real GitHub browser journey.

Repository content alone satisfies none of these integration gates. No deployment
or real-candidate release is authorized by this document.
