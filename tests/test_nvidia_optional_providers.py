from dataclasses import replace
from typing import Any

import httpx

from core.config import get_config
from core.llm.nvidia_reranker import NvidiaRerankerClient
from core.llm.nvidia_vision import NvidiaVisionClient
from core.ingestion.ocr import ocr_available, try_extract_text_from_bytes
from core.retrieval.reranking import FallbackReranker


class _Response:
    def __init__(self, body: dict[str, Any]) -> None:
        self.body = body

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, Any]:
        return self.body


def _configured(**changes: Any):
    return replace(
        get_config(),
        nvidia_api_key="test-key",
        nvidia_reranker_api_key="test-key",
        **changes,
    )


def test_reranker_restores_scores_to_original_passage_order() -> None:
    body = {
        "rankings": [
            {"index": 2, "logit": 4.7},
            {"index": 1, "logit": -6.1},
            {"index": 0, "logit": -7.2},
        ]
    }

    assert NvidiaRerankerClient._parse_scores(body, 3) == [-7.2, -6.1, 4.7]


def test_reranker_client_sends_official_query_and_passages_payload(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []

    def fake_post(url, *, headers, json, timeout):
        calls.append({"url": url, "headers": headers, "json": json, "timeout": timeout})
        return _Response(
            {
                "rankings": [
                    {"index": 1, "logit": 2.0},
                    {"index": 0, "logit": 1.0},
                ]
            }
        )

    monkeypatch.setattr("core.llm.nvidia_reranker.httpx.post", fake_post)
    config = _configured(reranker_model="nvidia/nv-rerankqa-mistral-4b-v3")

    assert NvidiaRerankerClient(config).rerank("What changed?", ["old", "new"]) == [1.0, 2.0]
    assert calls[0]["url"] == config.nvidia_reranker_url
    assert calls[0]["json"] == {
        "model": "nvidia/nv-rerankqa-mistral-4b-v3",
        "query": {"text": "What changed?"},
        "passages": [{"text": "old"}, {"text": "new"}],
        "truncate": "END",
    }


def test_catalog_reranker_model_uses_nvidia_qualified_request_id(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []

    def fake_post(url, *, headers, json, timeout):
        calls.append({"url": url, "json": json})
        return _Response({"rankings": [{"index": 0, "logit": 1.0}]})

    monkeypatch.setattr("core.llm.nvidia_reranker.httpx.post", fake_post)
    config = _configured(reranker_model="llama-nemotron-rerank-vl-1b-v2")

    NvidiaRerankerClient(config).rerank("What changed?", ["new"])

    assert calls[0]["json"]["model"] == "nvidia/llama-nemotron-rerank-vl-1b-v2"


def test_local_tesseract_is_available_and_reports_ocr() -> None:
    from PIL import Image, ImageDraw
    from io import BytesIO

    image = Image.new("RGB", (900, 180), "white")
    ImageDraw.Draw(image).text((30, 50), "DocuzRAG OCR 2026", fill="black")
    output = BytesIO()
    image.save(output, format="PNG")
    assert ocr_available(_configured())
    text, status = try_extract_text_from_bytes(output.getvalue(), "ocr.png", _configured())
    assert status == "complete"
    assert text and "OCR" in text


def test_vision_client_uses_configured_endpoint_and_model(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []

    def fake_post(url, *, headers, json, timeout):
        calls.append({"url": url, "headers": headers, "json": json, "timeout": timeout})
        return _Response({"choices": [{"message": {"content": "A chart."}}]})

    monkeypatch.setattr("core.llm.nvidia_vision.httpx.post", fake_post)
    config = _configured(vision_model="nvidia/nemotron-nano-12b-v2-vl")

    assert NvidiaVisionClient(config).analyze_image(b"image", "chart.png", "Describe it.") == (
        "A chart."
    )
    assert calls[0]["url"] == config.nvidia_vision_url
    assert calls[0]["json"]["model"] == "nvidia/nemotron-nano-12b-v2-vl"
    assert calls[0]["json"]["messages"][1]["content"][1]["type"] == "image_url"


def test_vision_client_falls_back_after_primary_timeout(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []

    def fake_post(url, *, headers, json, timeout):
        calls.append({"url": url, "json": json, "timeout": timeout})
        if len(calls) == 1:
            raise httpx.ReadTimeout("primary vision model timed out")
        return _Response({"choices": [{"message": {"content": "A dog."}}]})

    monkeypatch.setattr("core.llm.nvidia_vision.httpx.post", fake_post)
    config = _configured(
        vision_model="primary-vision",
        vision_fallback_model="fallback-vision",
        vision_timeout_seconds=7.0,
    )

    assert NvidiaVisionClient(config).analyze_image(b"image", "dog.jpg", "Identify it.") == "A dog."
    assert [call["json"]["model"] for call in calls] == ["primary-vision", "fallback-vision"]
    assert all(call["timeout"] == 7.0 for call in calls)


def test_reranker_falls_back_when_provider_is_unavailable() -> None:
    class FailingReranker:
        def rerank(self, query: str, documents: list[str]) -> list[float]:
            raise RuntimeError("provider unavailable")

    assert FallbackReranker(FailingReranker()).rerank("new", ["old", "new"]) == [0.0, 1.0]
