---
name: Release
about: Track subgraph indexing, verification, and production promotion
title: "Release vX.Y.Z"
labels: release
assignees: ""
---

## Release Checklist

> [!IMPORTANT]
> This issue tracks the status of this release. The subgraph deployment is automated via the [release-please workflow](https://github.com/FilOzone/filecoin-pay-explorer/actions/workflows/release-please.yml). Static site changes are automatically deployed via [Vercel](https://github.com/organizations/FilOzone/settings/installations/85630569).
>
> For a breaking schema change, deploy a compatible Explorer before promoting the new subgraphs to `prod`.

### 1. Confirm the release

- [ ] The Release Please PR for `vX.Y.Z` was merged into `staging`
- [ ] The `vX.Y.Z` tag and GitHub Release were created
- [ ] The `Deploy subgraph to Goldsky (calibration)` job succeeded
- [ ] The `Deploy subgraph to Goldsky (mainnet)` job succeeded
- [ ] The `Tag as staging (calibration)` job succeeded
- [ ] The `Tag as staging (mainnet)` job succeeded

If either deploy or tag job failed, fix and rerun it or follow the [manual deployment steps](https://github.com/FilOzone/filecoin-pay-explorer/blob/main/packages/subgraph/README.md#manually-deploying-the-subgraph-to-goldsky).

### 2. Await subgraph indexing

Check indexing in the [Goldsky subgraphs dashboard](https://app.goldsky.com/project_cmb9tuo8r1xdw01ykb8uidk7h/dashboard/subgraphs).

- [ ] Received confirmation that `filecoin-pay-mainnet/X.Y.Z` has finished indexing
- [ ] Received confirmation that `filecoin-pay-calibration/X.Y.Z` has finished indexing

### 3. Verify the candidate

Set the following environment variables locally and smoke-test the Explorer:

```bash
NEXT_PUBLIC_SUBGRAPH_URL_MAINNET=https://api.goldsky.com/api/public/project_cmb9tuo8r1xdw01ykb8uidk7h/subgraphs/filecoin-pay-mainnet/X.Y.Z/gn
NEXT_PUBLIC_SUBGRAPH_URL_CALIBRATION=https://api.goldsky.com/api/public/project_cmb9tuo8r1xdw01ykb8uidk7h/subgraphs/filecoin-pay-calibration/X.Y.Z/gn
```

- [ ] Explorer loads without errors on mainnet
- [ ] Explorer loads without errors on calibration
- [ ] Changes included in this release were smoke-tested

### 4. Promote to production

> [!NOTE]
> Merging the promotion PR triggers the [tag-subgraph-prod workflow](https://github.com/FilOzone/filecoin-pay-explorer/actions/workflows/tag-subgraph-prod.yml), which applies the `prod` tag on Goldsky and switches [pay.filecoin.cloud](https://pay.filecoin.cloud) to the new version. Do this only after indexing is confirmed and staging has been verified.

- [ ] Merge the `staging → main` promotion PR
- [ ] The `tag-subgraph-prod` workflow succeeded
- [ ] `filecoin-pay-mainnet/X.Y.Z` is tagged as `prod`
- [ ] `filecoin-pay-calibration/X.Y.Z` is tagged as `prod`

### 5. Verify production

- [ ] [pay.filecoin.cloud](https://pay.filecoin.cloud) loads and functions correctly on mainnet after the tag switch
- [ ] [pay.filecoin.cloud](https://pay.filecoin.cloud) loads and functions correctly on calibration after the tag switch

### 6. Wrap up

- [ ] The release was announced in #fil-foc
- [ ] Any improvements needed in the release process were documented
- [ ] Close this issue
