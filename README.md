# Capacitr Dune Jobs

This repo contains small jobs used to support the Capacitr Dune dashboard.

## Hydrex CAPACITR Snapshots

`.github/workflows/hydrex-capacitr-snapshot.yml` runs hourly and uploads one row to Dune with the latest CAPACITR Hydrex/Ichi pool metrics from `https://api.hydrex.fi/strategies`.

The uploaded table defaults to:

```sql
dune.tariq.capacitr_hydrex_pool_snapshots
```

If Dune exposes the uploaded dataset with a `dataset_` prefix in your workspace, query:

```sql
dune.tariq.dataset_capacitr_hydrex_pool_snapshots
```

The table includes:

- `snapshot_at`
- `pool_count`
- `total_tvl_usd`
- `main_pool_tvl_usd`
- `current_fees_usd`
- `projected_fees_usd`
- `fee_token_weth`
- `fee_token_capacitr`
- `main_pool_address`
- `source_url`

## GitHub Setup

Add this repository secret:

```text
DUNE_API_KEY
```

The API key needs Dune `Read/Write` scope for uploaded tables.

Optional repository variables:

```text
DUNE_UPLOAD_NAMESPACE=tariq
DUNE_UPLOAD_TABLE=capacitr_hydrex_pool_snapshots
```

## Local Dry Run

```bash
node scripts/upload-hydrex-capacitr-snapshot.mjs --dry-run
```

To upload locally:

```bash
DUNE_API_KEY=... node scripts/upload-hydrex-capacitr-snapshot.mjs
```
