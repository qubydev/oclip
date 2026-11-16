!macro customCheckAppRunning
  IfSilent oclip_check_running
  Call OclipStyleSetup
  oclip_check_running:
  !insertmacro IS_POWERSHELL_AVAILABLE
  !insertmacro _CHECK_APP_RUNNING
!macroend
