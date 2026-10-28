"""Refresh the generated corpus and index it in local Chroma using DashScope embeddings."""

from __future__ import annotations

import argparse
import json

from backend import build_knowledge_base, rag_store


def main() -> None:
    parser = argparse.ArgumentParser(description="建立黑夜君临 Chroma 知识库")
    parser.add_argument("--skip-corpus", action="store_true", help="直接索引现有 JSONL")
    args = parser.parse_args()
    if not args.skip_corpus:
        build_knowledge_base.main()
    print(json.dumps(rag_store.rebuild(), ensure_ascii=False))


if __name__ == "__main__":
    main()
