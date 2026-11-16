; Load the styling hook after electron-builder defines its app-running checks.
!define OCLIP_SETUP_HOOK "${__FILEDIR__}\installer-hook.nsh"
!macro customHeader
  !ifdef ONE_CLICK
    !ifndef BUILD_UNINSTALLER
      !include "${OCLIP_SETUP_HOOK}"
    !endif
  !endif
!macroend

!ifdef ONE_CLICK
  !ifndef BUILD_UNINSTALLER
    Function OclipStyleSetup
      Push $0
      Push $1
      Push $2

      System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 20, *i 1, i 4)i'
      SetCtlColors $HWNDPARENT E5E6E8 1A1B1E

      FindWindow $0 "#32770" "" $HWNDPARENT
      StrCmp $0 0 oclip_style_done
      SetCtlColors $0 E5E6E8 1A1B1E
      FindWindow $1 "#32770" "" $HWNDPARENT $0
      StrCmp $1 0 oclip_style_progress
      SetCtlColors $1 E5E6E8 1A1B1E
      StrCpy $2 0
      oclip_style_static:
        FindWindow $2 "Static" "" $1 $2
        StrCmp $2 0 oclip_style_progress
        SetCtlColors $2 E5E6E8 1A1B1E
        Goto oclip_style_static

      oclip_style_progress:
      FindWindow $2 "msctls_progress32" "" $0
      StrCmp $2 0 0 oclip_progress_found
      StrCmp $1 0 oclip_style_done
      FindWindow $2 "msctls_progress32" "" $1
      StrCmp $2 0 oclip_style_done
      oclip_progress_found:
      System::Call 'uxtheme::SetWindowTheme(p r2, w "", w "")i'
      SendMessage $2 0x2001 0 0x383533 ; PBM_SETBKCOLOR
      SendMessage $2 0x0409 0 0xF2ACB8 ; PBM_SETBARCOLOR

      oclip_style_done:
      System::Call 'user32::RedrawWindow(p $HWNDPARENT, p 0, p 0, i 0x185)i'
      Pop $2
      Pop $1
      Pop $0
    FunctionEnd
  !endif
!endif
