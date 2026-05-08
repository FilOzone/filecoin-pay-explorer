---
name: Release
about: Checklist for publishing a new release
title: "Release vX.Y.Z"
labels: release
---

## Release Checklist

### Notes
* **Goldsky Subgraphs dashboard:** https://app.goldsky.com/project_cmb9tuo8r1xdw01ykb8uidk7h/dashboard/subgraphs
* This process is for deploying new subgraph versions. Static site changes are automatically deployed as part of the [Vercel GitHub App configuration.](https://github.com/organizations/FilOzone/settings/installations/85630569)
* This release process assumes that the static site and subgraph are decoupled. Additional steps need to be taken to make a breaking subgraph change that requires a static site change.

### 1. Define the new version

```bash
NEW_RELEASE_VERSION="X.Y.Z"   # no v prefix — used for Goldsky subgraph names
CURRENT_VERSION="X.Y.Z"       # version currently tagged as prod (will be replaced)
```

- [ ] Version strings agreed and set

### 2. Create a GitHub release

```bash
gh release create "v$NEW_RELEASE_VERSION" \
  --title "v$NEW_RELEASE_VERSION" \
  --generate-notes
```

- [ ] GitHub release created with tag `vX.Y.Z`

### 3. Build and publish the subgraph

- [ ] **Automated:** confirm that the [`deploy` workflow](../../actions/workflows/deploy.yml) triggered on the new tag and completed successfully
- [ ] **Manual fallback:** if the workflow did not run, follow the [manual deployment steps](../../packages/subgraph/README.md#manually-deploying-the-subgraph-to-goldsky)

### 4. Await subgraph indexing

- [ ] Received confirmation email that `filecoin-pay-mainnet` has finished indexing
- [ ] Received confirmation email that `filecoin-pay-calibration` has finished indexing

### 5. Verify the Explorer against the new subgraph version

Set the following environment variables locally and smoke-test the Explorer:

```bash
NEXT_PUBLIC_SUBGRAPH_URL_MAINNET=https://api.goldsky.com/api/public/project_cmb9tuo8r1xdw01ykb8uidk7h/subgraphs/filecoin-pay-mainnet/$NEW_RELEASE_VERSION/gn
NEXT_PUBLIC_SUBGRAPH_URL_CALIBRATION=https://api.goldsky.com/api/public/project_cmb9tuo8r1xdw01ykb8uidk7h/subgraphs/filecoin-pay-calibration/$NEW_RELEASE_VERSION/gn
```

- [ ] Explorer loads without errors on mainnet
- [ ] Explorer loads without errors on calibration

### 6. Promote subgraphs to `prod`

> [!NOTE]                                                                                    
> Tagging as `prod` below causes [pay.filecoin.cloud](https://pay.filecoin.cloud) to switch over to the new version. Do this when you're ready to update the production site.

```bash
for network in mainnet calibration; do
  # Remove the prod tag from the previous version (if present)
  goldsky subgraph tag delete filecoin-pay-$network/$CURRENT_VERSION --tag prod 2>/dev/null || true
  # Apply prod tag to the new version
  goldsky subgraph tag create filecoin-pay-$network/$NEW_RELEASE_VERSION --tag prod
done
```

- [ ] `filecoin-pay-mainnet` tagged as `prod`
- [ ] `filecoin-pay-calibration` tagged as `prod`

### 7. Verify production

- [ ] [pay.filecoin.cloud](https://pay.filecoin.cloud) loads and functions correctly after the tag switch

### 8. Wrapup

- [ ] Announce the release in #fil-foc
- [ ] Document if there are any improvements that need to be made to the release process
- [ ] Close this issue