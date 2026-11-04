"""_source/dashboard.html(Claude 대시보드 원본)을 배포용 index.html로 만듭니다.

실행: python _source/build.py   (이 폴더의 상위 폴더에서)
- 데이터는 data/*.csv를 그대로 읽습니다. 숫자를 고치려면 CSV를 고치세요.
- 화면을 고치려면 _source/dashboard.html을 고친 뒤 다시 실행하세요.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TITLE = '중소기업 HRD 교육 현황'

# 독립 사이트에서는 의미가 없는 Claude 전용 문구를 바꿉니다.
REPLACE = []

body = (ROOT / "_source" / "dashboard.html").read_text(encoding="utf-8")
body = body.replace('<meta name="dash-one-writer">\n', "", 1)
for old, new in REPLACE:
    assert old in body, old[:60]
    body = body.replace(old, new)

sources = {p.stem: f"data/{p.name}" for p in sorted((ROOT / "data").glob("*.csv"))}

html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{TITLE}</title>
<meta name="description" content='중소 무역회사 HRD 담당자를 위한 교육 현황 대시보드: 법정교육 마감, 환급, 교육 사각지대, 직무 역량.'>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600&display=swap">
<link rel="stylesheet" href="assets/base.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>
<script>window.DASH_SOURCES = {json.dumps(sources)};</script>
<script src="assets/dash-lite.js"></script>
</head>
<body>
<header class="site-bar"><span>HRD 대시보드 포트폴리오 · 모든 수치는 가상 데이터입니다</span></header>
<div id="dash-root">
{body}
</div>
</body>
</html>
"""
(ROOT / "index.html").write_text(html, encoding="utf-8")
print("index.html 생성:", len(sources), "개 데이터")
