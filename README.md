# CHZZK Multi Chat

여러 치지직 방송의 채팅창을 한 화면에서 모아 보는 Cloudflare Pages 앱입니다.

## 기능

- 스트리머 이름 검색 후 채널 추가
- 채널 표시 여부 선택 및 드래그 순서 변경
- 채팅창 너비, 높이 슬라이더와 확대 비율 조절
- 채팅창 모서리 드래그로 모든 채팅창 크기 실시간 통일
- 다크 모드와 라이트 모드 전환
- 좌측 설정 패널 자동 숨김
- 개별 채팅 또는 전체 채팅 새로고침
- 브라우저 `localStorage`에 채널 목록과 화면 설정 저장
- 로그인 없는 읽기 전용 실시간 채팅 (iframe 사용 안 함)
- 방송별 구독 배지, 활동 배지, 구독 이모티콘과 닉네임 색상 표시
- 연결 끊김 자동 재시도, 과거 채팅을 읽는 동안 자동 스크롤 정지

## Cloudflare Pages 배포

Pages Function은 검색, 익명 채팅 연결 정보, 닉네임 색상표 요청을 중계합니다.
채팅은 각 브라우저에서 치지직 WebSocket에 `READ` 권한으로 직접 연결해 표시합니다.
네이버 로그인 쿠키나 OAuth는 사용하지 않으며 채팅 전송 기능도 없습니다.
Cloudflare Pages에 GitHub 저장소를 연결해서 배포하세요.

Cloudflare Pages 프로젝트 설정:

| 항목 | 값 |
| --- | --- |
| Framework preset | `None` |
| Production branch | `main` |
| Build command | `exit 0` |
| Build output directory | `public` |
| Root directory | 비워 두기 |

저장소의 `wrangler.jsonc`에도 Pages 정적 출력 폴더를 `./public`으로 명시했습니다.

배포 후 `/api/search?keyword=냐미&offset=0&size=1` 주소가 JSON을 반환하면 정상입니다.

## 검색 등록

대표 주소는 `https://chzz-multi-chat.pages.dev/`입니다. 제목·설명, canonical,
Open Graph, Twitter 카드, WebSite 구조화 데이터와 `public/robots.txt`,
`public/sitemap.xml`을 같은 주소에 맞췄습니다. 채널 목록은 브라우저에만 저장되므로
사이트맵에는 공개 홈 주소 하나만 포함합니다.

Google Search Console에서 URL 접두어 속성으로 대표 주소를 추가하고 소유권을 확인한 뒤,
사이트맵에 `https://chzz-multi-chat.pages.dev/sitemap.xml`을 제출하세요.
소유권 확인용 HTML 파일 또는 메타 태그 값은 계정에서 발급받아 별도로 추가해야 합니다.
소유권 인증이나 색인 등록이 자동으로 완료되는 것은 아닙니다.
도메인을 변경하면 위 메타데이터와 robots.txt, sitemap.xml의 주소도 함께 변경하세요.

## 로컬 개발

다음 명령으로 정적 페이지와 Pages Function을 함께 실행할 수 있습니다.

```bash
npm ci
npm run dev
```

## 검증

```bash
npm test
npm run test:ui
npm run build
```

UI 테스트는 Windows의 Microsoft Edge를 사용하며 채팅 서버 응답을 모의합니다.
실제 채팅 수신 여부는 로컬 페이지에서 공개 방송 채널을 추가해 별도로 확인합니다.

## 채팅 표시

`public/chat.js`가 연결과 표시를 담당합니다. 채널별 최근 500개 메시지만 유지하며
채널 숨김/삭제 시 연결과 타이머를 해제합니다. 채팅방 ID 변경 시 새 방으로 다시 연결합니다.
메시지 본문은 HTML로 해석하지 않고, 배지·이모티콘은 HTTPS pstatic 이미지 주소만 사용합니다.

닉네임 색상은 치지직 색상표를 우선 사용하며, API 실패 시 `public/chat-colors.json`의
2026-10-02 확인 데이터로 표시합니다. 기본 닉네임 색상은 사용자 ID와 채팅방 ID로 계산합니다.
비공식 공개 채팅 프로토콜을 사용하므로 치지직 변경에 따라 유지보수가 필요할 수 있습니다.
로그인·연령 확인 등이 필요한 채널은 익명 조회가 제한될 수 있습니다.
