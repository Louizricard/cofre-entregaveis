param(
  [ValidateSet('start', 'stop', 'status', 'test')][string]$Action = 'start',
  [switch]$TestDatabase
)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$portableRoot = Join-Path $projectRoot '.tools/postgresql'
$bin = Join-Path $portableRoot 'runtime/pgsql/bin'
if (!(Test-Path (Join-Path $bin 'pg_ctl.exe'))) {
  throw 'Binarios ausentes. Consulte docs/windows-sem-docker.md.'
}
$isTest = $TestDatabase -or $Action -eq 'test'
$label = if ($isTest) { 'test' } else { 'dev' }
$port = if ($isTest) { 5433 } else { 5432 }
$dbUser = if ($isTest) { 'cofre_test' } else { 'cofre' }
$database = $dbUser
$data = Join-Path $portableRoot ($label + '-data')
$pwfile = Join-Path $portableRoot ($label + '-password')
$log = Join-Path $portableRoot ($label + '.log')

if ($Action -eq 'stop' -or $Action -eq 'status') {
  if (!(Test-Path (Join-Path $data 'PG_VERSION'))) { Write-Output 'Cluster ainda nao inicializado.'; exit 0 }
  if ($Action -eq 'stop') { & (Join-Path $bin 'pg_ctl.exe') -D $data stop -m fast -w }
  else { & (Join-Path $bin 'pg_ctl.exe') -D $data status }
  exit $LASTEXITCODE
}

if (!(Test-Path $pwfile)) {
  if ($isTest) {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $password = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
  } else {
    $envFile = Join-Path $projectRoot '.env'
    if (!(Test-Path $envFile)) { throw 'Prepare .env a partir de .env.example.' }
    $line = Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^POSTGRES_PASSWORD=' } | Select-Object -First 1
    $password = if ($line) { $line.Substring('POSTGRES_PASSWORD='.Length) } else { '' }
    if ([string]::IsNullOrWhiteSpace($password)) { throw 'Preencha POSTGRES_PASSWORD no .env.' }
  }
  [IO.File]::WriteAllText($pwfile, $password, [Text.UTF8Encoding]::new($false))
}
$password = [IO.File]::ReadAllText($pwfile)
if (!(Test-Path (Join-Path $data 'PG_VERSION'))) {
  if (Test-Path $data) { throw 'Diretorio de dados ja existe sem PG_VERSION; inspecione antes de continuar.' }
  & (Join-Path $bin 'initdb.exe') -D $data -U $dbUser "--pwfile=$pwfile" --auth=scram-sha-256 --encoding=UTF8 --locale=C
  if ($LASTEXITCODE -ne 0) { throw 'initdb falhou. Dados existentes foram preservados.' }
}
& (Join-Path $bin 'pg_ctl.exe') -D $data status *> $null
if ($LASTEXITCODE -ne 0) {
  & (Join-Path $bin 'pg_ctl.exe') -D $data -l $log -o "-p $port -h localhost" start -w
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL nao iniciou. Consulte $log" }
}
$previousPassword = $env:PGPASSWORD
$previousTestUrl = $env:TEST_DATABASE_URL
try {
  $env:PGPASSWORD = $password
  $exists = & (Join-Path $bin 'psql.exe') -h localhost -p $port -U $dbUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$database'"
  if ($LASTEXITCODE -ne 0) { throw 'Falha de autenticacao no banco local.' }
  if ($exists -ne '1') {
    & (Join-Path $bin 'createdb.exe') -h localhost -p $port -U $dbUser $database
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar banco.' }
  }
  Write-Output "PostgreSQL disponivel em localhost:$port / $database"
  if ($Action -eq 'test') {
    $env:TEST_DATABASE_URL = "postgresql://${dbUser}:$([Uri]::EscapeDataString($password))@localhost:$port/$database"
    Push-Location $projectRoot
    try {
      & pnpm.cmd test:integration
      if ($LASTEXITCODE -ne 0) { throw 'Suite de integracao falhou; consulte a saida acima.' }
    } finally { Pop-Location }
  }
} finally {
  $env:PGPASSWORD = $previousPassword
  $env:TEST_DATABASE_URL = $previousTestUrl
}
