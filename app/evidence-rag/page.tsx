import type { Metadata } from "next";
import EvidenceRagClient from "./rag-client";

export const metadata: Metadata = {
  title: "证据 RAG | Job Radar",
  description: "对真实项目事实进行混合召回、模型重排与带来源的问答。",
};

export default function EvidenceRagPage() {
  return <EvidenceRagClient />;
}
