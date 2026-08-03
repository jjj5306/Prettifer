## Prettifer {{TAG}}

Windows 64비트용입니다. 아래 ZIP을 받아서 원하는 곳에 풀고 `prettifer.exe`를 실행하면 됩니다.
설치 과정은 없습니다. 다만 `PATH`에 Git `2.30` 이상이 있어야 동작합니다.

처음이시면 [사용 안내](https://github.com/{{RELEASE_REPOSITORY}}/blob/main/README.ko.md)를 먼저
보세요. 뭔가 잘 안 되면 거기 문제 해결 부분에 대부분 적어 뒀습니다.
([English](https://github.com/{{RELEASE_REPOSITORY}}#readme))

{{CHANGES}}

### 받은 파일이 온전한지 확인하려면

받다가 깨지지 않았는지, 중간에 다른 파일로 바뀌지 않았는지 보려면 아래 명령을 실행해 보세요.

```powershell
Get-FileHash .\prettifer-win32-x64-{{VERSION}}.zip -Algorithm SHA256
```

나온 값이 아래와 같으면 정상입니다.

```
{{SHA256}}
```

### 이 빌드는 어디서 왔나

[{{SOURCE_REPOSITORY}}@{{SHORT_SHA}}](https://github.com/{{SOURCE_REPOSITORY}}/commit/{{SHA}}) 커밋을 그대로 빌드했습니다.
