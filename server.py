import asyncio
import base64
import binascii
import json
import mimetypes
import random
import time
from http.server import SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote, urlsplit
import websockets
import accounts

QUESTIONS = [
    {"text": "Qual é o maior planeta do Sistema Solar?", "options": ["Terra", "Marte", "Júpiter", "Saturno"], "correct": 2},
    {"text": "Quantos lados tem um hexágono?", "options": ["Cinco", "Seis", "Sete", "Oito"], "correct": 1},
    {"text": "Qual linguagem roda no navegador?", "options": ["Python", "Java", "C++", "JavaScript"], "correct": 3},
    {"text": "Em qual continente fica o Brasil?", "options": ["América do Sul", "Europa", "África", "Ásia"], "correct": 0},
    {"text": "O que um WebSocket permite?", "options": ["Editar imagens", "Comunicação em tempo real", "Carregar a bateria", "Imprimir"], "correct": 1},
]
rooms, sessions = {}, {}
account_sessions = {}

def validate_image(image, limit=300000):
    if not isinstance(image, str) or len(image) > limit:
        raise ValueError("Imagem inválida ou muito grande.")
    if image:
        try:
            header, encoded = image.split(",", 1)
            content = base64.b64decode(encoded, validate=True)
            valid = (header == "data:image/jpeg;base64" and content.startswith(b"\xff\xd8\xff")) or (header == "data:image/png;base64" and content.startswith(b"\x89PNG\r\n\x1a\n")) or (header == "data:image/webp;base64" and content.startswith(b"RIFF") and content[8:12] == b"WEBP")
            if not valid:
                raise ValueError()
        except (ValueError, binascii.Error):
            raise ValueError("Use uma imagem JPG, PNG ou WebP válida.") from None

def validate_quiz(questions, duration):
    if not isinstance(questions, list) or not 1 <= len(questions) <= 30:
        raise ValueError("Use de 1 a 30 perguntas.")
    for q in questions:
        if not isinstance(q, dict) or not isinstance(q.get("text"), str) or not 1 <= len(q["text"].strip()) <= 300 or not isinstance(q.get("options"), list) or len(q["options"]) != 4 or any(not isinstance(o, str) or not 1 <= len(o.strip()) <= 100 for o in q["options"]) or type(q.get("correct")) is not int or q["correct"] not in range(4):
            raise ValueError("Preencha a pergunta, quatro alternativas e a resposta correta.")
        validate_image(q.get("image", ""))
    if type(duration) is not int or duration not in (10, 20, 30, 60):
        raise ValueError("Tempo inválido.")

PUBLIC_PATHS = {"/", "/index.html", "/app.js", "/audio.js", "/secret.js", "/secret-music.mp3", "/secret-video.mp4", "/style.css", "/ICS.ico"} | {
    "/" + name for name in ("Tempo esgotado.mp3", "Tempo acabando.mp3", "Ranking caso alguém mude de posição.mp3", "Pódio final.mp3", "Próxima seção.mp3")
}

class PublicFiles(SimpleHTTPRequestHandler):
    def do_GET(self):
        if unquote(urlsplit(self.path).path) not in PUBLIC_PATHS:
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        if unquote(urlsplit(self.path).path) not in PUBLIC_PATHS:
            self.send_error(404)
            return
        super().do_HEAD()

def nickname(value, room, current=None):
    if not isinstance(value, str):
        raise ValueError("Digite um apelido válido.")
    name = " ".join(value.split())
    if not 2 <= len(name) <= 24:
        raise ValueError("Seu apelido deve ter de 2 a 24 caracteres.")
    if any(ord(c) < 32 or ord(c) == 127 for c in name):
        raise ValueError("Seu apelido contém caracteres inválidos.")
    if any(ws != current and p["name"].casefold() == name.casefold() for ws, p in room["players"].items()):
        raise ValueError("Esse apelido já está em uso. Escolha outro.")
    return name

async def send(ws, data):
    try:
        await ws.send(json.dumps(data, ensure_ascii=False))
    except websockets.exceptions.ConnectionClosed:
        pass

async def broadcast(room):
    players = sorted([{"name": p["name"], "score": p["score"], "online": p["online"], "avatar": p.get("avatar", "")} for p in room["players"].values()], key=lambda p: -p["score"])
    data = {"type": "state", "pin": room["pin"], "phase": room["phase"], "players": players, "index": room["index"], "total": len(room["questions"]), "answers": len(room["answers"]), "duration": room["duration"], "remaining": max(0, room["deadline"] - time.monotonic())}
    if room["index"] >= 0:
        q = room["questions"][room["index"]]
        data["question"] = {"text": q["text"], "options": q["options"], "image": q.get("image", "")}
        if room["phase"] in ("results", "finished"):
            data["correct"] = q["correct"]
    await send(room["host"], {**data, "role": "host"})
    for ws, p in list(room["players"].items()):
        if p["online"]:
            await send(ws, {**data, "role": "player", "name": p["name"], "score": p["score"], "selected": room["answers"].get(ws), "avatar": p.get("avatar", "")})

async def timer(room, index):
    await asyncio.sleep(room["duration"])
    if rooms.get(room["pin"]) is room and room["phase"] == "question" and room["index"] == index:
        room["phase"] = "results"
        await broadcast(room)

async def advance(room):
    room["answers"] = {}
    if room["index"] + 1 == len(room["questions"]):
        room["phase"] = "finished"
    else:
        room["index"] += 1
        room["phase"] = "question"
        room["deadline"] = time.monotonic() + room["duration"]
        asyncio.create_task(timer(room, room["index"]))
    await broadcast(room)

async def handler(ws):
    try:
        async for raw in ws:
            try:
                data = json.loads(raw)
                if not isinstance(data, dict):
                    raise ValueError("Mensagem inválida.")
                action = data.get("action")
                if action in ("create", "join") and ws in sessions:
                    raise ValueError("Recarregue para entrar em outra sala.")
                if action in ("register", "login"):
                    if ws in sessions:
                        raise ValueError("Termine a partida antes de entrar em uma conta.")
                    user = await asyncio.to_thread(accounts.authenticate, action, data.get("username"), data.get("password"))
                    account_sessions[ws] = user
                    await send(ws, {"type": "account_authenticated", "user": user})
                elif action == "logout":
                    if ws in sessions:
                        raise ValueError("Termine a partida antes de sair da conta.")
                    account_sessions.pop(ws, None)
                    await send(ws, {"type": "logged_out"})
                elif action in ("list_quizzes", "get_quiz", "save_quiz"):
                    user = account_sessions.get(ws)
                    if not user:
                        raise ValueError("Entre na sua conta para acessar seus quizzes.")
                    if action == "list_quizzes":
                        quizzes = await asyncio.to_thread(accounts.list_quizzes, user["id"])
                        await send(ws, {"type": "quiz_list", "quizzes": quizzes})
                    elif action == "get_quiz":
                        if type(data.get("id")) is not int:
                            raise ValueError("Quiz inválido.")
                        quiz = await asyncio.to_thread(accounts.get_quiz, user["id"], data["id"])
                        await send(ws, {"type": "quiz_loaded", "quiz": quiz})
                    else:
                        questions, duration = data.get("questions"), data.get("duration")
                        validate_quiz(questions, duration)
                        quiz = await asyncio.to_thread(accounts.save_quiz, user["id"], data.get("id"), data.get("title"), duration, questions)
                        await send(ws, {"type": "quiz_saved", "quiz": quiz})
                elif action == "create":
                    questions = data.get("questions", QUESTIONS)
                    duration = data.get("duration", 20)
                    validate_quiz(questions, duration)
                    pin = str(random.randint(100000, 999999))
                    while pin in rooms:
                        pin = str(random.randint(100000, 999999))
                    room = {"pin": pin, "host": ws, "players": {}, "questions": questions, "phase": "lobby", "index": -1, "answers": {}, "duration": duration, "deadline": 0}
                    rooms[pin] = room
                    sessions[ws] = room
                    await broadcast(room)
                elif action == "join":
                    room = rooms.get(str(data.get("pin", "")))
                    if not room or room["phase"] != "lobby":
                        raise ValueError("Sala indisponível ou jogo já iniciado.")
                    name = nickname(data.get("name", ""), room)
                    avatar = data.get("avatar", "")
                    validate_image(avatar, 40000)
                    room["players"][ws] = {"name": name, "score": 0, "online": True, "avatar": avatar}
                    sessions[ws] = room
                    await broadcast(room)
                else:
                    room = sessions.get(ws)
                    if not room:
                        raise ValueError("Entre em uma sala.")
                    if action == "set_avatar":
                        if ws not in room["players"] or room["phase"] != "lobby":
                            raise ValueError("Troque sua foto antes de come?ar a partida.")
                        avatar = data.get("avatar", "")
                        validate_image(avatar, 40000)
                        room["players"][ws]["avatar"] = avatar
                        await broadcast(room)
                    elif action == "rename":
                        if ws not in room["players"] or room["phase"] != "lobby":
                            raise ValueError("Troque seu apelido antes de começar a partida.")
                        room["players"][ws]["name"] = nickname(data.get("name", ""), room, ws)
                        await broadcast(room)
                    elif action in ("start", "next"):
                        if room["host"] != ws:
                            raise ValueError("Somente o apresentador controla a partida.")
                        if action == "start" and room["phase"] == "lobby":
                            if not any(p["online"] for p in room["players"].values()):
                                raise ValueError("Aguarde um jogador.")
                            await advance(room)
                        elif action == "next" and room["phase"] == "results":
                            await advance(room)
                    elif action == "answer":
                        choice = data.get("choice")
                        if ws not in room["players"] or room["phase"] != "question" or ws in room["answers"] or time.monotonic() >= room["deadline"]:
                            continue
                        if type(choice) is not int or choice not in range(4):
                            raise ValueError("Resposta inválida.")
                        room["answers"][ws] = choice
                        if choice == room["questions"][room["index"]]["correct"]:
                            room["players"][ws]["score"] += round(500 + 500 * max(0, room["deadline"] - time.monotonic()) / room["duration"])
                        if all(pws in room["answers"] for pws, p in room["players"].items() if p["online"]):
                            room["phase"] = "results"
                        await broadcast(room)
            except (ValueError, TypeError, KeyError) as exc:
                await send(ws, {"type": "error", "message": str(exc)})
    finally:
        account_sessions.pop(ws, None)
        room = sessions.pop(ws, None)
        if room:
            if ws == room["host"]:
                rooms.pop(room["pin"], None)
                for player in list(room["players"]):
                    sessions.pop(player, None)
                    await send(player, {"type": "closed", "message": "O apresentador encerrou a sala."})
            else:
                if room["phase"] == "lobby":
                    room["players"].pop(ws, None)
                else:
                    room["players"][ws]["online"] = False
                if room["phase"] == "question" and all(pws in room["answers"] for pws, p in room["players"].items() if p["online"]):
                    room["phase"] = "results"
                await broadcast(room)

async def serve_http(connection, request):
    if request.headers.get("Upgrade", "").lower() == "websocket":
        return None
    path = unquote(urlsplit(request.path).path)
    if path not in PUBLIC_PATHS:
        return connection.respond(404, "Arquivo n?o encontrado.\n")
    file = Path(__file__).resolve().parent / ("index.html" if path == "/" else path[1:])
    try:
        body = await asyncio.to_thread(file.read_bytes)
    except OSError:
        return connection.respond(404, "Arquivo n?o encontrado.\n")
    from websockets.datastructures import Headers
    from websockets.http11 import Response
    content_type = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
    return Response(200, "OK", Headers({"Content-Type": content_type, "Content-Length": str(len(body)), "Connection": "close"}), body)

async def main():
    print("Abra http://localhost:8000. Na mesma rede, use http://IP-DO-COMPUTADOR:8000")
    async with websockets.serve(handler, "0.0.0.0", 8000, process_request=serve_http, max_size=12 * 1024 * 1024):
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
