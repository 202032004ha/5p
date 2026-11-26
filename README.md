# 5p · 자랭 모여

자랭할때 사람모으기 편하게 하려고

[친구 테스트 사이트](https://jaraeng-lobby-9c42.web.app/)

## 이용 방법

1. 방장이 닉네임과 한국 시간 기준 시작 시각을 입력하고 방을 만듭니다. 방장의 첫 상태는 ‘한다’입니다.
2. ‘초대 링크 복사’를 눌러 친구에게 주소를 공유합니다. 친구는 초대 링크에서 닉네임을 한 번 입력합니다.
3. ‘한다’를 누르면 위쪽 참가 확정으로 올라갑니다. ‘부족하면 한다’와 ‘안 한다’는 아래 대기실에 보입니다. 5명부터 안내가 표시되며 6명 이상이 ‘한다’를 선택해도 모두 표시됩니다.
4. 방장은 참가자 카드에서 내보내거나 ‘시작 시간 변경’에서 시간을 수정할 수 있습니다. 내보낸 사람도 같은 닉네임으로 다시 입장할 수 있습니다.
5. 한국 시간 자정이 지나면 같은 링크, 닉네임, 시작 시각을 쓰면서 참여 상태를 다시 표시할 수 있습니다. 이전 날짜의 상태는 전부 ‘안 한다’로 보여요.

한 방에는 같은 닉네임으로 하나의 카드만 만들 수 있습니다. 영문 대소문자와 앞뒤 공백은 같은 닉네임으로 취급합니다. 방과 참가자 카드는 브라우저의 Firebase 익명 식별자로 연결됩니다. 다른 브라우저나 시크릿 창은 별도 참가자로 들어가고, 기존 브라우저의 데이터를 지우면 이전 카드에 대한 수정 권한을 잃습니다. 링크를 가진 사람이 접속할 수 있으니 친구들에게만 공유하세요.

## 파일과 배포

- `public/`에 화면, 스타일, 참여 로직, 공개 Firebase 웹 설정이 있습니다.
- `database.rules.json`이 방 목록의 열람을 차단하고, 참가자는 자기 카드의 상태만 바꿀 수 있고, 방장만 다른 카드를 내보내거나 시작 시간을 바꿀 수 있습니다. 닉네임 확보와 반납은 카드 생성 및 삭제와 함께 처리합니다.
- `tests/model.test.mjs`에서 자정 초기화와 참가자 분류를 검증합니다. 로컬 에뮬레이터를 띄운 뒤 다른 터미널에서 `node tests/emulator-rules.mjs`를 실행하면 중복 입장과 방장 권한도 확인할 수 있습니다.
- 롤 닉네임 연동과 Discord·SNS 알림은 후속 범위입니다.

이 폴더에서 Node.js, Java 21, Firebase CLI로 실행합니다. 다른 컴퓨터에서는 GitHub에서 저장소를 복제하면 됩니다.

```sh
git clone https://github.com/202032004ha/5p.git
cd 5p
```

Firebase CLI가 없다면 `npm install -g firebase-tools`로 설치하세요.

```sh
node --test tests/model.test.mjs
firebase emulators:start --project demo-jaraeng --only auth,database,hosting
```

운영에 배포할 때는 아래 명령을 실행합니다.

```sh
firebase login
firebase deploy --project jaraeng-lobby-9c42 --only database,hosting
```

로컬 대기실은 `http://127.0.0.1:5510`에서 열리고, 에뮬레이터의 데이터는 운영 서비스와 분리됩니다. 운영 프로젝트에 배포하려면 Firebase 권한이 있는 계정으로 로그인해야 합니다. 화면은 Firebase Hosting으로 제공하고, 방 정보는 싱가포르 리전의 Realtime Database에 저장합니다. Firebase 웹 SDK는 공식 CDN에서 불러옵니다.

## 화면과 배경 에셋

대기실 배경은 내장 ImageGen으로 만들고 `public/lobby.webp`로 저장했습니다. 생성 프롬프트는 아래와 같습니다.

> Wide landscape, 3:2 composition. Create a cinematic environment concept art as a subdued dark game lobby background. Original mythic Korean highland at late blue hour: windswept pine ridges and layered fog behind a massive rugged dark volcanic peak; a slender broken obsidian stone gate and very faint cyan wisps on the middle RIGHT, tiny blue embers in atmosphere, subtle light fading through cloud. The left 48 percent almost entirely charcoal navy fog and unobstructed negative space for white website headings. Near-black navy and restrained blue palette with cold desaturated edges, polished AAA game matte painting, realistic geology, elegant not noisy, no neon magenta, no text, no logo, no UI, no persons, no recognizable existing game characters or assets.
