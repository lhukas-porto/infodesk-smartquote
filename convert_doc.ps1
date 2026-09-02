$docPath = (Get-Item "CNC 280826.doc").FullName
$htmlPath = (Join-Path (Get-Location) "extracted_doc.htm").ToString()
$pdfPath = (Join-Path (Get-Location) "extracted_doc.pdf").ToString()

try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $doc = $word.Documents.Open($docPath)
    Write-Host "Opened doc successfully!"
    
    # Save as HTML
    $doc.SaveAs2($htmlPath, 10)
    Write-Host "Saved HTML successfully to $htmlPath"
    
    # Save as PDF
    $doc.SaveAs2($pdfPath, 17)
    Write-Host "Saved PDF successfully to $pdfPath"
    
    $doc.Close(0)
    $word.Quit()
    Write-Host "Done conversion!"
} catch {
    Write-Host "Error: " $_.Exception.ToString()
}
