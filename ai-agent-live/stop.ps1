Write-Output "=== Stopping AI Agent Live Visualization ==="

# Убиваем cmd.exe-окна, запущенные start_windows.bat, ЦЕЛИКОМ деревом
# (taskkill /T) — это критично для backend: "uvicorn --reload" держит
# процесс-супервизор, который просто поднимает нового воркера, если убить
# только воркера (а не всё дерево от cmd.exe), поэтому убивать нужно
# именно корень дерева, а не просто "что слушает порт сейчас".
$matches = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'cmd.exe' -and ($_.CommandLine -like '*uvicorn*' -or $_.CommandLine -like '*npm run dev*')
}
foreach ($proc in $matches) {
    taskkill /PID $proc.ProcessId /T /F 2>$null | Out-Null
    Write-Output "Stopped: $($proc.CommandLine)"
}

# Фолбэк на случай, если серверы были запущены не через start_windows.bat.
foreach ($port in 8000, 5173) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object {
            taskkill /PID $_ /T /F 2>$null | Out-Null
            Write-Output "Stopped process tree on port $port"
        }
}

Write-Output "Done. Backend (:8000) and frontend (:5173) stopped if they were running."
