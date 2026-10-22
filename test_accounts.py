"""Run with py test_accounts.py; uses an isolated temporary database."""
import asyncio
import json
import sqlite3
import tempfile
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer
from threading import Thread
from urllib.request import urlopen
from urllib.error import HTTPError
import accounts
import server
import websockets

async def request(ws, action, **data):
    await ws.send(json.dumps({"action": action, **data}))
    return json.loads(await asyncio.wait_for(ws.recv(), 5))

async def test():
    async with websockets.serve(server.handler, "127.0.0.1", 0) as listener:
        uri = f"ws://127.0.0.1:{listener.sockets[0].getsockname()[1]}"
        async with websockets.connect(uri) as alice, websockets.connect(uri) as bob:
            assert (await request(alice, "list_quizzes"))["type"] == "error"
            assert (await request(alice, "register", username="alice", password="12345678"))["type"] == "account_authenticated"
            assert (await request(bob, "register", username="ALICE", password="12345678"))["type"] == "error"
            assert (await request(bob, "register", username="bob", password="87654321"))["type"] == "account_authenticated"
            quiz = {"title": "Meu quiz", "duration": 20, "questions": server.QUESTIONS}
            result = await request(alice, "save_quiz", **quiz)
            assert result["type"] == "quiz_saved"
            quiz_id = result["quiz"]["id"]
            assert len((await request(alice, "list_quizzes"))["quizzes"]) == 1
            assert (await request(bob, "list_quizzes"))["quizzes"] == []
            assert (await request(bob, "get_quiz", id=quiz_id))["type"] == "error"
            assert (await request(bob, "save_quiz", id=quiz_id, **quiz))["type"] == "error"
            quiz["title"] = "Editado depois"
            quiz["duration"] = 30
            image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="
            quiz["questions"] = [{**server.QUESTIONS[1], "image": image}]
            assert (await request(alice, "save_quiz", id=quiz_id, **quiz))["quiz"]["id"] == quiz_id
            assert (await request(alice, "save_quiz", title="", duration=20, questions=[]))["type"] == "error"
            assert (await request(alice, "save_quiz", title="Imagem inválida", duration=20, questions=[{**server.QUESTIONS[0], "image": "data:image/svg+xml;base64,PHN2Zz4="}]))["type"] == "error"
            assert (await request(alice, "logout"))["type"] == "logged_out"
            assert (await request(alice, "get_quiz", id=quiz_id))["type"] == "error"
            assert (await request(alice, "login", username="alice", password="errada"))["type"] == "error"
        # New WebSocket session and new DB connections verify durable account data.
        async with websockets.connect(uri) as alice:
            assert (await request(alice, "login", username="ALICE", password="12345678"))["type"] == "account_authenticated"
            loaded = (await request(alice, "get_quiz", id=quiz_id))["quiz"]
            assert loaded["title"] == "Editado depois" and loaded["duration"] == 30
            assert loaded["questions"] == quiz["questions"]
            assert len((await request(alice, "list_quizzes"))["quizzes"]) == 1
            lobby = await request(alice, "create", **quiz)
            assert lobby["phase"] == "lobby"
            async with websockets.connect(uri) as player:
                assert (await request(player, "join", pin=lobby["pin"], name="Jogador"))["phase"] == "lobby"
                await alice.recv()  # player joined
                question = await request(alice, "start")
                assert question["question"]["image"] == image
                assert json.loads(await player.recv())["question"]["image"] == image
    with sqlite3.connect(accounts.DB_PATH) as db:
        salt, digest = db.execute("SELECT salt,password_hash FROM users WHERE username='alice'").fetchone()
        assert digest != "12345678" and len(salt) == 32
    assert not server.account_sessions

def test_static_files():
    http = ThreadingHTTPServer(("127.0.0.1", 0), partial(server.PublicFiles, directory=str(Path(__file__).resolve().parent)))
    thread = Thread(target=http.serve_forever, daemon=True)
    thread.start()
    try:
        base = f"http://127.0.0.1:{http.server_port}"
        assert urlopen(base + "/").status == 200
        for path in ("/data/quizlive.db", "/server.py", "/accounts.py", "/data/", "/%64ata/quizlive.db"):
            try:
                urlopen(base + path)
                raise AssertionError("Private file exposed")
            except HTTPError as exc:
                assert exc.code == 404
    finally:
        http.shutdown()
        http.server_close()

if __name__ == "__main__":
    original = accounts.DB_PATH
    try:
        with tempfile.TemporaryDirectory() as directory:
            accounts.DB_PATH = Path(directory) / "test.db"
            asyncio.run(test())
            test_static_files()
        print("OK: accounts, password hashing, owner isolation, durable quiz editing, password-free hosting and private files")
    finally:
        accounts.DB_PATH = original
