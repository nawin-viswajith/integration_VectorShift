import base64
import json
import os

from dotenv import load_dotenv

load_dotenv()

ENCRYPT_SENSITIVE_DATA = os.getenv("ENCRYPT_SENSITIVE_DATA", "false").lower() == "true"
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "")


def _get_aesgcm():
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    if not ENCRYPTION_KEY:
        raise ValueError("ENCRYPTION_KEY is required when ENCRYPT_SENSITIVE_DATA=true")
    key = base64.urlsafe_b64decode(ENCRYPTION_KEY)
    if len(key) != 32:
        raise ValueError("ENCRYPTION_KEY must decode to 32 bytes for AES-256-GCM")
    return AESGCM(key)


def encrypt_json_payload(payload: dict) -> str:
    if not ENCRYPT_SENSITIVE_DATA:
        return json.dumps(payload)
    aesgcm = _get_aesgcm()
    nonce = os.urandom(12)
    plaintext = json.dumps(payload).encode("utf-8")
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)
    packed = base64.urlsafe_b64encode(nonce + ciphertext).decode("utf-8")
    return f"enc:{packed}"


def decrypt_json_payload(payload_text: str) -> dict:
    if not payload_text:
        return {}
    if not isinstance(payload_text, str):
        return {}
    if not payload_text.startswith("enc:"):
        return json.loads(payload_text)

    aesgcm = _get_aesgcm()
    blob = base64.urlsafe_b64decode(payload_text[4:])
    nonce = blob[:12]
    ciphertext = blob[12:]
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    return json.loads(plaintext.decode("utf-8"))
