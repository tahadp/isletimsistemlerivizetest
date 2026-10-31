#!/usr/bin/env python3
"""Build normalized question data from the versioned source snapshot."""
from __future__ import annotations
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "source-questions.json"
OVERRIDES = ROOT / "data" / "answer-overrides.json"
OUTPUT = ROOT / "dist" / "questions.json"


def strip_markup(value: str) -> str:
    return html.unescape(re.sub(r"<[^>]*>", "", value or "")).strip()


def main() -> None:
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8")) if OVERRIDES.exists() else {}
    questions = []
    for raw in source["questions"]:
        question = {
            "id": raw["id"],
            "unit": raw["unit"],
            "number": raw["number"],
            "type": raw["type"],
            "prompt": strip_markup(raw["promptHtml"]),
            "options": [{"key": option["key"], "text": strip_markup(option["textHtml"])} for option in raw["options"]],
            "acceptedAnswers": list(raw["acceptedAnswers"]),
            "bookAnswer": raw["bookAnswer"],
            "explanation": strip_markup(raw["explanationHtml"]),
            "source": raw["source"],
        }
        if raw.get("conflictNote"):
            question["conflictNote"] = raw["conflictNote"]
        override = overrides.get(question["id"], {})
        if not isinstance(override, dict):
            raise ValueError(f"Override for {question['id']} must be an object")
        forbidden = set(override) - {"acceptedAnswers", "conflictNote"}
        if forbidden:
            raise ValueError(f"Question wording cannot be overridden: {question['id']}: {sorted(forbidden)}")
        question.update(override)
        keys = {option["key"] for option in question["options"]}
        if not question["acceptedAnswers"] or not set(question["acceptedAnswers"]) <= keys:
            raise ValueError(f"Invalid accepted answer for {question['id']}")
        if question["bookAnswer"] not in question["acceptedAnswers"]:
            raise ValueError(f"Book answer must remain accepted: {question['id']}")
        questions.append(question)
    result = {"title": source["title"], "units": source["units"], "questions": questions}
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
