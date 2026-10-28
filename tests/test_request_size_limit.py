import asyncio
import unittest

from backend import main


LIMIT = main.MAX_REQUEST_BODY_BYTES


def http_scope(method="POST", path="/api/ai/chat", headers=()):
    return {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "root_path": "",
        "headers": list(headers),
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
        "state": {},
    }


async def run_asgi(app, scope, messages):
    receive_count = 0
    sent = []

    async def receive():
        nonlocal receive_count
        if receive_count >= len(messages):
            raise AssertionError("middleware read beyond the provided request messages")
        message = messages[receive_count]
        receive_count += 1
        return message

    async def send(message):
        sent.append(message)

    await app(scope, receive, send)
    status = next(message["status"] for message in sent if message["type"] == "http.response.start")
    headers = {
        name.lower(): value
        for message in sent if message["type"] == "http.response.start"
        for name, value in message.get("headers", [])
    }
    return status, headers, receive_count


def body_messages(*sizes):
    return [
        {"type": "http.request", "body": b"x" * size, "more_body": index < len(sizes) - 1}
        for index, size in enumerate(sizes)
    ]


class RequestBodyLimitTests(unittest.TestCase):
    def setUp(self):
        self.endpoint_called = False
        self.received_body_size = 0

        async def endpoint(scope, receive, send):
            self.endpoint_called = True
            while True:
                message = await receive()
                if message["type"] == "http.disconnect":
                    return
                self.received_body_size += len(message.get("body", b""))
                if not message.get("more_body", False):
                    break
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b"ok"})

        self.app = main.RequestBodyLimitMiddleware(endpoint)

    def run_request(self, headers=(), messages=()):
        return asyncio.run(run_asgi(self.app, http_scope(headers=headers), list(messages)))

    def test_declared_over_limit_is_rejected_without_reading_or_endpoint(self):
        status, _, receive_count = self.run_request(
            headers=[(b"content-length", str(LIMIT + 1).encode())]
        )
        self.assertEqual(status, 413)
        self.assertEqual(receive_count, 0)
        self.assertFalse(self.endpoint_called)

    def test_declared_exact_limit_is_accepted(self):
        status, _, _ = self.run_request(
            headers=[(b"content-length", str(LIMIT).encode())],
            messages=body_messages(LIMIT - 1, 1),
        )
        self.assertEqual(status, 200)
        self.assertEqual(self.received_body_size, LIMIT)
        self.assertTrue(self.endpoint_called)

    def test_stream_without_content_length_at_limit_is_accepted(self):
        status, _, _ = self.run_request(messages=body_messages(300_000, 450_000))
        self.assertEqual(status, 200)
        self.assertEqual(self.received_body_size, LIMIT)
        self.assertTrue(self.endpoint_called)

    def test_stream_without_content_length_over_limit_is_rejected_before_endpoint(self):
        status, _, receive_count = self.run_request(messages=body_messages(500_000, 250_001))
        self.assertEqual(status, 413)
        self.assertEqual(receive_count, 2)
        self.assertFalse(self.endpoint_called)

    def test_actual_stream_size_is_checked_even_when_declared_length_is_at_limit(self):
        status, _, receive_count = self.run_request(
            headers=[(b"content-length", str(LIMIT).encode())],
            messages=body_messages(500_000, 250_001),
        )
        self.assertEqual(status, 413)
        self.assertEqual(receive_count, 2)
        self.assertFalse(self.endpoint_called)

    def test_cors_preflight_is_not_rejected(self):
        if not main.ALLOWED_ORIGINS:
            self.skipTest("CORS preflight requires at least one configured allowed origin")
        origin = main.ALLOWED_ORIGINS[0].encode()
        scope = http_scope(
            method="OPTIONS",
            headers=[
                (b"origin", origin),
                (b"access-control-request-method", b"POST"),
                (b"access-control-request-headers", b"content-type"),
            ],
        )
        messages = []
        status, headers, receive_count = asyncio.run(run_asgi(main.app, scope, messages))
        self.assertEqual(status, 200)
        self.assertEqual(headers[b"access-control-allow-origin"], origin)
        self.assertEqual(receive_count, 0)


if __name__ == "__main__":
    unittest.main()
