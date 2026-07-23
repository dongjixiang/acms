Write-Host "=== CPU LOAD ==="
$cpu = Get-CimInstance Win32_Processor | Select-Object -ExpandProperty LoadPercentage
Write-Host "CPU Load: $cpu%"

Write-Host "`n=== MEMORY ==="
$os = Get-CimInstance Win32_OperatingSystem
$totalMB = [math]::Round($os.TotalVisibleMemorySize/1024, 1)
$freeMB = [math]::Round($os.FreePhysicalMemory/1024, 1)
$usedMB = $totalMB - $freeMB
$pct = [math]::Round(($usedMB/$totalMB)*100, 1)
Write-Host "Total: ${totalMB}MB | Used: ${usedMB}MB | Free: ${freeMB}MB | ${pct}%"

Write-Host "`n=== TOP 15 PROCESSES BY MEMORY ==="
Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 15 | ForEach-Object {
    $mb = [math]::Round($_.WorkingSet64 / 1MB, 1)
    Write-Host "$($_.Name) ($($_.Id)) - ${mb}MB"
}

Write-Host "`n=== DISK C: USAGE ==="
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
$totalDisk = [math]::Round($disk.Size/1GB, 1)
$freeDisk = [math]::Round($disk.FreeSpace/1GB, 1)
$usedDisk = $totalDisk - $freeDisk
$diskPct = [math]::Round(($usedDisk/$totalDisk)*100, 1)
Write-Host "C: ${totalDisk}GB total | ${usedDisk}GB used | ${freeDisk}GB free | ${diskPct}%"

Write-Host "`n=== DISK PERFORMANCE (C:) ==="
$diskPerf = Get-CimInstance Win32_PerfFormattedData_PerfDisk_LogicalDisk -Filter "Name='C:'"
Write-Host "Avg Disk Queue Length: $($diskPerf.AvgDiskQueueLength)"
Write-Host "% Disk Time: $($diskPerf.PercentDiskTime)%"
Write-Host "Disk Transfers/sec: $($diskPerf.DiskTransfersPerSec)"

Write-Host "`n=== SYSTEM UPTIME ==="
$uptime = (Get-Date) - $os.LastBootUpTime
Write-Host "$($uptime.Days) days $($uptime.Hours) hours $($uptime.Minutes) minutes"
