$ErrorActionPreference = 'Continue'
$file = 'C:\Users\swede\acms\server\public\office\5fc87f3b-93bb-481b-87d8-f6ddf80cbe5e.xlsx'
$excel = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = 0
  $wbk = $excel.Workbooks.Open($file)
  $ws = $wbk.Sheets.Item(1)
  $b2 = $ws.Cells.Item(2, 2).Text
  $e2 = $ws.Cells.Item(2, 5).Text
  $e7 = $ws.Cells.Item(7, 5).Text
  $a1 = $ws.Cells.Item(1, 1).Text
  Write-Output ("OPEN_OK sheet=" + $ws.Name + " A1=" + $a1 + " B2=" + $b2 + " E2=" + $e2 + " E7=" + $e7)
  $wbk.Close($false)
} catch {
  Write-Output ("OPEN_FAIL " + $_.Exception.Message)
} finally {
  if ($excel) { $excel.Quit() }
  if ($excel) { [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null }
}
