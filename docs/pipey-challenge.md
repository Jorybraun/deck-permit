# Using deck-permit as a PIPEY challenge

Status: **archive preparation only; not a valid or approved challenge yet.**
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

Before this repository can be approved, add the existing format's root files:

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

## Runtime work still required

This is a React/TypeScript/Vite application, not the Python-only fictional starter.
Its existing commands are `npm ci`, `npm run lint`, `npm test`, `npm run build`
and `npm run dev`. Its dependency lockfile must remain authoritative.

PIPEY's current local validator runs with no network, a read-only image,
restricted writable paths and bounded command timeouts. Running `npm ci` inside
that validator is not an offline setup solution. The retained desktop Dockerfile
does not provision this application's locked dependencies.

Before adding a runnable manifest, prepare and verify an approved, digest-pinned
desktop runtime containing the required Node toolchain and locked dependency
artifacts, then prove dependency resolution and Vite's writable cache/output paths
under the actual validator limits. Do not quietly enable network access, weaken
the validator or substitute static source inspection for build/test execution.
If supporting the app requires a runtime-policy change, implement and review that
separately in PIPEY rather than claiming this repository's metadata grants it.

The app's AI, municipal lookup and delivery integrations are outside an offline
exercise. A task must use explicit fictional/local data and avoid those external
effects; do not inject production credentials or call real providers to make an
interview check pass. Existing development behavior remains unchanged.

## Remaining acceptance order

1. Choose the published role and a relevant bounded task; author the public
   instructions and rubric from that role, without inventing requirements.
2. Prepare the offline Node runtime and command reports; bind its verified image
   and the real public role/policy pins in the existing manifest contract.
3. Use the recruiter UI to import the real GitHub URL. Prove failure, retry and
   reload; validation must genuinely pass before approval becomes available.
4. Approve explicitly, invite a consenting test candidate and prove the actual
   computer opens the exact imported files and executable flags, including
   reload/recovery. Keep private assessment material absent.

Archive preparation alone satisfies none of the last three gates. No deployment
or real-candidate release is authorized by this document.
