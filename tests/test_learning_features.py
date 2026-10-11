from dataclasses import replace
from types import SimpleNamespace
from uuid import uuid4

import pytest

from core.learning.models import GenerateRequest, Question
from core.learning.service import LearningService
from core.learning.validation import LearningError, validate_structure
from core.retrieval.query import RetrievedEvidence
from core.schemas import DocumentRecord, EvidenceRecord
from core.storage.metadata_store import MetadataStore


def _fixture(tmp_path):
    store = MetadataStore(tmp_path / "metadata.db")
    collection = store.create_collection("Learning fixtures")
    document = DocumentRecord(
        id=str(uuid4()), collection_id=collection.id, filename="guide.txt", file_type="txt",
        size=100, page_count=None, status="processed", created_at=collection.created_at,
        storage_path="guide.txt",
    )
    store.add_document(document)
    evidence = EvidenceRecord(
        evidence_id=str(uuid4()), collection_id=collection.id, document_id=document.id,
        filename=document.filename, page_number=1, content_type="TEXT",
        source_reference="document:guide.txt#page=1", score=None,
        text="Supervised learning uses labelled examples to learn a mapping from inputs to outputs.",
        image_reference=None, section="Supervised learning", metadata={},
    )
    store.add_evidence(evidence)
    return store, collection, document, evidence


def _config():
    return SimpleNamespace(
        reasoning_model="test-model", learning_max_cards=30, learning_max_questions=20,
        learning_max_nodes=40, learning_max_edges=80, learning_context_chars=16000,
        learning_output_chars=60000,
    )


def test_quiz_schema_rejects_invalid_and_ambiguous_options():
    with pytest.raises(ValueError):
        Question(
            id="q1", type="single_choice", question="Which?", options=["A", "B"],
            correct_answer=2, explanation="Because.", source_evidence_ids=["e1"],
        )
    with pytest.raises(ValueError):
        Question(
            id="q1", type="true_false", question="True?", options=["True", "true"],
            correct_answer=0, explanation="Because.", source_evidence_ids=["e1"],
        )


def test_graph_edges_and_topic_parent_cycles_are_rejected(tmp_path):
    store, collection, _, evidence = _fixture(tmp_path)
    config = _config()
    with pytest.raises(LearningError, match="missing concept"):
        validate_structure(
            "knowledge-graph",
            {"title": "Graph", "nodes": [{"id": "a", "name": "A", "description": "A concept", "status": "explicit", "source_evidence_ids": [evidence.evidence_id]}],
             "edges": [{"id": "edge", "source_node_id": "a", "target_node_id": "b", "relation": "uses", "status": "inferred", "source_evidence_ids": [evidence.evidence_id]}]},
            [RetrievedEvidence(evidence, 1.0)], GenerateRequest(collection_id=collection.id), config,
        )
    with pytest.raises(LearningError, match="cycle"):
        validate_structure(
            "topic-tree",
            {"title": "Topics", "nodes": [
                {"id": "a", "parent_id": "b", "title": "A", "summary": "A supported summary.", "inferred": True, "source_evidence_ids": [evidence.evidence_id]},
                {"id": "b", "parent_id": "a", "title": "B", "summary": "B supported summary.", "inferred": True, "source_evidence_ids": [evidence.evidence_id]},
            ]},
            [RetrievedEvidence(evidence, 1.0)], GenerateRequest(collection_id=collection.id), config,
        )


def test_quiz_submission_is_deterministic_and_answers_are_hidden(tmp_path):
    store, collection, document, evidence = _fixture(tmp_path)
    scope = [document.id]
    source_version = store.learning_source_version(collection.id, scope)
    payload = {
        "content": {"title": "Quiz", "questions": [{
            "id": "q1", "type": "single_choice", "question": "Which mapping is learned?",
            "options": ["inputs to outputs", "outputs to inputs"], "correct_answer": 0,
            "explanation": "The guide describes a mapping from inputs to outputs.",
            "source_evidence_ids": [evidence.evidence_id],
        }]},
        "parameters": {"topic": "supervised learning", "difficulty": "easy", "level": "beginner", "count": 1, "format": "quick_revision"},
        "source_evidence_ids": [evidence.evidence_id], "source_version": source_version,
        "cache_key": "test", "warnings": [],
    }
    artifact = store.save_learning_artifact(collection.id, "quizzes", payload, scope)
    service = LearningService(store, object(), object(), _config())
    public = service.get(collection.id, artifact["id"], scope)
    assert "correct_answer" not in public["content"]["questions"][0]
    result = service.submit(collection.id, artifact["id"], {"q1": 0}, scope)
    assert result["score"] == 1
    assert result["percentage"] == 100.0
    assert result["review"][0]["correct"] is True


def test_artifact_scope_isolation_rejects_an_unselected_document(tmp_path):
    store, collection, document, evidence = _fixture(tmp_path)
    other = replace(document, id=str(uuid4()), filename="other.txt", storage_path="other.txt")
    store.add_document(other)
    scope = [document.id]
    payload = {
        "content": {"title": "Notes", "sections": [{"id": "s1", "heading": "Source", "content": "Supported notes.", "source_evidence_ids": [evidence.evidence_id]}]},
        "parameters": {"topic": "", "format": "quick_revision", "difficulty": "medium", "level": "beginner", "count": 1},
        "source_evidence_ids": [evidence.evidence_id], "source_version": store.learning_source_version(collection.id, scope),
        "cache_key": "test", "warnings": [],
    }
    artifact = store.save_learning_artifact(collection.id, "cheat-sheet", payload, scope)
    service = LearningService(store, object(), object(), _config())
    with pytest.raises(LearningError, match="outside"):
        service.get(collection.id, artifact["id"], [other.id])


def test_lesson_json_repair_and_schema_conformance():
    from core.learning.json_repair import extract_and_repair_json, sanitize_lesson_dict
    from core.learning.models import Lesson

    # Malformed JSON with markdown fences, trailing commas, missing value at column 19, and None
    malformed_json = """```json
    {
      "title": "Quantum Key Distribution",
      "learning_objectives": ["Understand BB84 protocol", "Analyze security", ],
      "lesson_sections": [
        {
          "id": "s1",
          "heading": "BB84 Basics",
          "content": "Alice transmits polarized photons to Bob.",
          "source_evidence_ids": ["ev-1"],
        }
      ],
      "examples": None,
      "understanding_checks": [
        {
          "id": "c1",
          "type": "single_choice",
          "question": "What is transmitted?",
          "options": ["Photons", "Electrons", ],
          "correct_answer": 0,
          "explanation": ,
          "source_evidence_ids": ["ev-1"]
        }
      ]
    }
    ```"""
    parsed = extract_and_repair_json(malformed_json)
    assert parsed["title"] == "Quantum Key Distribution"
    sanitized = sanitize_lesson_dict(parsed, ["ev-1"], "Quantum Key Distribution")
    lesson = Lesson.model_validate(sanitized)
    assert lesson.title == "Quantum Key Distribution"
    assert len(lesson.learning_objectives) == 2
    assert len(lesson.lesson_sections) == 1
    assert len(lesson.understanding_checks) == 1
    assert lesson.understanding_checks[0].explanation != ""


def test_quiz_json_repair_and_question_types():
    from core.learning.json_repair import sanitize_quiz_dict
    from core.learning.models import Quiz

    data = {
        "title": "Machine Learning Assessment",
        "questions": [
            {
                "id": "q1",
                "type": "single_choice",
                "question": "What is overfitting?",
                "options": ["High variance on test data", "Perfect generalization", "Underfitting alternative", "No error"],
                "correct_answer": 0,
                "explanation": "Overfitting models noise.",
                "source_evidence_ids": ["ev-1"],
            },
            {
                "id": "q2",
                "type": "true_false",
                "question": "Linear regression models non-linear relations natively.",
                "options": ["True", "False"],
                "correct_answer": 1,
                "explanation": "Linear regression fits a linear hyperplane.",
                "source_evidence_ids": ["ev-1"],
            },
        ],
    }
    sanitized = sanitize_quiz_dict(data, ["ev-1"], "Machine Learning")
    quiz = Quiz.model_validate(sanitized)
    assert len(quiz.questions) == 2
    assert quiz.questions[0].type == "single_choice"
    assert len(quiz.questions[0].options) == 4
    assert quiz.questions[1].type == "true_false"
    assert quiz.questions[1].options == ["True", "False"]


def test_multi_document_equal_outputs_for_flashcards(tmp_path):
    store = MetadataStore(tmp_path / "metadata.db")
    collection = store.create_collection("Multi-doc collection")
    doc1 = DocumentRecord(
        id=str(uuid4()), collection_id=collection.id, filename="doc1.txt", file_type="txt",
        size=100, page_count=None, status="processed", created_at=collection.created_at,
        storage_path="doc1.txt",
    )
    doc2 = DocumentRecord(
        id=str(uuid4()), collection_id=collection.id, filename="doc2.txt", file_type="txt",
        size=100, page_count=None, status="processed", created_at=collection.created_at,
        storage_path="doc2.txt",
    )
    store.add_document(doc1)
    store.add_document(doc2)
    ev1 = EvidenceRecord(
        evidence_id=str(uuid4()), collection_id=collection.id, document_id=doc1.id,
        filename=doc1.filename, page_number=1, content_type="TEXT",
        source_reference="doc1.txt#p1", score=None, text="Doc 1 explains concept Alpha.",
        image_reference=None, section="Alpha", metadata={},
    )
    ev2 = EvidenceRecord(
        evidence_id=str(uuid4()), collection_id=collection.id, document_id=doc2.id,
        filename=doc2.filename, page_number=1, content_type="TEXT",
        source_reference="doc2.txt#p1", score=None, text="Doc 2 explains concept Beta.",
        image_reference=None, section="Beta", metadata={},
    )
    store.add_evidence(ev1)
    store.add_evidence(ev2)

    class MockRetriever:
        def retrieve(self, collection_id, question, selected_document_ids, top_k):
            if doc1.id in selected_document_ids:
                return [RetrievedEvidence(ev1, 1.0)]
            return [RetrievedEvidence(ev2, 1.0)]

    class MockReasoner:
        def structured(self, instruction, context, schema, max_tokens=6000):
            import json
            if "assessments" in schema.get("properties", {}):
                # Return review assessments
                task_data = json.loads(instruction.split("Task data follows as JSON:\n")[1])
                assessments = [
                    {"id": item["id"], "supported": True, "unambiguous": True, "option_correct": []}
                    for item in task_data["items"]
                ]
                return json.dumps({"assessments": assessments})

            # If doc1 is in context
            if "doc1" in context:
                return json.dumps({
                    "title": "Cards",
                    "cards": [
                        {"id": "c1", "question": "What is Alpha?", "answer": "Concept Alpha.", "explanation": "Doc 1 explains concept Alpha.", "source_evidence_ids": [ev1.evidence_id]},
                        {"id": "c2", "question": "Why Alpha?", "answer": "For Alpha.", "explanation": "Doc 1 explains concept Alpha.", "source_evidence_ids": [ev1.evidence_id]},
                    ],
                })
            else:
                return json.dumps({
                    "title": "Cards",
                    "cards": [
                        {"id": "c1", "question": "What is Beta?", "answer": "Concept Beta.", "explanation": "Doc 2 explains concept Beta.", "source_evidence_ids": [ev2.evidence_id]},
                        {"id": "c2", "question": "Why Beta?", "answer": "For Beta.", "explanation": "Doc 2 explains concept Beta.", "source_evidence_ids": [ev2.evidence_id]},
                    ],
                })

    service = LearningService(store, MockRetriever(), MockReasoner(), _config())
    req = GenerateRequest(collection_id=collection.id, selected_document_ids=[doc1.id, doc2.id], count=4)
    res = service.generate(collection.id, "flashcards", req)
    cards = res["content"]["cards"]
    assert len(cards) == 4
    # Equal outputs from both documents: 2 from doc1, 2 from doc2
    doc1_cards = [c for c in cards if c["id"].startswith("b0-")]
    doc2_cards = [c for c in cards if c["id"].startswith("b1-")]
    assert len(doc1_cards) == 2
    assert len(doc2_cards) == 2


