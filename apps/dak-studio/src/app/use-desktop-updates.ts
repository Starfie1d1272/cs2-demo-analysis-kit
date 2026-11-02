import { useEffect, useRef, useState } from "react";
import { checkForUpdateOnChannel, type UpdateChannel, type UpdateInfo } from "../lib/update";
import { checkForUpdateViaBridge } from "../lib/updater-bridge";
const UPDATE_CHANNEL_KEY = "dak:update-channel";
function initialUpdateChannel(): UpdateChannel {
  return localStorage.getItem(UPDATE_CHANNEL_KEY) === "beta" ? "beta" : "stable";
}

export function useDesktopUpdates({ onError }: { onError: (message: string) => void }) {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [showLatestMsg, setShowLatestMsg] = useState(false);
  const [updateChannel, setUpdateChannel] = useState<UpdateChannel>(initialUpdateChannel);
  const channelRef = useRef(updateChannel);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  const request = useRef(0);
  async function doCheckUpdate() {
    const id = ++request.current;
    const channel = channelRef.current;
    if (timer.current) clearTimeout(timer.current);
    setCheckingUpdate(true);
    setShowLatestMsg(false);
    try {
      // 桌面壳优先走 Python 桥（urllib，无 CORS），dev 退浏览器 fetch。
      const bridge = await checkForUpdateViaBridge(channel);
      if (!mounted.current || id !== request.current) return;
      const info = bridge.checked ? bridge.update : await checkForUpdateOnChannel(channel);
      if (!mounted.current || id !== request.current) return;
      setUpdate(info);
      if (!info) {
        setShowLatestMsg(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setShowLatestMsg(false), 3000);
      }
    } catch (error) {
      if (mounted.current && id === request.current) onError(`检查更新失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (mounted.current && id === request.current) setCheckingUpdate(false);
    }
  }

  function changeUpdateChannel(channel: UpdateChannel) {
    request.current++;
    channelRef.current = channel;
    if (timer.current) clearTimeout(timer.current);
    setCheckingUpdate(false);
    setUpdateChannel(channel);
    localStorage.setItem(UPDATE_CHANNEL_KEY, channel);
    setUpdate(null);
    setShowLatestMsg(false);
  }

  useEffect(() => { mounted.current = true; if (window.pywebview?.api) void doCheckUpdate(); return () => { mounted.current = false; request.current++; if (timer.current) clearTimeout(timer.current); }; }, []);
  return { update, checkingUpdate, dismissedVersion, setDismissedVersion, showLatestMsg, updateChannel, doCheckUpdate, changeUpdateChannel };
}
