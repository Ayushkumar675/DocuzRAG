"""Vision agent that creates typed inference evidence."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from core.llm.nvidia_vision import NvidiaVisionClient
from core.schemas import EvidenceRecord


class VisionAgent:
    """Analyze an image and preserve its original evidence identity."""

    def __init__(self, vision_client: NvidiaVisionClient) -> None:
        self.vision_client = vision_client

    def analyze(
        self,
        collection_id: str,
        document_id: str,
        filename: str,
        image_reference: str,
        content: bytes,
        instruction: str,
        page_number: int | None = None,
    ) -> EvidenceRecord:
        result = self.vision_client.analyze_image(content, filename, instruction)
        return EvidenceRecord(
            evidence_id=str(uuid4()),
            collection_id=collection_id,
            document_id=document_id,
            filename=filename,
            page_number=page_number,
            content_type="VISION",
            source_reference=f"{image_reference}#vision",
            score=None,
            text=result,
            image_reference=image_reference,
            section=None,
            metadata={
                "inference": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "instruction_used": instruction,
            },
        )
