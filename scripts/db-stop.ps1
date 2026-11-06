$bin = 'C:\Program Files\PostgreSQL\18\bin'
$root = Split-Path $PSScriptRoot -Parent
& "$bin\pg_ctl.exe" -D "$root\.local\pgdata" -m fast stop
