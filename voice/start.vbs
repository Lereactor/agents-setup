' Запуск синтеза голоса без окна (автозапуск: ярлык на этот файл в папке shell:startup).
' Лог — voice\tts.log. Остановить — Диспетчер задач → pythonw.exe и cloudflared.exe.
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
Set env = sh.Environment("Process")
' сертификаты Windows (антивирус подменяет HTTPS) — для скачивания моделей с Hugging Face
env("SSL_CERT_FILE") = here & "\ca-bundle.pem"
env("REQUESTS_CA_BUNDLE") = here & "\ca-bundle.pem"
env("PYTHONIOENCODING") = "utf-8"
sh.CurrentDirectory = here
sh.Run """" & here & "\.venv\Scripts\pythonw.exe"" """ & here & "\tts_server.py""", 0, False
