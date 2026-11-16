#!/usr/bin/env python3
"""Opt-in integration check: real Chrome, synthetic loopback cookie, no provider accounts."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import selectors
import subprocess
import sys
import threading
import time

ROOT = Path(__file__).resolve().parents[1]


class Fixture(BaseHTTPRequestHandler):
    def do_GET(self):
        signed_in = 'walletfreak_fixture=synthetic' in self.headers.get('Cookie', '')
        if self.path == '/synthetic-login': signed_in = True
        body = ('<!doctype html><title>Synthetic session test</title><h1>' + ('Signed in to synthetic fixture' if signed_in else 'Signed out of synthetic fixture') + '</h1>').encode()
        self.send_response(200)
        if self.path == '/synthetic-login':
            self.send_header('Set-Cookie', 'walletfreak_fixture=synthetic; HttpOnly; SameSite=Strict; Path=/')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


class Client:
    def __init__(self):
        plugin=ROOT/'plugins/walletfreak'
        config=json.loads((plugin/'.mcp.json').read_text())['mcpServers']['walletfreak-browser']
        self.process = subprocess.Popen([config['command'], *config['args']], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)

        self.sequence = 0
        self.selector = selectors.DefaultSelector()
        self.selector.register(self.process.stdout, selectors.EVENT_READ)
        self.call('initialize', {'protocolVersion':'2024-11-05','capabilities':{},'clientInfo':{'name':'walletfreak-synthetic-test','version':'1'}})
        self.process.stdin.write(json.dumps({'jsonrpc':'2.0','method':'notifications/initialized'})+'\n')
        self.process.stdin.flush()

    def call(self, method, params):
        self.sequence += 1
        self.process.stdin.write(json.dumps({'jsonrpc':'2.0','id':self.sequence,'method':method,'params':params})+'\n')
        self.process.stdin.flush()
        deadline = time.monotonic()+45
        while time.monotonic()<deadline:
            if self.selector.select(timeout=1):
                line = self.process.stdout.readline()
                if not line:
                    raise RuntimeError('Browser MCP exited: '+self.process.stderr.read()[-500:])
                message=json.loads(line)
                if message.get('id') == self.sequence:
                    if 'error' in message: raise RuntimeError(message['error'])
                    result=message['result']
                    if result.get('isError'): raise RuntimeError(result)
                    return result
        raise TimeoutError(method)

    def tool(self, name, arguments=None):
        return self.call('tools/call', {'name':name,'arguments':arguments or {}})

    def close(self):
        try:
            self.tool('browser_close')
        except RuntimeError:
            pass  # A discovery-only connection may not own the browser.
        finally:
            self.process.terminate()
            self.process.wait(timeout=15)
            self.selector.close()


def main():
    server=ThreadingHTTPServer(('127.0.0.1',0),Fixture)
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        url=f'http://127.0.0.1:{server.server_port}'
        for establish_session in (True, False):
            client=Client()
            try:
                names={tool['name'] for tool in client.call('tools/list',{})['tools']}
                assert 'browser_navigate' in names
                assert not names.intersection({'walletfreak_signins','walletfreak_sign_in'})
                client.tool('browser_navigate',{'url':url})
                assert 'Signed out of synthetic fixture' in json.dumps(client.tool('browser_snapshot'))
                if establish_session:
                    client.tool('browser_navigate',{'url':url+'/synthetic-login'})
                    assert 'Signed in to synthetic fixture' in json.dumps(client.tool('browser_snapshot'))
                    client.tool('browser_navigate',{'url':url})
                    assert 'Signed in to synthetic fixture' in json.dumps(client.tool('browser_snapshot'))
            finally:
                client.close()
        print('Passed: direct MCP discovery, no credential bridge tools, same-session synthetic login and fresh-session isolation. No provider accounts accessed.')

    finally:
        server.shutdown();server.server_close();thread.join()


if __name__=='__main__': main()
