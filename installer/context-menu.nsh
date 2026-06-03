; Context Menu Registry Integration
; Registers "Share with DropLink" in Windows Explorer right-click menu for all file types.
; Called by electron-builder during install and uninstall.

!macro customInstall
  WriteRegStr HKCR "*\shell\DropLink" "" "Share with DropLink"
  WriteRegStr HKCR "*\shell\DropLink" "Icon" "$INSTDIR\DropLink.exe,0"
  WriteRegStr HKCR "*\shell\DropLink" "MultiSelectModel" "Player"
  WriteRegStr HKCR "*\shell\DropLink\command" "" '"$INSTDIR\DropLink.exe" "%1"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCR "*\shell\DropLink"
!macroend
