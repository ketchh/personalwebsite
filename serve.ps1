$Distro = "Debian"
$Project = "/home/falx/code/website"
$Port = 5173

Write-Host "Starting WSL static server..."
Write-Host "Project: $Project"
Write-Host "URL: http://localhost:$Port"

Start-Process -FilePath "wsl.exe" -ArgumentList @("-d", $Distro, "--cd", $Project, "./serve.sh", "$Port") -WindowStyle Minimized
Start-Sleep -Seconds 1
Start-Process "http://localhost:$Port"
