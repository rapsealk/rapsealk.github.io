---
title: "2019년 07월 04일"
date: "2019-07-04"
---

오늘은 두 가지 문제가 발생했다.

\[1\]

첫번째는 두 대의 Pixhawk에서 Arming이 걸리지 않는 문제였다.

QGroundControl로 확인한 결과, **PREFLIGHT FAIL: EKF HIGH IMU ACCEL BIAS** 라는 경고문를 발견할 수 있었다. 즉, Preflight 검사 과정에서 문제가 있었던 것이다.

Github issue([https://github.com/PX4/Firmware/issues/9241](https://github.com/PX4/Firmware/issues/9241))를 찾아본 결과 QGroundControl을 통해 COM\_ARM\_EKF\_AB 파라미터 값을 변경하면 된다고 한다. 기본값은 0.0017이라고 하는데 초기값이 0.0024로 설정되어 있었다. 이 값을 변경해도 큰 문제는 없다고 하여 기존값의 두 배인 0.0048로 수정하였더니 이 문제는 해결되었다.

\[2\]

두번째는 Raspberry Pi쪽 (정확히는 ROS) 문제였다. 세 대의 드론을 배치하고 OFFBOARD를 통해 Arming 명령을 주고 있었는데, 이전까지 잘 작동하던 리더(SYSTEM\_ID #1)가 작동하지 않았다. QGroundControl에서는 아무런 메시지를 확인할 수 없었고, 텔레메트리를 통해서는 Arming이 잘 걸렸다. 가만히 살펴보던 중 다른 두 대의 라즈베리파이 전원 불빛은 solid한 상태인데, 리더의 불빛만 깜빡이는 것을 볼 수 있었다. 따라서 연구실로 복귀하여 라즈베리파이를 검사해봤다.

모니터와 연결하여 부팅해보니 기존의 GUI가 아닌 CUI로 접속이 되었다. 혹시나 싶어 ROS log 파일들을 삭제(rm -rf ~/.ros/log)하니 다시 GUI로 돌아왔다. 아마 CUI로 접속되며 로그인 무한 대기 상태에 빠져서 Background service가 실행되지 않은 것 같다.
