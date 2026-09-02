$files = Get-ChildItem -Path "C:\Users\lucas\Dropbox\Infodesk\*\2026\Agosto\*Interativa*.doc"
if ($files.Count -gt 0) {
    $docPath = $files[0].FullName
    Write-Host "Found file: $docPath"
    $txtPath = Join-Path (Get-Location) "interativa_doc.txt"

    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $doc = $word.Documents.Open($docPath)
    $text = $doc.Content.Text
    [IO.File]::WriteAllText($txtPath, $text, [System.Text.Encoding]::UTF8)
    $doc.Close(0)
    $word.Quit()
    Write-Host "Success! Extracted text length: $($text.Length)"
} else {
    Write-Host "File not found!"
}
