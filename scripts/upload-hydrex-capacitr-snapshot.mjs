#!/usr/bin/env node

const HYDREX_STRATEGIES_URL = 'https://api.hydrex.fi/strategies';
const DUNE_API_BASE = 'https://api.dune.com/api/v1';
const DEFAULT_NAMESPACE = 'tariq';
const DEFAULT_TABLE = 'capacitr_hydrex_pool_snapshots';
const CAPACITR_TOKEN = '0x65f8152809dd1fc0d5d8a345c9008d37b95f9ba3';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');

function getEnv(name, fallback) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

function normalizeAddress(value) {
  return String(value || '').toLowerCase();
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function toCsv(rows) {
  const columns = [
    'snapshot_at',
    'pool_count',
    'total_tvl_usd',
    'main_pool_tvl_usd',
    'current_fees_usd',
    'projected_fees_usd',
    'fee_token_weth',
    'fee_token_capacitr',
    'main_pool_address',
    'source_url',
  ];
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => csvEscape(row[column])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.text();
  let parsed;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    parsed = body;
  }

  if (!response.ok) {
    throw new Error(`Request failed ${response.status} ${response.statusText}: ${body.slice(0, 500)}`);
  }

  return parsed;
}

async function fetchCapacitrSnapshot() {
  const strategies = await requestJson(HYDREX_STRATEGIES_URL);
  if (!Array.isArray(strategies)) {
    throw new Error('Hydrex strategies response was not an array');
  }

  const pools = strategies.filter((strategy) => {
    return (
      normalizeAddress(strategy.token0Address) === CAPACITR_TOKEN ||
      normalizeAddress(strategy.token1Address) === CAPACITR_TOKEN ||
      String(strategy.title || '').toLowerCase().includes('capacitr')
    );
  });

  const mainPool = pools.find((pool) => pool.liquidityType === 'integral-manual' && pool.strategist === 'Hydrex') || pools[0];
  const totalTvlUsd = pools.reduce((sum, pool) => sum + Number(pool.gauge?.tvl ?? pool.tvlUsd ?? pool.tvl ?? 0), 0);
  const currentFeesUsd = pools.reduce((sum, pool) => sum + Number(pool.gauge?.feeInUsd ?? pool.feeInUsd ?? 0), 0);
  const projectedFeesUsd = pools.reduce((sum, pool) => sum + Number(pool.gauge?.projectedFeeInUsd ?? pool.projectedFeeInUsd ?? 0), 0);

  const feeTokens = pools.flatMap((pool) => pool.gauge?.bribes?.fee ?? []);
  const feeTokenWeth = feeTokens
    .filter((token) => String(token.symbol || '').toUpperCase() === 'WETH')
    .reduce((sum, token) => sum + Number(token.amount ?? 0), 0);
  const feeTokenCapacitr = feeTokens
    .filter((token) => normalizeAddress(token.address) === CAPACITR_TOKEN || String(token.symbol || '').toUpperCase() === 'CAPACITR')
    .reduce((sum, token) => sum + Number(token.amount ?? 0), 0);

  return {
    snapshot_at: new Date().toISOString(),
    pool_count: pools.length,
    total_tvl_usd: totalTvlUsd.toFixed(2),
    main_pool_tvl_usd: Number(mainPool?.gauge?.tvl ?? mainPool?.tvlUsd ?? mainPool?.tvl ?? 0).toFixed(2),
    current_fees_usd: currentFeesUsd.toFixed(2),
    projected_fees_usd: projectedFeesUsd.toFixed(2),
    fee_token_weth: feeTokenWeth.toFixed(8),
    fee_token_capacitr: feeTokenCapacitr.toFixed(2),
    main_pool_address: mainPool?.address ?? '',
    source_url: HYDREX_STRATEGIES_URL,
  };
}

async function ensureDuneTable({ apiKey, namespace, tableName }) {
  const schema = [
    { name: 'snapshot_at', type: 'timestamp', nullable: false },
    { name: 'pool_count', type: 'integer', nullable: false },
    { name: 'total_tvl_usd', type: 'double', nullable: false },
    { name: 'main_pool_tvl_usd', type: 'double', nullable: false },
    { name: 'current_fees_usd', type: 'double', nullable: false },
    { name: 'projected_fees_usd', type: 'double', nullable: false },
    { name: 'fee_token_weth', type: 'double', nullable: false },
    { name: 'fee_token_capacitr', type: 'double', nullable: false },
    { name: 'main_pool_address', type: 'varchar', nullable: false },
    { name: 'source_url', type: 'varchar', nullable: false },
  ];

  return requestJson(`${DUNE_API_BASE}/uploads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-DUNE-API-KEY': apiKey,
    },
    body: JSON.stringify({
      namespace,
      table_name: tableName,
      description: 'Scheduled CAPACITR Hydrex/Ichi pool snapshots from https://api.hydrex.fi/strategies',
      is_private: false,
      schema,
    }),
  });
}

async function insertDuneRows({ apiKey, namespace, tableName, csv }) {
  return requestJson(`${DUNE_API_BASE}/uploads/${encodeURIComponent(namespace)}/${encodeURIComponent(tableName)}/insert`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/csv',
      'X-DUNE-API-KEY': apiKey,
    },
    body: csv,
  });
}

async function main() {
  const namespace = getEnv('DUNE_UPLOAD_NAMESPACE', DEFAULT_NAMESPACE);
  const tableName = getEnv('DUNE_UPLOAD_TABLE', DEFAULT_TABLE);
  const snapshot = await fetchCapacitrSnapshot();
  const csv = toCsv([snapshot]);

  if (dryRun) {
    console.log(csv);
    return;
  }

  const apiKey = getEnv('DUNE_API_KEY');
  if (!apiKey) {
    throw new Error('DUNE_API_KEY is required unless --dry-run is used');
  }

  const table = await ensureDuneTable({ apiKey, namespace, tableName });
  const insert = await insertDuneRows({ apiKey, namespace, tableName, csv });
  console.log(JSON.stringify({ table, insert, snapshot }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
