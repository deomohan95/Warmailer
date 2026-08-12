$ErrorActionPreference = 'Stop'

$envPath = Join-Path $PSScriptRoot '..\.env.local'
$lines = Get-Content -LiteralPath $envPath
$seen = @{}
$output = [System.Collections.Generic.List[string]]::new()

$fixedNames = @{
    'Server' = 'SUPABASE_ACCOUNT_EMAIL'
    'Projecturl' = 'NEXT_PUBLIC_SUPABASE_URL'
    'publishedkey' = 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
    'secretkey' = 'SUPABASE_SECRET_KEY'
    'anonkey' = 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
    'servicerolekey' = 'SUPABASE_SERVICE_ROLE_KEY'
    'Acces_token' = 'APIFY_API_TOKEN'
    'Imap' = 'ZOHO_IMAP_HOST'
    'smtp' = 'ZOHO_SMTP_HOST'
    'Apify_Actor_ID' = 'APIFY_PRIMARY_ACTOR_ID'
}

$managedActorKeys = @(
    'APIFY_PRIMARY_ACTOR_NAME',
    'APIFY_PRIMARY_INPUT_KEY',
    'APIFY_FALLBACK_ACTOR_ID',
    'APIFY_FALLBACK_ACTOR_NAME',
    'APIFY_FALLBACK_INPUT_KEY'
)

foreach ($line in $lines) {
    if ($line -notmatch '^\s*([^#=]+?)\s*=\s*(.*)$') {
        if ($line.Trim().Length -gt 0) { $output.Add($line) }
        continue
    }

    $oldName = $matches[1].Trim()
    $value = $matches[2]

    if ($managedActorKeys -contains $oldName) {
        continue
    }

    $seen[$oldName] = 1 + ($seen[$oldName] | ForEach-Object { $_ })

    $newName = if ($fixedNames.ContainsKey($oldName)) {
        $fixedNames[$oldName]
    } elseif ($oldName -eq 'port') {
        if ($seen[$oldName] -eq 1) { 'ZOHO_IMAP_PORT' } else { 'ZOHO_SMTP_PORT' }
    } elseif ($oldName -eq 'Zoho_mail') {
        'ZOHO_MAILBOX_{0}_EMAIL' -f $seen[$oldName]
    } elseif ($oldName -eq 'Password') {
        if ($seen[$oldName] -eq 1) { 'SUPABASE_ACCOUNT_PASSWORD' }
        else { 'ZOHO_MAILBOX_{0}_APP_PASSWORD' -f ($seen[$oldName] - 1) }
    } else {
        $oldName.ToUpperInvariant()
    }

    $output.Add("$newName=$value")
}

$output.Add('APIFY_PRIMARY_ACTOR_NAME=snipercoder/linkedin-email-finder')
$output.Add('APIFY_PRIMARY_INPUT_KEY=linkedin')
$output.Add('APIFY_FALLBACK_ACTOR_ID=q3wko0Sbx6ZAAB2xf')
$output.Add('APIFY_FALLBACK_ACTOR_NAME=x_guru/linkedin-email-Scraper-no-cookies')
$output.Add('APIFY_FALLBACK_INPUT_KEY=linkedinUrls')

$tempPath = "$envPath.tmp"
[System.IO.File]::WriteAllLines($tempPath, $output, [System.Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $tempPath -Destination $envPath -Force
