"""Evaluate RAG retrieval against a small, versioned set of expected records."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from backend import rag_store


CASES = Path(__file__).resolve().parent / "knowledge_base" / "evaluation_cases.jsonl"


def load_cases() -> list[dict]:
    with CASES.open(encoding="utf-8") as stream:
        return [json.loads(line) for line in stream if line.strip()]


def evaluate(top_k: int) -> dict:
    cases = load_cases()
    results = []
    reciprocal_ranks = []

    for case in cases:
        hits = rag_store.search(case["question"], limit=top_k)
        retrieved_ids = [str(hit["id"]) for hit in hits]
        expected_ids = set(case["expected_record_ids"])
        rank = next((index + 1 for index, record_id in enumerate(retrieved_ids)
                     if record_id in expected_ids), None)
        reciprocal_ranks.append(1 / rank if rank else 0)
        results.append({
            "case_id": case["case_id"],
            "hit": rank is not None,
            "rank": rank,
            "expected_record_ids": sorted(expected_ids),
            "retrieved_record_ids": retrieved_ids,
        })

    hit_count = sum(result["hit"] for result in results)
    return {
        "case_count": len(results),
        "top_k": top_k,
        "hit_rate": round(hit_count / len(results), 4) if results else 0,
        "mean_reciprocal_rank": round(sum(reciprocal_ranks) / len(reciprocal_ranks), 4)
        if reciprocal_ranks else 0,
        "results": results,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="评估黑夜君临 RAG 检索命中率")
    parser.add_argument("--top-k", type=int, default=10, help="每题检查前 K 条检索结果，默认 10")
    args = parser.parse_args()
    if args.top_k < 1:
        parser.error("--top-k 必须大于 0")

    report = evaluate(args.top_k)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if report["hit_rate"] < 1:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
