import { RivalHubHttpError } from "@cs2dak/rivalhub-upload";
export function explainError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = error instanceof RivalHubHttpError ? error.status : null;
  const code = status ? `HTTP_${status}` : /^([A-Z][A-Z_]+)[：:]/.exec(message)?.[1] ?? "UPLOAD_FAILED";
  let action = "请重试此项；如果仍然失败，截图并导出日志交给管理员。";
  if (status === 404) action = "网站地址没有对应的 RivalHub 上传接口。检查是否填入站点主地址（例如 https://match.starfie1d.top），再重新连接。";
  else if (status === 400 || status === 422 || status === 409) action = "RivalHub 拒绝了这份数据。打开网站检查对应比赛、地图、比分与选手名单；保留错误代码交给管理员。";
  else if (status === 401 || status === 403) action = "点击“更换连接”重新授权；403 请确认网站账号具有该赛事的上传权限。";
  else if (code.startsWith("TARGET")) action = "打开 RivalHub，在对应赛事核对比赛、地图、比分和选手名单，然后回到这里重试。";
  else if (status === 413) action = "网站拒绝了过大的数据，请将诊断编号发给管理员检查上传限制。";
  else if (status === 429 || (status && status >= 500) || code === "NETWORK") action = "检查网络和网站是否可访问，稍后重试。重复提交不会重复入库。";
  else if (code === "PARSE_FAILED" || code === "DEMO_CHANGED") action = "确认 Demo 已录制或下载完成，文件未损坏；重新下载完整 .dem 后再选一次。";
  else if (message.includes("Core QA")) action = "这份 Demo 未通过数据校验。请保留原始 .dem，将错误详情和日志交给管理员，不要修改比分绕过校验。";
  else if (code === "STATUS_UNCONFIRMED") action = "打开 RivalHub 查看该场是否已同步；稍后重试会先检查网站状态。";
  return { code, message, action };
}
