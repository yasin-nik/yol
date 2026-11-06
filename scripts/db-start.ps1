$bin = 'C:\Program Files\PostgreSQL\18\bin'
$root = Split-Path $PSScriptRoot -Parent
& "$bin\pg_ctl.exe" -D "$root\.local\pgdata" -o "-p 5433" -l "$root\.local\pg.log" -w start
