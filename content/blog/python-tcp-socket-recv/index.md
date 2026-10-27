---
title: "[Python] TCP 소켓 확장하기 (recv)"
date: "2019-09-03"
---

연구실의 기술이전 프로젝트를 진행하던 중, 요구조건이 추가됨에 따라 네트워크쪽 기능을 구현하게 되었다.

요구되는 기능은 드론에 장착된 라즈베리파이에서 원격 클라우드 서버에 접속하여 데이터를 교환하는 것으로, 매우 기본적인 것이었다. (사실 그렇게 생각했지만 구현하는 과정에서 많은 우여곡절이 있었다.)

그 우여곡절들을 겪으며 소켓에 대해 배운 내용들을 차례대로 정리해보려고 한다.

\[1\] TCP: 동적인 크기의 패킷을 온전하게 전달하기. (struct)

\[2\] recv와 send 들여다보기

우선, 소켓 서버 구현에 사용할 언어는 연구실에서 제일 자주 사용하는 Python3으로 선택하였다. (클라이언트는 C로 구현되었다.) 그리고 코드 작성을 시작하였다. 아래는 간략하게 적은 내용이다.

```python
import socket

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM) # TCP 소켓

""" 서버/클라이언트 설정 """

conn, addr = sock.accept()

message = conn.recv(1024)
```

위와 형태로 작성한 후, 로컬 환경에서 테스트를 마치고 클라우드에 올린 후 실행하였다.

...

...

(이는 후에 Consumer 패턴을 추가하여 개선하였다.)

소켓과 관련된 유틸리티 코드는 아래의 저장소에 모아두려고 한다.

[https://github.com/rapsealk/socketx](https://github.com/rapsealk/socketx)
