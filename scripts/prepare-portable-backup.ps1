# Converts the already-verified 11 October snapshot; does not contact Cloudflare.
# Run in your own interactive PowerShell. Real passwords are entered only into
# 7-Zip's hidden prompt, never as this script's arguments or environment variables.
[CmdletBinding()]
param(
  [string]$SourceDirectory,
  [string]$OutputDirectory,
  [string]$SevenZip = 'C:\Program Files\7-Zip\7z.exe',
  [switch]$SelfTest
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
if (-not $SourceDirectory) { $SourceDirectory = Join-Path $PSScriptRoot '..\..\..\backups' }
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $PSScriptRoot '..\..\..\backups' }

function Get-ByteDigest([byte[]]$Bytes) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash($Bytes))).Replace('-', '') }
  finally { $sha.Dispose() }
}
function New-PrivateDirectory([string]$Path) {
  # ACL is applied at creation, before any plaintext is written.
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl = New-Object Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true, $false)
  $acl.SetOwner($sid)
  $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
  $acl.AddAccessRule($rule)
  $directory = New-Object IO.DirectoryInfo($Path)
  if ($PSVersionTable.PSEdition -eq 'Desktop') { $directory.Create($acl) }
  else { [IO.FileSystemAclExtensions]::Create($directory, $acl) }
}
function Remove-PrivateDirectory([string]$Path, [string]$Parent) {
  $full = [IO.Path]::GetFullPath($Path)
  $root = [IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
  if (-not $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or
      -not ([IO.Path]::GetFileName($full)).StartsWith('.druto-portable-')) { throw 'Refusing unsafe cleanup path' }
  if (Test-Path -LiteralPath $full) { Remove-Item -LiteralPath $full -Recurse -Force }
}

if (-not (Test-Path -LiteralPath $SevenZip -PathType Leaf)) { throw '7-Zip is required. Specify its installed 7z.exe path.' }
$destination = [IO.Path]::GetFullPath($OutputDirectory)
if (-not (Test-Path -LiteralPath $destination -PathType Container)) { throw 'OutputDirectory must already exist.' }
$working = Join-Path $destination ('.druto-portable-' + [Guid]::NewGuid().ToString('N'))
New-PrivateDirectory $working
$plain = $null
$decoded = $null
$archive = Join-Path $working 'druto-snapshot.7z'
$completed = $false
try {
  if ($SelfTest) {
    # Public synthetic fixture, not a user password or real database.
    $plain = [Text.Encoding]::UTF8.GetBytes("CREATE TABLE fixture(id INTEGER); INSERT INTO fixture VALUES(1);`n")
    $encrypted = [Security.Cryptography.ProtectedData]::Protect($plain, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    $manifest = [pscustomobject]@{ capturedAt='synthetic-self-test'; sourceDatabase='synthetic'; plaintextSha256=(Get-ByteDigest $plain); encryptedSha256=(Get-ByteDigest $encrypted) }
    $passwordOption = '-pPUBLIC-SYNTHETIC-FIXTURE-ONLY'
  } else {
    $source = [IO.Path]::GetFullPath($SourceDirectory)
    $manifest = Get-Content -Raw -LiteralPath (Join-Path $source 'd1-backup-manifest-2026-10-11.json') | ConvertFrom-Json
    $encrypted = [IO.File]::ReadAllBytes((Join-Path $source 'druto-d1-2026-10-11.sql.dpapi'))
    $passwordOption = '-p'
  }
  if ((Get-ByteDigest $encrypted) -ne $manifest.encryptedSha256) { throw 'Source backup checksum mismatch' }
  $plain = [Security.Cryptography.ProtectedData]::Unprotect($encrypted, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  if ((Get-ByteDigest $plain) -ne $manifest.plaintextSha256) { throw 'Decrypted snapshot checksum mismatch' }
  [IO.File]::WriteAllBytes((Join-Path $working 'source.sql'), $plain)
  [IO.File]::WriteAllText((Join-Path $working 'snapshot.json'), ($manifest | ConvertTo-Json))
  Write-Host ('Snapshot timestamp: ' + $manifest.capturedAt)
  if (-not $SelfTest) {
    Write-Host 'Choose a long unique passphrase and store it separately from the USB backup.'
    Write-Host 'Enter it at the hidden 7-Zip prompt; do not paste it into chat or the command itself.'
  }
  Push-Location $working
  try {
    & $SevenZip a -t7z -mhe=on -mx=1 $passwordOption $archive 'source.sql' 'snapshot.json'
    if ($LASTEXITCODE -ne 0) { throw 'Archive creation failed; no portable backup was published' }
    $recovered = Join-Path $working 'recovered'
    New-PrivateDirectory $recovered
    if (-not $SelfTest) { Write-Host 'Enter the same passphrase again to verify recovery before publishing the archive.' }
    & $SevenZip x $passwordOption '-y' ('-o' + $recovered) $archive
    if ($LASTEXITCODE -ne 0) { throw 'Recovery verification failed; no portable backup was published' }
  } finally { Pop-Location }
  $decoded = [IO.File]::ReadAllBytes((Join-Path $recovered 'source.sql'))
  if ((Get-ByteDigest $decoded) -ne $manifest.plaintextSha256) { throw 'Recovered SQL checksum mismatch' }
  $restoredManifest = Get-Content -Raw -LiteralPath (Join-Path $recovered 'snapshot.json') | ConvertFrom-Json
  if ($restoredManifest.plaintextSha256 -ne $manifest.plaintextSha256 -or
      $restoredManifest.capturedAt -ne $manifest.capturedAt) { throw 'Recovered metadata mismatch' }
  if ($SelfTest) {
    # Windows PowerShell 5 turns native stderr into error records. These two
    # failures are intentional; validate exit codes without aborting the test.
    $priorPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = 'Continue'
      & $SevenZip l '-pDELIBERATELY-WRONG-PUBLIC-PASSWORD' $archive *> $null
      $listExit = $LASTEXITCODE
      & $SevenZip t '-pDELIBERATELY-WRONG-PUBLIC-PASSWORD' $archive *> $null
      $testExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $priorPreference }
    if ($listExit -eq 0 -or $testExit -eq 0) { throw 'Wrong password unexpectedly accepted' }
    Write-Host 'SELF-TEST PASS: DPAPI input, encrypted headers, archive roundtrip and wrong-password rejection.'
  } else {
    $name = 'druto-snapshot-2026-10-11-portable-' + [Guid]::NewGuid().ToString('N') + '.7z'
    $final = Join-Path $destination $name
    if (Test-Path -LiteralPath $final) { throw 'Refusing to overwrite an existing backup' }
    $digest = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
    Move-Item -LiteralPath $archive -Destination $final
    [IO.File]::WriteAllText(($final + '.sha256'), ($digest + '  ' + $name + "`r`n"))
    Write-Host 'PASS: encrypted archive restored and SQL checksum matched.'
    Write-Host ('Copy archive and checksum to your USB/other PC: ' + $final)
    Write-Host 'This is the 11 October snapshot, not a fresh export. Worker secrets are not included.'
  }
  $completed = $true
} catch {
  # Avoid emitting SQL, password or raw child-process error contents.
  Write-Error 'Portable backup was not completed. Inspect local prompts/checksum prerequisites; do not share secrets.' -ErrorAction Continue
} finally {
  if ($plain) { [Array]::Clear($plain, 0, $plain.Length) }
  if ($decoded) { [Array]::Clear($decoded, 0, $decoded.Length) }
  Remove-PrivateDirectory $working $destination
}
if (-not $completed) { exit 1 }
