# Portable backup: owner passphrase step — 12 October 2026

## Status

The owner will keep a copy on USB/another PC. The conversion helper is ready and synthetic tests passed on PowerShell 7 and built-in Windows PowerShell 5. **No real portable archive has been created yet, no copy has left this PC, and independent-device recovery is not verified.** The remaining encryption prompt is owner-controlled; no passphrase should be sent to chat.

The helper converts the existing verified DPAPI SQL snapshot captured **11 October 2026 at 04:44 UTC / 10:44 Bangladesh time**. It does not create a fresh export or contact Cloudflare. It retains the original DPAPI backup.

## Run locally

Open your own PowerShell and run:

```powershell
& 'C:\Users\adnan\Downloads\druto final xx\audit\build\druto-release-review\scripts\prepare-portable-backup.ps1'
```

1. Enter a long unique passphrase in 7-Zip's hidden prompt. Confirm it when asked. Do not put it in the command, chat, environment variables or a screenshot. Keep it separately from the backup copy. There is no password reset for this archive.
2. Enter the same passphrase again when extraction is requested. The helper restores SQL in a private temporary directory and checks its checksum before publishing the encrypted archive.
3. Wait for `PASS: encrypted archive restored and SQL checksum matched.` The printed path ends in `.7z`; its adjacent `.7z.sha256` is the archive checksum.
4. Copy these two files from `C:\Users\adnan\Downloads\druto final xx\audit\backups` to your USB/other PC. Do not copy any temporary plaintext directory or replace the original DPAPI backup.
5. On the other device, compare the copied file's SHA-256 against the recorded checksum, then open it with 7-Zip and test/decrypt it into a private local recovery folder. Verify extracted `source.sql` against `plaintextSha256` in extracted `snapshot.json`. Do not import SQL into the live D1 database or start a payment worker from it. Remove extracted plaintext when finished. Tell the assistant only whether the copy/recovery succeeded or which non-secret error appeared.

If Windows blocks script execution, stop and report the error; do not weaken global execution policy. Defaults rely on this repository/workspace layout; `-SourceDirectory`, `-OutputDirectory` and `-SevenZip` can override paths without exposing passwords.

## Mechanism and evidence

- Uses installed `C:\Program Files\7-Zip\7z.exe` (observed 24.08); no new provider, global installation or custom cryptography. The official [7z format documentation](https://www.7-zip.org/7z.html) describes AES-256 encryption. `-mhe=on` encrypts filenames; password is entered at the native prompt in the real conversion path.
- Checks source ciphertext SHA-256, decrypts through the current Windows profile, and checks original SQL SHA-256 before archiving.
- Creates a temporary directory with inheritance disabled and access granted to the current user before plaintext is written. Local administrators/malware running as the user are outside this protection.
- Roundtrips the archive and verifies SQL and snapshot metadata before publishing a unique archive filename and external checksum. The original backup is not moved or overwritten.
- Finally removes its explicitly bounded temporary directory and clears accessible plaintext byte arrays. This is ordinary cleanup, not forensic secure erasure; forced process termination/power loss can leave staging plaintext requiring owner cleanup. Managed/runtime/native-process memory cannot be guaranteed erased.
- Synthetic tests: DPAPI source conversion and archive/extraction checksum match on both PowerShell versions; wrong password rejects extraction/test and filename listing; corrupt source checksum exits before archiving, leaving no staging directory or published archive. Synthetic passwords are public fixtures only. Initial compatibility failures in directory-ACL creation/default-path handling/native stderr were corrected before these passes.
- The new tool has not run on the real DPAPI snapshot yet. The older verified SQL restore drill remains separate evidence. Archive integrity tests and adjacent checksums do not establish protection against a malicious actor replacing both archive and checksum; retain a trusted independent checksum if that threat is in scope.

## Still needed

Worker secrets, especially the webhook encryption key, are **not included** in the SQL snapshot. Existing encrypted webhook values cannot be recovered from SQL alone without the matching key. The database archive, secret recovery, fresh-export cadence and full hosted restore remain separate work. Do not export keys to chat or silently add them to this archive. Real-money readiness and legacy Vercel/TiDB retirement are unaffected.
