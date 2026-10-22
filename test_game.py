"""Integration checks with real WebSocket clients: py test_game.py."""
import asyncio
import json
import websockets
import server

async def receive(ws, phase=None):
    while True:
        data = json.loads(await asyncio.wait_for(ws.recv(), 3))
        if phase is None or data.get("phase") == phase:
            return data

async def emit(ws, **data):
    await ws.send(json.dumps(data))

async def test():
    async with websockets.serve(server.handler, "127.0.0.1", 0) as listener:
        uri = f"ws://127.0.0.1:{listener.sockets[0].getsockname()[1]}"
        async with websockets.connect(uri) as host, websockets.connect(uri) as a, websockets.connect(uri) as b:
            await emit(host, action="create", duration=10, questions=[server.QUESTIONS[0], server.QUESTIONS[1]])
            pin = (await receive(host))["pin"]
            await emit(a, action="join", pin=pin, name="   ")
            assert (await receive(a))["type"] == "error"
            await emit(a, action="join", pin=pin, name="Ana", avatar="https://example.com/photo.jpg")
            assert (await receive(a))["type"] == "error"
            avatar = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="
            await emit(a, action="join", pin=pin, name="Ana", avatar=avatar)
            joined = await receive(a)
            assert joined["avatar"] == avatar and joined["players"][0]["avatar"] == avatar
            await emit(b, action="join", pin=pin, name=" ana ")
            assert (await receive(b))["type"] == "error"
            await emit(b, action="join", pin=pin, name="Beto")
            await receive(b)
            await receive(a)
            await emit(a, action="rename", name="  Ana   Gamer  ")
            assert (await receive(a))["name"] == "Ana Gamer"
            await receive(b)
            await emit(a, action="rename", name="BETO")
            assert (await receive(a))["type"] == "error"
            await emit(a, action="rename", name="Ana")
            await receive(a)
            await receive(b)
            await emit(a, action="start")
            assert (await receive(a))["type"] == "error"
            await emit(host, action="start")
            question = await receive(a, "question")
            assert "correct" not in question
            await emit(a, action="set_avatar", avatar="")
            assert (await receive(a))["type"] == "error"
            await emit(a, action="rename", name="Outro nome")
            assert (await receive(a))["type"] == "error"
            await receive(b, "question")
            await emit(a, action="answer", choice=2)
            first = await receive(a, "question")
            assert 500 <= first["score"] <= 1000
            await emit(a, action="answer", choice=0)
            await emit(b, action="answer", choice=0)
            result = await receive(a, "results")
            assert result["score"] == first["score"] and result["selected"] == 2
            assert result["correct"] == 2
            assert result["players"][0]["avatar"] == avatar
            await emit(host, action="next")
            await receive(a, "question")
            room = server.rooms[pin]
            room["deadline"] = server.time.monotonic() - 1
            await emit(a, action="answer", choice=1)
            await asyncio.sleep(.05)
            assert not room["answers"]
            room["duration"] = .01
            await server.timer(room, room["index"])
            assert (await receive(a, "results"))["selected"] is None
            await emit(host, action="next")
            assert (await receive(a, "finished"))["players"][0]["name"] == "Ana"
            await host.close()
            assert (await receive(a))["type"] == "closed"
            assert pin not in server.rooms
    print("OK: lobby, permissions, scoring, duplicate/late answers, timer, ranking and cleanup")

if __name__ == "__main__":
    asyncio.run(test())
