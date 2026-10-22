"""Persistent accounts and owner-scoped quizzes using SQLite."""
import hashlib
import hmac
import json
import re
import secrets
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "data" / "quizlive.db"

def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            salt TEXT NOT NULL, password_hash TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS quizzes (
            id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL,
            title TEXT NOT NULL, duration INTEGER NOT NULL, questions TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    """)
    return db

def password_hash(password, salt):
    return hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 600000).hex()

def authenticate(action, username, password):
    if not isinstance(username, str) or not re.fullmatch(r"[a-zA-Z0-9_.-]{3,24}", username):
        raise ValueError("Usuário: de 3 a 24 letras, números, pontos, traços ou sublinhados.")
    if not isinstance(password, str) or not 6 <= len(password) <= 128:
        raise ValueError("A senha da conta deve ter de 6 a 128 caracteres.")
    db = connect()
    try:
        if action == "register":
            salt = secrets.token_hex(16)
            digest = password_hash(password, salt)
            try:
                with db:
                    cursor = db.execute("INSERT INTO users(username,salt,password_hash) VALUES(?,?,?)", (username, salt, digest))
                return {"id": cursor.lastrowid, "username": username}
            except sqlite3.IntegrityError:
                raise ValueError("Esse nome de usuário já está cadastrado.") from None
        row = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        # Do equal-cost hashing for unknown accounts too.
        digest = password_hash(password, row["salt"] if row else "00" * 16)
        if not row or not hmac.compare_digest(digest, row["password_hash"]):
            raise ValueError("Usuário ou senha incorretos.")
        return {"id": row["id"], "username": row["username"]}
    finally:
        db.close()

def list_quizzes(owner):
    db = connect()
    try:
        return [{"id": r["id"], "title": r["title"], "duration": r["duration"], "count": len(json.loads(r["questions"])), "updated_at": r["updated_at"]} for r in db.execute("SELECT * FROM quizzes WHERE owner_id=? ORDER BY updated_at DESC,id DESC", (owner,))]
    finally:
        db.close()

def get_quiz(owner, quiz_id):
    db = connect()
    try:
        row = db.execute("SELECT * FROM quizzes WHERE id=? AND owner_id=?", (quiz_id, owner)).fetchone()
        if not row:
            raise ValueError("Quiz não encontrado na sua conta.")
        return {"id": row["id"], "title": row["title"], "duration": row["duration"], "questions": json.loads(row["questions"])}
    finally:
        db.close()

def save_quiz(owner, quiz_id, title, duration, questions):
    if not isinstance(title, str) or not 1 <= len(title.strip()) <= 80:
        raise ValueError("Dê ao quiz um título de até 80 caracteres.")
    if quiz_id is not None and type(quiz_id) is not int:
        raise ValueError("Quiz inválido.")
    db = connect()
    try:
        with db:
            if quiz_id is None:
                quiz_id = db.execute("INSERT INTO quizzes(owner_id,title,duration,questions) VALUES(?,?,?,?)", (owner, title.strip(), duration, json.dumps(questions, ensure_ascii=False))).lastrowid
            else:
                cursor = db.execute("UPDATE quizzes SET title=?,duration=?,questions=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=?", (title.strip(), duration, json.dumps(questions, ensure_ascii=False), quiz_id, owner))
                if cursor.rowcount != 1:
                    raise ValueError("Quiz não encontrado na sua conta.")
        return get_quiz(owner, quiz_id)
    finally:
        db.close()
