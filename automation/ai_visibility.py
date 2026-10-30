#!/usr/bin/env python3
"""
AI visibility check (owner, 2026-10-29): does an AI assistant with web search find and cite
Sophia Commons when people ask the questions our visitors ask?

For each question in automation/ai_visibility_questions.json, Claude answers with its web search
tool. We record whether sophiacommons.org appeared in the search results, whether the answer cited
or named it, and which sites were cited instead. Results are appended to
automation/ai_visibility_history.csv so the trend shows month by month.

This measures one assistant (Claude with web search). ChatGPT and Perplexity use their own search, so
treat the score as a signal, not the whole picture.

Usage: python3 automation/ai_visibility.py              (all questions, ~US$1-2 per run)
       python3 automation/ai_visibility.py --limit 3    (quick test)
Env:   ANTHROPIC_API_KEY (read from ../.env when not set); AI_VIS_MODEL to override the model.
"""
import csv
import json
import os
import re
import sys
import time
from collections import Counter
from datetime import date
from urllib.parse import urlparse

import requests

ROOT = os.path.dirname(os.path.abspath(__file__))
HISTORY = os.path.join(ROOT, 'ai_visibility_history.csv')
MODEL = os.environ.get('AI_VIS_MODEL', 'claude-sonnet-5-5')
SEARCHES_PER_QUESTION = 3
OURS = re.compile(r'sophiacommons\.org|sophia commons', re.I)


def load_env():
    path = os.path.join(ROOT, '..', '.env')
    if not os.path.exists(path):
        return
    for line in open(path):
        if '=' in line and not line.lstrip().startswith('#'):
            k, v = line.strip().split('=', 1)
            os.environ.setdefault(k, v.strip('"\''))


def ask(key, question):
    """One answer with web search. Returns (answer text, result urls, cited urls)."""
    for attempt in range(3):
        r = requests.post('https://api.anthropic.com/v1/messages', timeout=180, headers={
            'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'}, json={
            'model': MODEL, 'max_tokens': 1500,
            'tools': [{'type': 'web_search_20250305', 'name': 'web_search', 'max_uses': SEARCHES_PER_QUESTION}],
            'messages': [{'role': 'user', 'content': question}]})
        if r.status_code in (429, 529) or r.status_code >= 500:
            time.sleep(20 * (attempt + 1))
            continue
        r.raise_for_status()
        break
    else:
        r.raise_for_status()
    text, found, cited = [], [], []
    for block in r.json().get('content', []):
        if block.get('type') == 'web_search_tool_result' and isinstance(block.get('content'), list):
            found += [x.get('url', '') for x in block['content'] if x.get('type') == 'web_search_result']
        elif block.get('type') == 'text':
            text.append(block.get('text', ''))
            cited += [c.get('url', '') for c in block.get('citations') or [] if c.get('url')]
    return ''.join(text), found, cited


def domain(url):
    host = urlparse(url).netloc.lower()
    return host[4:] if host.startswith('www.') else host


def main():
    load_env()
    key = os.environ.get('ANTHROPIC_API_KEY')
    if not key:
        sys.exit('ANTHROPIC_API_KEY is not set.')
    questions = json.load(open(os.path.join(ROOT, 'ai_visibility_questions.json')))['questions']
    if '--limit' in sys.argv:
        questions = questions[:int(sys.argv[sys.argv.index('--limit') + 1])]

    today, rows, others = date.today().isoformat(), [], Counter()
    for q in questions:
        try:
            text, found, cited = ask(key, q)
        except requests.RequestException as e:
            print(f'  skip ({type(e).__name__}): {q}')
            continue
        in_results = any(OURS.search(u) for u in found)
        in_answer = any(OURS.search(u) for u in cited) or bool(OURS.search(text))
        others.update({domain(u) for u in cited if u and not OURS.search(u)})
        rows.append({'date': today, 'model': MODEL, 'question': q, 'in_search_results': int(in_results), 'in_answer': int(in_answer),
                     'cited_sites': ' '.join(sorted({domain(u) for u in cited if u}))[:500]})
        print(f"  {'CITED ' if in_answer else 'found ' if in_results else '-     '} {q}")

    if not rows:
        sys.exit('No questions could be checked.')
    new_file = not os.path.exists(HISTORY)
    with open(HISTORY, 'a', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        if new_file:
            w.writeheader()
        w.writerows(rows)

    n, cited_n, found_n = len(rows), sum(r['in_answer'] for r in rows), sum(r['in_search_results'] for r in rows)
    summary = (f'## AI visibility {today}\n\nSophia Commons was cited or named in **{cited_n} of {n}** answers '
               f'and appeared in the search results for **{found_n} of {n}** questions ({MODEL} with web search).\n\n'
               '| Question | In answer | In search results |\n|---|---|---|\n'
               + ''.join(f"| {r['question']} | {'yes' if r['in_answer'] else 'no'} | {'yes' if r['in_search_results'] else 'no'} |\n" for r in rows)
               + '\nSites cited most instead: ' + ', '.join(f'{d} ({c})' for d, c in others.most_common(10)) + '\n')
    print('\n' + summary)
    out = os.environ.get('GITHUB_STEP_SUMMARY')
    if out:
        with open(out, 'a') as f:
            f.write(summary)
    with open(os.path.join(ROOT, 'ai_visibility_latest.md'), 'w') as f:
        f.write(summary)


if __name__ == '__main__':
    main()
