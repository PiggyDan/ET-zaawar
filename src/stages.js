/** Display names and tones for the workflow stages (api/_workflow.js STAGES). */
export const STAGE_LABELS = {
  waiting_travel: ["Аялагч хүлээж буй", "wait"],
  waiting_mechanic: ["Механикийн үзлэг хүлээж буй", "wait"],
  code_expired: ["Кодын хугацаа дууссан", "muted"],
  inspection_failed: ["Үзлэгт тэнцээгүй", "bad"],
  waiting_approval: ["Батлах хүлээж буй", "wait"],
  rejected: ["Татгалзсан", "bad"],
  approved: ["Батлагдсан, имэйл илгээгдээгүй", "wait"],
  sent: ["Батлагдаж илгээгдсэн", "good"]
};

export const stageLabel = (stage) => STAGE_LABELS[stage]?.[0] || stage;
export const stageTone = (stage) => STAGE_LABELS[stage]?.[1] || "muted";
