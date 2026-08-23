import { requireChatGPTUser } from "../../chatgpt-auth";
import CvPrebuildWorkspace from "./cv-prebuild-workspace";

export default async function CvPrebuildPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  await requireChatGPTUser(`/cv-prebuild/${encodeURIComponent(jobId)}`);
  return <CvPrebuildWorkspace jobId={Number(jobId)} />;
}

