; RecoilApp Custom NSIS UI Script
; Applies dark theme branding to the installer/uninstaller
; Note: Many MUI defines are already set by electron-builder's assistedInstaller.nsh
; Only define values that aren't already set to avoid conflicts.

; ============================================================
; Safe MUI overrides (guarded to avoid redefinition errors)
; ============================================================

; Welcome page text customization
!ifndef MUI_WELCOMEPAGE_TITLE
  !define MUI_WELCOMEPAGE_TITLE "Welcome to RecoilApp Setup"
!endif

!ifndef MUI_WELCOMEPAGE_TEXT
  !define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the installation of RecoilApp — a real-time messaging platform.$\r$\n$\r$\nClick Next to continue."
!endif

; Finish page text customization (MUI_FINISHPAGE_RUN is set by electron-builder)
!ifndef MUI_FINISHPAGE_TITLE
  !define MUI_FINISHPAGE_TITLE "RecoilApp Installation Complete"
!endif

!ifndef MUI_FINISHPAGE_TEXT
  !define MUI_FINISHPAGE_TEXT "RecoilApp has been installed on your computer.$\r$\n$\r$\nClick Finish to close this wizard."
!endif

; Abort warning
!ifndef MUI_ABORTWARNING
  !define MUI_ABORTWARNING
!endif

!ifndef MUI_ABORTWARNING_TEXT
  !define MUI_ABORTWARNING_TEXT "Are you sure you want to cancel RecoilApp Setup?"
!endif

; Uninstaller
!ifndef MUI_UNFINISHPAGE_NOAUTOCLOSE
  !define MUI_UNFINISHPAGE_NOAUTOCLOSE
!endif

; ============================================================
; Force-close running RecoilApp before install/update
; ============================================================
!macro customInit
  ; Kill any running RecoilApp process so the installer doesn't hang
  nsExec::ExecToLog 'taskkill /F /IM "RecoilApp.exe"'
  ; Brief delay to let the process fully exit
  Sleep 1000
!macroend

!macro customUnInit
  ; Kill any running RecoilApp process before uninstall
  nsExec::ExecToLog 'taskkill /F /IM "RecoilApp.exe"'
  Sleep 1000
!macroend
