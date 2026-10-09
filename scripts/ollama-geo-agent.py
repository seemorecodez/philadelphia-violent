"""Bounded local read/edit/test task. The model cannot run arbitrary commands.

Writes only the coordinate module; tests and source inputs are read-only. Every
action and result is retained. AST validation precedes executing generated code.
"""
import ast
import json
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'Unreal/Philadelphia/Scripts/geo_frame.py'
TEST = ROOT / 'tests/test_unreal_geo.py'
OUT = ROOT / 'artifacts/local-agent/unreal-geo' / time.strftime('%Y%m%d-%H%M%S')


def validate(code):
    tree = ast.parse(code)
    for node in ast.walk(tree):
        if isinstance(node, ast.Import) and any(n.name != 'math' for n in node.names):
            raise ValueError('Only math may be imported')
        if isinstance(node, ast.ImportFrom) and node.module != 'math':
            raise ValueError('Only math may be imported')
        if isinstance(node, ast.Attribute) and node.attr.startswith('_'):
            raise ValueError('Private attribute access is forbidden')
        if isinstance(node, ast.Name) and node.id.startswith('__'):
            raise ValueError('Dunder access is forbidden')
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in {
            'exec', 'eval', 'compile', 'open', 'getattr', 'setattr', 'globals',
            'locals', 'input', 'breakpoint', '__import__', 'vars'}:
            raise ValueError('Unsafe call')
    return code


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    messages = [{'role': 'system', 'content': (
        'You are a local coding agent. Return exactly one JSON action each turn. '
        'Actions: {"action":"read"}, {"action":"write","code":"complete Python module"}, '
        '{"action":"test"}, {"action":"done"}. Only the host may execute tests. '
        'Implement geo_frame.py with ORIGIN=(-75.16,39.95), SX=111320*cos(radians(ORIGIN[1])), '
        'SY=111320. to_unreal(lon,lat,height,origin_height=0) returns tuple '
        '((lon-ORIGIN[0])*SX*100,-(lat-ORIGIN[1])*SY*100,(height-origin_height)*100). '
        'from_unreal(x,y,z,origin_height=0) inverts it. Accept only finite int/float '
        'arguments, reject bool and NaN/inf with ValueError. Reject lon/lat outside '
        '[-180,180]/[-90,90]. Return fresh tuples. Import math only. '
        'Read first, implement, then run tests and repair failures. Do not change tests. '
        'A previous candidate failed because Python bool is a subclass of int. '
        'Explicitly reject bool for every argument in both conversion functions.'
    )}, {'role': 'user', 'content': 'Complete the coordinate adapter now.'}]
    passed = False
    for turn in range(6):
        payload = {'model': 'qwen3-coder:30b', 'stream': False, 'format': 'json',
                   'keep_alive': '5m', 'options': {'num_gpu': 0, 'num_thread': 8,
                   'num_ctx': 4096, 'num_predict': 1400, 'temperature': 0}, 'messages': messages}
        started = time.time()
        req = urllib.request.Request('http://127.0.0.1:11434/api/chat',
              data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=240) as response:
            result = json.load(response)
        (OUT / f'{turn:02d}-result.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
        content = result['message']['content']
        messages.append({'role': 'assistant', 'content': content})
        try:
            action = json.loads(content)
            kind = action['action']
            if kind == 'read':
                feedback = TEST.read_text() + '\nCurrent module:\n' + (TARGET.read_text() if TARGET.exists() else '(absent)')
            elif kind == 'write':
                code = validate(action['code'])
                TARGET.parent.mkdir(parents=True, exist_ok=True)
                TARGET.write_text(code, encoding='utf-8')
                passed = False
                feedback = 'Module written. Run the tests.'
            elif kind == 'test':
                if not TARGET.exists():
                    raise ValueError('Module missing')
                validate(TARGET.read_text())
                run = subprocess.run([sys.executable, str(TEST)], cwd=ROOT,
                      capture_output=True, text=True, timeout=20)
                passed = run.returncode == 0
                feedback = run.stdout + run.stderr
            elif kind == 'done':
                if not passed:
                    raise ValueError('Tests have not passed since last edit')
                print('Local agent completed read/edit/test loop', flush=True)
                return
            else:
                raise ValueError('Unknown action')
        except Exception as error:
            kind = 'invalid'
            feedback = str(error)
        (OUT / f'{turn:02d}-feedback.txt').write_text(feedback, encoding='utf-8')
        print(json.dumps({'turn': turn, 'action': kind, 'seconds': round(time.time()-started, 2),
                          'tokens': result.get('eval_count'), 'testsPassed': passed}), flush=True)
        messages.append({'role': 'user', 'content': feedback})
    raise RuntimeError('Local agent exhausted bounded task steps; work remains unaccepted')


if __name__ == '__main__':
    main()
